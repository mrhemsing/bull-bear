#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';

const projectRoot = process.cwd();
const auditLatestPath = path.join(projectRoot, 'data', 'generated', 'runtime-capture-audit', 'latest.json');
const operatorStatusDir = path.join(projectRoot, 'data', 'generated', 'operator-status');
const operatorStatusLatestPath = path.join(operatorStatusDir, 'latest.json');
const operatorStatusLatestTextPath = path.join(operatorStatusDir, 'latest.txt');
const operatorStatusLatestMarkdownPath = path.join(operatorStatusDir, 'latest.md');
const operatorStatusHistoryPath = path.join(operatorStatusDir, 'history.ndjson');
const operatorStatusTrendSampleSize = 5;
const defaultOperatorSnapshotStaleThresholdHours = 2;
const defaultCaptureBaseUrl = process.env.BULL_BEAR_APP_URL?.trim() || 'http://127.0.0.1:3078';

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parseArgs(argv) {
  const options = {
    json: false,
    record: false,
    failOnWatch: false,
    runStaleHours: null,
    auditStaleHours: 6,
    snapshotStaleHours: (() => {
      const parsed = Number.parseFloat(process.env.BULL_BEAR_OPERATOR_SNAPSHOT_STALE_HOURS ?? '');
      return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultOperatorSnapshotStaleThresholdHours;
    })(),
    url: process.env.OPENCLAW_GATEWAY_URL?.trim() || null,
    token: process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || null,
    name: process.env.BULL_BEAR_CRON_NAME?.trim() || null,
    captureUrl: process.env.BULL_BEAR_CAPTURE_URL?.trim() || `${defaultCaptureBaseUrl.replace(/\/$/, '')}/api/capture`,
    passThroughFlags: []
  };

  for (const arg of argv) {
    if (arg === '--json') {
      options.json = true;
      continue;
    }

    if (arg === '--record') {
      options.record = true;
      continue;
    }

    if (arg === '--fail-on-watch') {
      options.failOnWatch = true;
      continue;
    }

    const [flag, rawValue] = arg.split('=', 2);
    const value = rawValue?.trim();

    if (flag === '--audit-stale-hours' && value) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.auditStaleHours = parsed;
      }
      continue;
    }

    if (flag === '--run-stale-hours' && value) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.runStaleHours = parsed;
        options.passThroughFlags.push(`--stale-hours=${parsed}`);
      }
      continue;
    }

    if (flag === '--snapshot-stale-hours' && value) {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.snapshotStaleHours = parsed;
      }
      continue;
    }

    if (flag === '--url' && value) {
      options.url = value;
      options.passThroughFlags.push(arg);
      continue;
    }

    if (flag === '--token' && value) {
      options.token = value;
      options.passThroughFlags.push(arg);
      continue;
    }

    if (flag === '--name' && value) {
      options.name = value;
      options.passThroughFlags.push(arg);
      continue;
    }

    if (flag === '--capture-url' && value) {
      options.captureUrl = value;
      continue;
    }

    options.passThroughFlags.push(arg);
  }

  return options;
}

function runJson(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: projectRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32'
    });

    let stdout = '';
    let stderr = '';

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', reject);
    child.on('exit', (code) => {
      try {
        const parsed = JSON.parse(stdout);
        if (code !== 0 && parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          parsed.__nonZeroExitCode = code;
        }
        resolve(parsed);
        return;
      } catch {
        // Fall through to the normal non-JSON error handling below.
      }

      if (code !== 0) {
        reject(new Error(`Command exited with code ${code ?? 'unknown'}${stderr ? `\n${stderr.trim()}` : ''}`));
        return;
      }

      reject(new Error(`Failed to parse JSON output from ${command} ${args.join(' ')}.\n${stdout}${stderr ? `\n${stderr}` : ''}`));
    });
  });
}

async function readOptionalJson(filePath) {
  try {
    const raw = await fs.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return null;
    }
    throw error;
  }
}

function buildLevelCounts(entries) {
  return entries.reduce((counts, entry) => {
    const level = entry?.overall?.level ?? 'unknown';
    counts[level] = (counts[level] ?? 0) + 1;
    return counts;
  }, {});
}

function buildCurrentStreak(entries) {
  if (entries.length === 0) {
    return {
      level: null,
      count: 0,
      sinceCheckedAt: null
    };
  }

  const lastEntry = entries[entries.length - 1];
  const streakLevel = lastEntry?.overall?.level ?? 'unknown';
  let count = 0;
  let sinceCheckedAt = lastEntry?.checkedAt ?? null;

  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    const level = entry?.overall?.level ?? 'unknown';
    if (level !== streakLevel) break;
    count += 1;
    sinceCheckedAt = entry?.checkedAt ?? sinceCheckedAt;
  }

  return {
    level: streakLevel,
    count,
    sinceCheckedAt
  };
}

async function readHistorySummary() {
  try {
    const raw = await fs.readFile(operatorStatusHistoryPath, 'utf8');
    const entries = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => {
        try {
          return JSON.parse(line);
        } catch {
          return null;
        }
      })
      .filter(Boolean);

    const recentEntries = entries.slice(-operatorStatusTrendSampleSize);
    const recentLevels = recentEntries.map((entry) => ({
      checkedAt: entry.checkedAt ?? null,
      level: entry.overall?.level ?? 'unknown'
    }));

    const previous = recentLevels.length > 0 ? recentLevels[recentLevels.length - 1] : null;

    return {
      sampleSize: operatorStatusTrendSampleSize,
      historyEntryCount: entries.length,
      previousLevel: previous?.level ?? null,
      previousCheckedAt: previous?.checkedAt ?? null,
      levelChanged: false,
      recentLevels,
      recentLevelCounts: buildLevelCounts(recentEntries),
      currentStreak: buildCurrentStreak(entries)
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        sampleSize: operatorStatusTrendSampleSize,
        historyEntryCount: 0,
        previousLevel: null,
        previousCheckedAt: null,
        levelChanged: false,
        recentLevels: [],
        recentLevelCounts: {},
        currentStreak: {
          level: null,
          count: 0,
          sinceCheckedAt: null
        }
      };
    }
    throw error;
  }
}

function renderMarkdownSummary(summary) {
  const lines = [
    `# Bull Bear operator status: ${summary.overall.level}`,
    '',
    `- Checked at: ${summary.checkedAt}`,
    `- Recorded snapshot freshness: ${summary.snapshotFreshness?.verdict ?? 'unknown'} - ${summary.snapshotFreshness?.reason ?? 'Recorded operator snapshot freshness is unavailable.'}${summary.snapshotFreshness?.age ? ` | age ${summary.snapshotFreshness.age}` : ''}${summary.snapshotFreshness?.staleThresholdHours ? ` | stale threshold ${summary.snapshotFreshness.staleThresholdHours}h` : ''}`,
    `- Runtime health: ${summary.runtimeHealth.level} - ${summary.runtimeHealth.summary}`,
    `- Cron artifact: ${summary.cronArtifact.valid ? 'valid' : 'invalid'}`,
    `- Installed cron matches: ${summary.installedCron.matchCount}`,
    `- Installed cron run health: ${summary.installedCron.runHealth?.verdict ?? 'unknown'}${summary.installedCron.runHealth?.reason ? ` - ${summary.installedCron.runHealth.reason}` : ''}${summary.installedCron.runHealth?.latestRunAge ? ` | latest run age ${summary.installedCron.runHealth.latestRunAge}` : ''}${summary.installedCron.runHealth?.staleThresholdHours ? ` | stale threshold ${summary.installedCron.runHealth.staleThresholdHours}h` : ''}`,
    summary.installedCron.latestRun
      ? `- Latest installed cron run: ${summary.installedCron.latestRun.status} @ ${summary.installedCron.latestRun.startedAt ?? 'unknown time'}${summary.installedCron.latestRun.finishedAt ? ` | finished ${summary.installedCron.latestRun.finishedAt}` : ''}${summary.installedCron.latestRun.durationMs !== null && summary.installedCron.latestRun.durationMs !== undefined ? ` | duration ${formatAge(summary.installedCron.latestRun.durationMs)}` : ''}${summary.installedCron.latestRun.text ? ` | ${summary.installedCron.latestRun.text}` : ''}`
      : '- Latest installed cron run: unavailable',
    summary.latestCaptureAudit
      ? `- Latest capture audit: ${summary.auditHealth.verdict} - ${summary.auditHealth.reason}${summary.auditHealth.age ? ` | age ${summary.auditHealth.age}` : ''}${summary.auditHealth.staleThresholdHours ? ` | stale threshold ${summary.auditHealth.staleThresholdHours}h` : ''} | ${summary.latestCaptureAudit.capturedAt} | HTTP ${summary.latestCaptureAudit.httpStatus ?? 'unknown'} | ok=${summary.latestCaptureAudit.ok ?? 'unknown'} | state ${summary.latestCaptureAudit.stateId ?? 'unknown'} (${summary.latestCaptureAudit.stateLabel ?? 'unknown'}) | provider ${summary.latestCaptureAudit.provider ?? 'unknown'} | shouldPersist=${summary.latestCaptureAudit.shouldPersist ?? 'unknown'}${summary.latestCaptureAudit.error ? ` | error: ${summary.latestCaptureAudit.error}` : ''}`
      : `- Latest capture audit: ${summary.auditHealth.verdict} - ${summary.auditHealth.reason}${summary.auditHealth.staleThresholdHours ? ` | stale threshold ${summary.auditHealth.staleThresholdHours}h` : ''}`
  ];

  if (summary.overall.issues.length > 0) {
    lines.push('', '## Issues');
    for (const issue of summary.overall.issues) lines.push(`- ${issue}`);
  }

  if (summary.overall.warnings.length > 0) {
    lines.push('', '## Warnings');
    for (const warning of summary.overall.warnings) lines.push(`- ${warning}`);
  }

  if (summary.nextActions.length > 0) {
    lines.push('', '## Next actions');
    for (const action of summary.nextActions) {
      lines.push(`- **${action.priority}** (${action.area}) ${action.reason}`);
      lines.push(`  - Command: \`${action.command}\``);
    }
  }

  if (summary.historySummary) {
    lines.push('', '## Recent trend');
    lines.push(`- Previous recorded level: ${summary.historySummary.previousLevel ?? 'none'}${summary.historySummary.previousCheckedAt ? ` @ ${summary.historySummary.previousCheckedAt}` : ''}`);
    lines.push(`- Level changed on this run: ${summary.historySummary.levelChanged ? 'yes' : 'no'}`);
    lines.push(`- Recent levels: ${summary.historySummary.recentLevels.map((entry) => `${entry.level}${entry.checkedAt ? ` (${entry.checkedAt})` : ''}`).join(' -> ') || 'none yet'}`);
    lines.push(`- Recent level counts: ${Object.entries(summary.historySummary.recentLevelCounts ?? {}).map(([level, count]) => `${level}=${count}`).join(', ') || 'none yet'}`);
    lines.push(`- Current streak: ${summary.historySummary.currentStreak?.count ? `${summary.historySummary.currentStreak.level} x${summary.historySummary.currentStreak.count}${summary.historySummary.currentStreak.sinceCheckedAt ? ` since ${summary.historySummary.currentStreak.sinceCheckedAt}` : ''}` : 'none yet'}`);
  }

  if (summary.artifactPaths) {
    lines.push('', '## Recorded operator snapshot');
    lines.push(`- JSON: \`${summary.artifactPaths.latest.path}\` (${summary.artifactPaths.latest.sizeHuman}, updated ${summary.artifactPaths.latest.updatedAt})`);
    lines.push(`- Text: \`${summary.artifactPaths.latestText.path}\` (${summary.artifactPaths.latestText.sizeHuman}, updated ${summary.artifactPaths.latestText.updatedAt})`);
    lines.push(`- Markdown: \`${summary.artifactPaths.latestMarkdown.path}\` (${summary.artifactPaths.latestMarkdown.sizeHuman}, updated ${summary.artifactPaths.latestMarkdown.updatedAt})`);
    lines.push(`- History: \`${summary.artifactPaths.history.path}\` (${summary.artifactPaths.history.sizeHuman}, updated ${summary.artifactPaths.history.updatedAt})`);
  }

  return lines.join('\n');
}

function renderConsoleSummary(summary) {
  const lines = [
    `Bull Bear operator status: ${summary.overall.level}`,
    `Recorded snapshot freshness: ${summary.snapshotFreshness?.verdict ?? 'unknown'} - ${summary.snapshotFreshness?.reason ?? 'Recorded operator snapshot freshness is unavailable.'}${summary.snapshotFreshness?.age ? ` | age ${summary.snapshotFreshness.age}` : ''}${summary.snapshotFreshness?.staleThresholdHours ? ` | stale threshold ${summary.snapshotFreshness.staleThresholdHours}h` : ''}`,
    `Runtime health: ${summary.runtimeHealth.level} - ${summary.runtimeHealth.summary}`,
    `Cron artifact: ${summary.cronArtifact.valid ? 'valid' : 'invalid'}`,
    `Installed cron matches: ${summary.installedCron.matchCount}`,
    `Installed cron run health: ${summary.installedCron.runHealth?.verdict ?? 'unknown'}${summary.installedCron.runHealth?.reason ? ` - ${summary.installedCron.runHealth.reason}` : ''}${summary.installedCron.runHealth?.latestRunAge ? ` | latest run age ${summary.installedCron.runHealth.latestRunAge}` : ''}${summary.installedCron.runHealth?.staleThresholdHours ? ` | stale threshold ${summary.installedCron.runHealth.staleThresholdHours}h` : ''}`,
    summary.installedCron.latestRun
      ? `Latest installed cron run: ${summary.installedCron.latestRun.status} @ ${summary.installedCron.latestRun.startedAt ?? 'unknown time'}${summary.installedCron.latestRun.finishedAt ? ` | finished ${summary.installedCron.latestRun.finishedAt}` : ''}${summary.installedCron.latestRun.durationMs !== null && summary.installedCron.latestRun.durationMs !== undefined ? ` | duration ${formatAge(summary.installedCron.latestRun.durationMs)}` : ''}${summary.installedCron.latestRun.text ? ` | ${summary.installedCron.latestRun.text}` : ''}`
      : 'Latest installed cron run: unavailable',
    summary.latestCaptureAudit
      ? `Latest capture audit: ${summary.auditHealth.verdict} - ${summary.auditHealth.reason}${summary.auditHealth.age ? ` | age ${summary.auditHealth.age}` : ''}${summary.auditHealth.staleThresholdHours ? ` | stale threshold ${summary.auditHealth.staleThresholdHours}h` : ''} | ${summary.latestCaptureAudit.capturedAt} | HTTP ${summary.latestCaptureAudit.httpStatus ?? 'unknown'} | ok=${summary.latestCaptureAudit.ok ?? 'unknown'} | state ${summary.latestCaptureAudit.stateId ?? 'unknown'} (${summary.latestCaptureAudit.stateLabel ?? 'unknown'}) | provider ${summary.latestCaptureAudit.provider ?? 'unknown'} | shouldPersist=${summary.latestCaptureAudit.shouldPersist ?? 'unknown'}${summary.latestCaptureAudit.error ? ` | error: ${summary.latestCaptureAudit.error}` : ''}`
      : `Latest capture audit: ${summary.auditHealth.verdict} - ${summary.auditHealth.reason}${summary.auditHealth.staleThresholdHours ? ` | stale threshold ${summary.auditHealth.staleThresholdHours}h` : ''}`
  ];

  if (summary.overall.issues.length > 0) {
    lines.push('Issues:');
    for (const issue of summary.overall.issues) lines.push(`- ${issue}`);
  }

  if (summary.overall.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of summary.overall.warnings) lines.push(`- ${warning}`);
  }

  if (summary.nextActions.length > 0) {
    lines.push('Next actions:');
    for (const action of summary.nextActions) {
      lines.push(`- [${action.priority}] ${action.reason}`);
      lines.push(`  ${action.command}`);
    }
  }

  if (summary.historySummary) {
    lines.push('Recent trend:');
    lines.push(`- previous recorded level: ${summary.historySummary.previousLevel ?? 'none'}${summary.historySummary.previousCheckedAt ? ` @ ${summary.historySummary.previousCheckedAt}` : ''}`);
    lines.push(`- level changed on this run: ${summary.historySummary.levelChanged ? 'yes' : 'no'}`);
    lines.push(`- recent levels: ${summary.historySummary.recentLevels.map((entry) => `${entry.level}${entry.checkedAt ? ` (${entry.checkedAt})` : ''}`).join(' -> ') || 'none yet'}`);
    lines.push(`- recent level counts: ${Object.entries(summary.historySummary.recentLevelCounts ?? {}).map(([level, count]) => `${level}=${count}`).join(', ') || 'none yet'}`);
    lines.push(`- current streak: ${summary.historySummary.currentStreak?.count ? `${summary.historySummary.currentStreak.level} x${summary.historySummary.currentStreak.count}${summary.historySummary.currentStreak.sinceCheckedAt ? ` since ${summary.historySummary.currentStreak.sinceCheckedAt}` : ''}` : 'none yet'}`);
  }

  if (summary.artifactPaths) {
    lines.push('Recorded operator snapshot:');
    lines.push(`- latest: ${summary.artifactPaths.latest.path} (${summary.artifactPaths.latest.sizeHuman}, updated ${summary.artifactPaths.latest.updatedAt})`);
    lines.push(`- latestText: ${summary.artifactPaths.latestText.path} (${summary.artifactPaths.latestText.sizeHuman}, updated ${summary.artifactPaths.latestText.updatedAt})`);
    lines.push(`- latestMarkdown: ${summary.artifactPaths.latestMarkdown.path} (${summary.artifactPaths.latestMarkdown.sizeHuman}, updated ${summary.artifactPaths.latestMarkdown.updatedAt})`);
    lines.push(`- history: ${summary.artifactPaths.history.path} (${summary.artifactPaths.history.sizeHuman}, updated ${summary.artifactPaths.history.updatedAt})`);
  }

  return lines.join('\n');
}

async function describeArtifact(filePath) {
  const stats = await fs.stat(filePath);
  return {
    path: path.relative(projectRoot, filePath),
    sizeBytes: stats.size,
    sizeHuman: formatBytes(stats.size),
    updatedAt: stats.mtime.toISOString()
  };
}

async function recordOperatorStatus(summary) {
  await fs.mkdir(operatorStatusDir, { recursive: true });

  await fs.writeFile(operatorStatusLatestPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await fs.writeFile(operatorStatusLatestTextPath, `${renderConsoleSummary(summary)}\n`, 'utf8');
  await fs.writeFile(operatorStatusLatestMarkdownPath, `${renderMarkdownSummary(summary)}\n`, 'utf8');
  await fs.appendFile(operatorStatusHistoryPath, `${JSON.stringify(summary)}\n`, 'utf8');

  const artifactPaths = {
    dir: path.relative(projectRoot, operatorStatusDir),
    latest: await describeArtifact(operatorStatusLatestPath),
    latestText: await describeArtifact(operatorStatusLatestTextPath),
    latestMarkdown: await describeArtifact(operatorStatusLatestMarkdownPath),
    history: await describeArtifact(operatorStatusHistoryPath)
  };

  const finalizedSummary = {
    ...summary,
    artifactPaths
  };

  await fs.writeFile(operatorStatusLatestPath, `${JSON.stringify(finalizedSummary, null, 2)}\n`, 'utf8');
  await fs.writeFile(operatorStatusLatestTextPath, `${renderConsoleSummary(finalizedSummary)}\n`, 'utf8');
  await fs.writeFile(operatorStatusLatestMarkdownPath, `${renderMarkdownSummary(finalizedSummary)}\n`, 'utf8');

  finalizedSummary.artifactPaths = {
    ...artifactPaths,
    latest: await describeArtifact(operatorStatusLatestPath),
    latestText: await describeArtifact(operatorStatusLatestTextPath),
    latestMarkdown: await describeArtifact(operatorStatusLatestMarkdownPath),
    history: await describeArtifact(operatorStatusHistoryPath)
  };

  await fs.writeFile(operatorStatusLatestPath, `${JSON.stringify(finalizedSummary, null, 2)}\n`, 'utf8');
  await fs.writeFile(operatorStatusLatestTextPath, `${renderConsoleSummary(finalizedSummary)}\n`, 'utf8');
  await fs.writeFile(operatorStatusLatestMarkdownPath, `${renderMarkdownSummary(finalizedSummary)}\n`, 'utf8');

  return finalizedSummary;
}

function parseTimestamp(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  if (!value || typeof value !== 'string') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && /^\d+$/.test(value.trim())) {
    return numeric;
  }

  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

function formatAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function getSnapshotFreshness(checkedAt, staleHours = defaultOperatorSnapshotStaleThresholdHours) {
  const checkedAtMs = parseTimestamp(checkedAt ?? null);
  if (checkedAtMs === null) {
    return {
      verdict: 'unknown',
      reason: 'Recorded operator snapshot time is unavailable.',
      ageMs: null,
      age: null,
      staleThresholdHours: staleHours
    };
  }

  const ageMs = Math.max(0, Date.now() - checkedAtMs);
  const age = formatAge(ageMs);
  const staleThresholdMs = staleHours * 60 * 60 * 1000;

  if (ageMs > staleThresholdMs) {
    return {
      verdict: 'stale',
      reason: `Recorded operator snapshot is older than the ${staleHours}h freshness threshold (${age} old).`,
      ageMs,
      age,
      staleThresholdHours: staleHours
    };
  }

  return {
    verdict: 'fresh',
    reason: `Recorded operator snapshot was refreshed ${age} ago.`,
    ageMs,
    age,
    staleThresholdHours: staleHours
  };
}

function classifyAuditHealth(latestAudit, staleHours = 6) {
  if (!latestAudit) {
    return {
      verdict: 'missing',
      reason: 'No capture-audit artifact has been recorded yet.',
      ageMs: null,
      age: null,
      staleThresholdHours: staleHours
    };
  }

  if (latestAudit.error) {
    return {
      verdict: 'error',
      reason: `Latest capture audit recorded an error: ${latestAudit.error}`,
      ageMs: null,
      age: null,
      staleThresholdHours: staleHours
    };
  }

  const capturedAtMs = parseTimestamp(latestAudit.capturedAt ?? null);
  const ageMs = capturedAtMs === null ? null : Math.max(0, Date.now() - capturedAtMs);
  const staleThresholdMs = staleHours * 60 * 60 * 1000;

  if (ageMs !== null && ageMs > staleThresholdMs) {
    return {
      verdict: 'stale',
      reason: `Latest capture audit is older than the ${staleHours}h freshness threshold (${formatAge(ageMs)} old).`,
      ageMs,
      age: formatAge(ageMs),
      staleThresholdHours: staleHours
    };
  }

  return {
    verdict: 'fresh',
    reason: ageMs === null
      ? 'Latest capture audit exists, but its age could not be determined.'
      : `Latest capture audit was recorded ${formatAge(ageMs)} ago.`,
    ageMs,
    age: formatAge(ageMs),
    staleThresholdHours: staleHours
  };
}

function isBenignFlatPeriodRuntimeWarning(runtimeHealth, cronVerification, auditHealth) {
  if (!['WATCH', 'STALE'].includes(runtimeHealth?.level ?? '')) return false;
  if (!/^Latest saved transition is older than \d+h\.?$/i.test(runtimeHealth?.summary ?? '')) return false;

  const runVerdict = cronVerification?.runHealth?.verdict ?? null;
  const auditVerdict = auditHealth?.verdict ?? null;

  return runVerdict === 'healthy' && auditVerdict === 'fresh';
}

function buildOverall(runtimeHealth, cronValidation, cronVerification, auditHealth) {
  const issues = [];
  const warnings = [];
  const benignFlatPeriodRuntimeWarning = isBenignFlatPeriodRuntimeWarning(runtimeHealth, cronVerification, auditHealth);

  if (runtimeHealth.level === 'STALE') {
    if (benignFlatPeriodRuntimeWarning) {
      warnings.push(runtimeHealth.summary);
    } else {
      issues.push(runtimeHealth.summary);
    }
  } else if (runtimeHealth.level !== 'HEALTHY' && !benignFlatPeriodRuntimeWarning) {
    warnings.push(runtimeHealth.summary);
  }

  if (cronValidation.valid !== true) {
    issues.push('Committed cron artifact failed validation.');
  }

  if (cronVerification.errors.length > 0) {
    warnings.push(...cronVerification.errors);
  }

  const benignCronRunHistoryLoadWarning = /^Unable to load cron run history from CLI:/i;
  const runHealthIsAlreadyBackedByRecentLocalProof = cronVerification?.runHealth?.verdict === 'healthy'
    && Array.isArray(cronVerification?.recentRuns?.entries)
    && cronVerification.recentRuns.entries.length > 0;

  if (Array.isArray(cronVerification.warnings) && cronVerification.warnings.length > 0) {
    for (const warning of cronVerification.warnings) {
      if (runHealthIsAlreadyBackedByRecentLocalProof && benignCronRunHistoryLoadWarning.test(warning)) {
        continue;
      }
      warnings.push(warning);
    }
  }

  if (auditHealth.verdict === 'error') {
    warnings.push(auditHealth.reason);
  } else if (auditHealth.verdict === 'stale' || auditHealth.verdict === 'missing') {
    warnings.push(auditHealth.reason);
  }

  const benignWarningPatterns = [
    /^payload\.message uses the known older-CLI compact compatibility text instead of the full committed artifact message\.?$/i,
    /^Latest successful cron run summary is missing a concrete persisted value from \/api\/capture\.?$/i,
    /^Latest saved transition is older than \d+h\.?$/i
  ];
  const hasOnlyBenignCompatibilityWarnings = warnings.length > 0
    && warnings.every((warning) => benignWarningPatterns.some((pattern) => pattern.test(warning)));

  if (issues.length > 0) return { level: 'ATTENTION', issues, warnings };
  if (warnings.length > 0 && !hasOnlyBenignCompatibilityWarnings) return { level: 'WATCH', issues, warnings };
  return { level: 'READY', issues, warnings };
}

function buildNextActions(runtimeHealth, cronValidation, cronVerification, auditHealth, options) {
  const actions = [];
  const quotedInstall = [
    'npm run install:cron -- --apply --verify --audit --status --status-record',
    options.name ? `--name=${JSON.stringify(String(options.name))}` : null,
    options.url ? `--url=${JSON.stringify(String(options.url))}` : null,
    options.token ? `--token=${JSON.stringify(String(options.token))}` : null
  ].filter(Boolean).join(' ');
  const installActionCoversAudit = cronValidation.valid === true && cronVerification.matchCount === 0;

  const quotedVerify = [
    'npm run verify:cron',
    options.name ? `-- --name=${JSON.stringify(String(options.name))}` : null,
    options.url ? `--url=${JSON.stringify(String(options.url))}` : null,
    options.token ? `--token=${JSON.stringify(String(options.token))}` : null,
    options.runStaleHours ? `--stale-hours=${options.runStaleHours}` : null
  ].filter(Boolean).join(' ');

  const quotedVerifyStrict = [
    'npm run verify:cron -- --strict',
    options.name ? `--name=${JSON.stringify(String(options.name))}` : null,
    options.url ? `--url=${JSON.stringify(String(options.url))}` : null,
    options.token ? `--token=${JSON.stringify(String(options.token))}` : null,
    options.runStaleHours ? `--stale-hours=${options.runStaleHours}` : null
  ].filter(Boolean).join(' ');

  const quotedAudit = [
    'npm run audit:capture',
    options.captureUrl ? `-- --url=${JSON.stringify(String(options.captureUrl))}` : null
  ].filter(Boolean).join(' ');

  const quotedStatus = [
    'npm run status:operator -- --record',
    options.name ? `--name=${JSON.stringify(String(options.name))}` : null,
    options.url ? `--url=${JSON.stringify(String(options.url))}` : null,
    options.token ? `--token=${JSON.stringify(String(options.token))}` : null,
    options.runStaleHours ? `--run-stale-hours=${options.runStaleHours}` : null,
    options.auditStaleHours ? `--audit-stale-hours=${options.auditStaleHours}` : null
  ].filter(Boolean).join(' ');

  if (cronValidation.valid !== true) {
    actions.push({
      priority: 'high',
      area: 'cron-artifact',
      command: 'npm run check:cron',
      reason: 'Fix the committed Bull Bear OpenClaw cron artifact before install or verification.'
    });
  }

  if (cronVerification.matchCount === 0) {
    actions.push({
      priority: 'high',
      area: 'scheduler',
      command: quotedInstall,
      reason: 'Install the committed hourly Bull Bear cron job, verify the live install, and write a fresh capture-audit proof artifact.'
    });
  } else if (cronVerification.duplicatesDetected) {
    actions.push({
      priority: 'high',
      area: 'scheduler',
      command: quotedVerifyStrict,
      reason: 'Resolve duplicate installed Bull Bear cron jobs so only one production scheduler remains.'
    });
  } else if (cronVerification.runHealth?.verdict === 'stale' || cronVerification.runHealth?.verdict === 'failing') {
    actions.push({
      priority: 'high',
      area: 'scheduler',
      command: quotedVerify,
      reason: 'Inspect recent Bull Bear scheduler history and latest run health.'
    });
  }

  const schedulerProofWarnings = (cronVerification.warnings ?? []).filter((warning) => warning.includes('Latest successful cron run summary'));
  const hasOnlyPersistedNotReturnedWarning = schedulerProofWarnings.length > 0
    && schedulerProofWarnings.every((warning) => warning.includes('missing a concrete persisted value from /api/capture.'));

  if (schedulerProofWarnings.length > 0 && !hasOnlyPersistedNotReturnedWarning) {
    actions.push({
      priority: 'medium',
      area: 'scheduler-proof',
      command: quotedVerify,
      reason: 'Tighten the installed Bull Bear cron payload/proof path so successful runs echo the exact /api/capture fields instead of degraded null/summary values.'
    });
  }

  if (!installActionCoversAudit && runtimeHealth.level === 'STALE') {
    actions.push({
      priority: 'medium',
      area: 'runtime',
      command: quotedAudit,
      reason: 'Write a fresh capture proof artifact and confirm the local /api/capture route still resolves cleanly.'
    });
  }

  if (!installActionCoversAudit) {
    if (auditHealth.verdict === 'missing') {
      actions.push({
        priority: 'medium',
        area: 'audit',
        command: quotedAudit,
        reason: 'Record the first runtime capture audit artifact for operator proof.'
      });
    } else if (auditHealth.verdict === 'error') {
      actions.push({
        priority: 'medium',
        area: 'audit',
        command: quotedAudit,
        reason: 'Retry the capture audit after the latest recorded audit error.'
      });
    } else if (auditHealth.verdict === 'stale') {
      actions.push({
        priority: 'medium',
        area: 'audit',
        command: quotedAudit,
        reason: 'Refresh the stale capture-audit proof artifact so operator evidence stays current.'
      });
    }
  }

  if (actions.length === 0) {
    actions.push({
      priority: 'low',
      area: 'operator-loop',
      command: quotedStatus,
      reason: 'System looks healthy; keep using the operator snapshot as the routine release check.'
    });
  }

  return actions;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const [runtimeHealth, cronValidation, cronVerification, latestAudit, historySummary] = await Promise.all([
    runJson('node', ['scripts/check-runtime-health.mjs', '--json']),
    runJson('node', ['scripts/check-openclaw-cron-artifact.mjs', '--json']),
    runJson('node', ['scripts/verify-installed-openclaw-cron.mjs', '--json', ...options.passThroughFlags]).catch((error) => ({
      artifactPath: 'docs/openclaw-hourly-capture-cron.json',
      expectedName: 'bull-bear-hourly-capture',
      matchCount: 0,
      duplicatesDetected: false,
      installedJobs: [],
      recentRuns: { inspected: false, total: null, limit: null, entries: [], warnings: [] },
      runHealth: { verdict: 'unknown', reason: error instanceof Error ? error.message : String(error), latestRunAgeMs: null, latestRunAge: null },
      warnings: [],
      errors: [error instanceof Error ? error.message : String(error)]
    })),
    readOptionalJson(auditLatestPath),
    readHistorySummary()
  ]);

  const auditHealth = classifyAuditHealth(latestAudit, options.auditStaleHours);
  const overall = buildOverall(runtimeHealth, cronValidation, cronVerification, auditHealth);
  const nextActions = buildNextActions(runtimeHealth, cronValidation, cronVerification, auditHealth, options);
  const checkedAt = new Date().toISOString();
  let summary = {
    checkedAt,
    snapshotFreshness: getSnapshotFreshness(checkedAt, options.snapshotStaleHours),
    overall,
    runtimeHealth,
    cronArtifact: cronValidation,
    installedCron: {
      matchCount: cronVerification.matchCount,
      duplicatesDetected: cronVerification.duplicatesDetected,
      latestRun: cronVerification.recentRuns?.entries?.[0] ?? null,
      runHealth: cronVerification.runHealth,
      warnings: cronVerification.warnings ?? [],
      errors: cronVerification.errors ?? []
    },
    latestCaptureAudit: latestAudit
      ? {
          capturedAt: latestAudit.capturedAt ?? null,
          httpStatus: latestAudit.httpStatus ?? null,
          ok: latestAudit.ok ?? null,
          shouldPersist: latestAudit.shouldPersist ?? null,
          stateId: latestAudit.stateId ?? null,
          stateLabel: latestAudit.stateLabel ?? null,
          provider: latestAudit.provider ?? null,
          error: latestAudit.error ?? null
        }
      : null,
    auditHealth,
    nextActions,
    historySummary: {
      ...historySummary,
      levelChanged: historySummary.previousLevel !== null && historySummary.previousLevel !== overall.level,
      recentLevels: [...historySummary.recentLevels, { checkedAt, level: overall.level }].slice(-operatorStatusTrendSampleSize),
      recentLevelCounts: buildLevelCounts([...historySummary.recentLevels, { checkedAt, level: overall.level }].slice(-operatorStatusTrendSampleSize).map((entry) => ({ checkedAt: entry.checkedAt, overall: { level: entry.level } }))),
      currentStreak: historySummary.previousLevel === overall.level
        ? {
            level: overall.level,
            count: (historySummary.currentStreak?.count ?? 0) + 1,
            sinceCheckedAt: historySummary.currentStreak?.sinceCheckedAt ?? checkedAt
          }
        : {
            level: overall.level,
            count: 1,
            sinceCheckedAt: checkedAt
          }
    },
    artifactPaths: null
  };

  if (options.record) {
    summary = await recordOperatorStatus(summary);
  }

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(renderConsoleSummary(summary));
  }

  if (summary.overall.level === 'ATTENTION' || (options.failOnWatch && summary.overall.level === 'WATCH')) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Bull Bear operator status check failed.');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
