#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

function resolveOpenClawCommand() {
  if (process.platform === 'win32') {
    return path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'openclaw.cmd');
  }
  return 'openclaw';
}

const projectRoot = process.cwd();
const artifactPath = path.join(projectRoot, 'docs', 'openclaw-hourly-capture-cron.json');
const cronVerificationDir = path.join(projectRoot, 'data', 'generated', 'cron-verification');
const cronVerificationLatestPath = path.join(cronVerificationDir, 'latest.json');
const cronVerificationLatestTextPath = path.join(cronVerificationDir, 'latest.txt');
const cronVerificationLatestMarkdownPath = path.join(cronVerificationDir, 'latest.md');
const cronVerificationHistoryPath = path.join(cronVerificationDir, 'history.ndjson');

function parseArgs(argv) {
  const options = {
    json: false,
    record: false,
    url: process.env.OPENCLAW_GATEWAY_URL?.trim() || null,
    token: process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || null,
    strict: false,
    name: process.env.BULL_BEAR_CRON_NAME?.trim() || null,
    runsLimit: 5,
    skipRuns: false,
    staleHours: 2
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
    if (arg === '--strict') {
      options.strict = true;
      continue;
    }
    if (arg === '--skip-runs') {
      options.skipRuns = true;
      continue;
    }

    const [flag, rawValue] = arg.split('=', 2);
    const value = rawValue?.trim();
    if (!value) continue;

    if (flag === '--url') options.url = value;
    if (flag === '--token') options.token = value;
    if (flag === '--name') options.name = value;
    if (flag === '--runs-limit') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        options.runsLimit = parsed;
      }
    }
    if (flag === '--stale-hours') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.staleHours = parsed;
      }
    }
  }

  return options;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateArtifact(job) {
  assert(job && typeof job === 'object', 'Cron artifact must be a JSON object.');
  assert(job.name === 'bull-bear-hourly-capture', 'Cron artifact must use the expected Bull Bear job name.');
  assert(job.schedule?.kind === 'cron', 'Cron artifact must use a cron schedule.');
  assert(typeof job.schedule?.expr === 'string' && job.schedule.expr.trim().length > 0, 'Cron artifact must define schedule.expr.');
  assert(typeof job.schedule?.tz === 'string' && job.schedule.tz.trim().length > 0, 'Cron artifact must define schedule.tz.');
  assert(job.sessionTarget === 'isolated', 'Cron artifact must target an isolated session.');
  assert(job.payload?.kind === 'agentTurn', 'Cron artifact must use an agentTurn payload.');
  assert(typeof job.payload?.message === 'string' && job.payload.message.includes('http://localhost:3000/api/capture'), 'Cron artifact payload must call the local /api/capture route.');
  assert(job.payload.message.includes('shouldPersist'), 'Cron artifact payload must mention shouldPersist.');
  assert(job.payload.message.includes('state id and label'), 'Cron artifact payload must mention state id and label.');
  assert(job.payload.message.includes('provider'), 'Cron artifact payload must mention provider.');
  assert(job.delivery?.mode === 'announce', 'Cron artifact delivery mode must be announce.');
  assert(job.enabled === true, 'Cron artifact must default to enabled.');
}

function quoteCmdArg(value) {
  if (value.length === 0) return '""';
  if (!/[\s"]/u.test(value)) return value;
  return '"' + value.replace(/"/g, '""') + '"';
}

function runJson(command, args) {
  return new Promise((resolve, reject) => {
    const isWindowsCmd = process.platform === 'win32' && /\.cmd$/i.test(command);
    const child = isWindowsCmd
      ? spawn('cmd.exe', ['/d', '/s', '/c', [quoteCmdArg(command), ...args.map(quoteCmdArg)].join(' ')], {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false
        })
      : spawn(command, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false
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
      if (code !== 0) {
        reject(new Error(`Command exited with code ${code ?? 'unknown'}${stderr ? `\n${stderr.trim()}` : ''}`));
        return;
      }

      try {
        resolve(JSON.parse(stdout));
      } catch (error) {
        reject(new Error(`Failed to parse JSON output.\n${stdout}${stderr ? `\n${stderr}` : ''}\n${error instanceof Error ? error.message : String(error)}`));
      }
    });
  });
}

function summarizeJob(job) {
  return {
    id: job.id,
    name: job.name,
    enabled: job.enabled,
    schedule: job.schedule,
    sessionTarget: job.sessionTarget,
    payloadKind: job.payload?.kind,
    timeoutSeconds: job.payload?.timeoutSeconds,
    deliveryMode: job.delivery?.mode ?? 'none'
  };
}

function summarizeRun(run) {
  const startedAt = run.startedAt ?? run.createdAt ?? run.ts ?? null;
  const finishedAt = run.finishedAt ?? run.completedAt ?? run.updatedAt ?? null;
  const text = run.summary ?? run.resultSummary ?? run.text ?? run.message ?? run.error ?? '';

  return {
    id: run.id ?? run.runId ?? null,
    status: run.status ?? run.state ?? 'unknown',
    startedAt,
    finishedAt,
    durationMs: run.durationMs ?? null,
    text: typeof text === 'string' ? text.trim().replace(/\s+/g, ' ').slice(0, 240) : ''
  };
}

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

function parseTimestamp(value) {
  if (!value || typeof value !== 'string') return null;
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

function classifyRecentRuns(entries, staleHours = 2) {
  const latest = entries[0] ?? null;
  if (!latest) {
    return {
      verdict: 'no-history',
      reason: 'No cron runs have been recorded for the installed job yet.',
      latestRunAgeMs: null,
      latestRunAge: null,
      staleThresholdHours: staleHours
    };
  }

  const latestStartedMs = parseTimestamp(latest.startedAt);
  const latestFinishedMs = parseTimestamp(latest.finishedAt);
  const latestSeenMs = latestFinishedMs ?? latestStartedMs;
  const latestRunAgeMs = latestSeenMs === null ? null : Math.max(0, Date.now() - latestSeenMs);
  const normalizedStatus = String(latest.status ?? 'unknown').toLowerCase();

  const failedStates = new Set(['failed', 'error', 'timed_out', 'timeout', 'cancelled', 'canceled']);
  const successStates = new Set(['completed', 'complete', 'succeeded', 'success', 'ok']);
  const runningStates = new Set(['running', 'in_progress', 'in-progress', 'started']);
  const queuedStates = new Set(['queued', 'pending', 'scheduled', 'created']);
  const staleThresholdMs = staleHours * 60 * 60 * 1000;

  if (failedStates.has(normalizedStatus)) {
    return {
      verdict: 'failing',
      reason: `Latest cron run status is ${normalizedStatus}.`,
      latestRunAgeMs,
      latestRunAge: formatAge(latestRunAgeMs),
      staleThresholdHours: staleHours
    };
  }

  if (successStates.has(normalizedStatus)) {
    if (latestRunAgeMs !== null && latestRunAgeMs > staleThresholdMs) {
      return {
        verdict: 'stale',
        reason: `Latest successful cron run is older than the ${staleHours}h stale threshold (${formatAge(latestRunAgeMs)} old).`,
        latestRunAgeMs,
        latestRunAge: formatAge(latestRunAgeMs),
        staleThresholdHours: staleHours
      };
    }

    return {
      verdict: 'healthy',
      reason: latestRunAgeMs === null
        ? 'Latest cron run succeeded, but its age could not be determined.'
        : `Latest cron run succeeded ${formatAge(latestRunAgeMs)} ago.`,
      latestRunAgeMs,
      latestRunAge: formatAge(latestRunAgeMs),
      staleThresholdHours: staleHours
    };
  }

  if (runningStates.has(normalizedStatus)) {
    return {
      verdict: 'running',
      reason: latestRunAgeMs === null
        ? 'Latest cron run is currently in progress, but its age could not be determined.'
        : `Latest cron run is currently in progress and started ${formatAge(latestRunAgeMs)} ago.`,
      latestRunAgeMs,
      latestRunAge: formatAge(latestRunAgeMs),
      staleThresholdHours: staleHours
    };
  }

  if (queuedStates.has(normalizedStatus)) {
    return {
      verdict: 'queued',
      reason: latestRunAgeMs === null
        ? 'Latest cron run is queued/pending, but its age could not be determined.'
        : `Latest cron run is queued/pending and was created ${formatAge(latestRunAgeMs)} ago.`,
      latestRunAgeMs,
      latestRunAge: formatAge(latestRunAgeMs),
      staleThresholdHours: staleHours
    };
  }

  return {
    verdict: 'unknown',
    reason: `Latest cron run status ${JSON.stringify(normalizedStatus)} is not classified as success, failure, running, or queued.`,
    latestRunAgeMs,
    latestRunAge: formatAge(latestRunAgeMs),
    staleThresholdHours: staleHours
  };
}

function compareInstalledJob(installed, expected, strict = false) {
  const errors = [];
  const warnings = [];

  const checks = [
    [installed.name === expected.name, `name mismatch: expected ${JSON.stringify(expected.name)}, received ${JSON.stringify(installed.name)}`],
    [installed.schedule?.kind === expected.schedule?.kind, `schedule.kind mismatch: expected ${JSON.stringify(expected.schedule?.kind)}, received ${JSON.stringify(installed.schedule?.kind)}`],
    [installed.schedule?.expr === expected.schedule?.expr, `schedule.expr mismatch: expected ${JSON.stringify(expected.schedule?.expr)}, received ${JSON.stringify(installed.schedule?.expr)}`],
    [installed.schedule?.tz === expected.schedule?.tz, `schedule.tz mismatch: expected ${JSON.stringify(expected.schedule?.tz)}, received ${JSON.stringify(installed.schedule?.tz)}`],
    [installed.sessionTarget === expected.sessionTarget, `sessionTarget mismatch: expected ${JSON.stringify(expected.sessionTarget)}, received ${JSON.stringify(installed.sessionTarget)}`],
    [installed.payload?.kind === expected.payload?.kind, `payload.kind mismatch: expected ${JSON.stringify(expected.payload?.kind)}, received ${JSON.stringify(installed.payload?.kind)}`],
    [installed.payload?.message === expected.payload?.message, 'payload.message mismatch: installed job does not exactly match the committed artifact message.'],
    [installed.payload?.timeoutSeconds === expected.payload?.timeoutSeconds, `payload.timeoutSeconds mismatch: expected ${JSON.stringify(expected.payload?.timeoutSeconds)}, received ${JSON.stringify(installed.payload?.timeoutSeconds)}`],
    [installed.delivery?.mode === expected.delivery?.mode, `delivery.mode mismatch: expected ${JSON.stringify(expected.delivery?.mode)}, received ${JSON.stringify(installed.delivery?.mode)}`]
  ];

  for (const [ok, message] of checks) {
    if (!ok) errors.push(message);
  }

  if (installed.enabled !== expected.enabled) {
    const message = `enabled mismatch: artifact expects ${expected.enabled}, installed job is ${installed.enabled}.`;
    if (strict) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  const captureMentions = [
    'http://localhost:3000/api/capture',
    'persisted',
    'shouldPersist',
    'state id and label',
    'provider',
    'failure clearly'
  ];

  for (const phrase of captureMentions) {
    if (!String(installed.payload?.message ?? '').includes(phrase)) {
      errors.push(`installed payload.message is missing required phrase: ${phrase}`);
    }
  }

  return { errors, warnings };
}

async function loadRecentRuns(jobId, options) {
  if (!jobId || options.skipRuns || options.runsLimit === 0) {
    return {
      inspected: false,
      total: null,
      limit: options.runsLimit,
      entries: [],
      warnings: []
    };
  }

  const args = ['cron', 'runs', '--id', jobId, '--limit', String(options.runsLimit)];
  if (options.url) args.push('--url', options.url);
  if (options.token) args.push('--token', options.token);

  try {
    const result = await runJson(resolveOpenClawCommand(), args);
    const entries = Array.isArray(result?.entries) ? result.entries : [];
    const total = Number.isFinite(result?.total) ? result.total : entries.length;

    return {
      inspected: true,
      total,
      limit: options.runsLimit,
      entries: entries.map(summarizeRun),
      warnings: entries.length === 0 ? ['No run-history entries were returned for the installed job yet.'] : []
    };
  } catch (error) {
    return {
      inspected: true,
      total: null,
      limit: options.runsLimit,
      entries: [],
      warnings: [`Unable to load cron run history: ${error instanceof Error ? error.message : String(error)}`]
    };
  }
}

function renderConsoleSummary(summary) {
  const lines = [
    'Bull Bear installed-cron verification',
    `Artifact: ${summary.artifactPath}`,
    `Expected job name: ${summary.expectedName}`,
    `Installed matches: ${summary.matchCount}`
  ];

  if (summary.installedJobs[0]) {
    const installed = summary.installedJobs[0];
    lines.push(`Primary match id: ${installed.id}`);
    lines.push(`Schedule: ${installed.schedule?.expr ?? 'unknown'} @ ${installed.schedule?.tz ?? 'unknown'}`);
    lines.push(`Enabled: ${installed.enabled}`);
    lines.push(`Delivery: ${installed.deliveryMode}`);
  }

  if (summary.recentRuns.inspected) {
    lines.push(`Recent runs inspected: ${summary.recentRuns.entries.length}${summary.recentRuns.total !== null ? ` of ${summary.recentRuns.total}` : ''}`);
    lines.push(`Run health verdict: ${summary.runHealth.verdict}`);
    lines.push(`Run health reason: ${summary.runHealth.reason}`);
    if (summary.recentRuns.entries[0]) {
      const latest = summary.recentRuns.entries[0];
      lines.push(`Latest run: ${latest.status} @ ${latest.startedAt ?? 'unknown time'}`);
      if (latest.finishedAt) lines.push(`Latest run finished: ${latest.finishedAt}`);
      if (latest.durationMs !== null && latest.durationMs !== undefined) {
        lines.push(`Latest run duration: ${formatAge(latest.durationMs)}`);
      }
      if (summary.runHealth.latestRunAge) lines.push(`Latest run age: ${summary.runHealth.latestRunAge}`);
      if (latest.text) lines.push(`Latest run summary: ${latest.text}`);
    }
  } else if (summary.options?.skipRuns) {
    lines.push('Recent runs inspected: skipped by flag');
  }

  if (summary.warnings.length > 0) {
    lines.push('Warnings:');
    for (const warning of summary.warnings) lines.push(`- ${warning}`);
  }

  if (summary.errors.length > 0) {
    lines.push('Errors:');
    for (const error of summary.errors) lines.push(`- ${error}`);
  } else {
    lines.push('Verification passed: exactly one installed job matches the committed Bull Bear cron artifact.');
  }

  if (summary.artifactPaths) {
    lines.push('Recorded verification artifacts:');
    lines.push(`- JSON: ${summary.artifactPaths.latest.path} (${summary.artifactPaths.latest.sizeHuman}, updated ${summary.artifactPaths.latest.updatedAt})`);
    lines.push(`- Text: ${summary.artifactPaths.latestText.path} (${summary.artifactPaths.latestText.sizeHuman}, updated ${summary.artifactPaths.latestText.updatedAt})`);
    lines.push(`- Markdown: ${summary.artifactPaths.latestMarkdown.path} (${summary.artifactPaths.latestMarkdown.sizeHuman}, updated ${summary.artifactPaths.latestMarkdown.updatedAt})`);
    lines.push(`- History: ${summary.artifactPaths.history.path} (${summary.artifactPaths.history.sizeHuman}, updated ${summary.artifactPaths.history.updatedAt})`);
  }

  return lines.join('\n');
}

function renderMarkdownSummary(summary) {
  const lines = [
    `# Bull Bear installed-cron verification: ${summary.errors.length > 0 ? 'FAILED' : 'PASSED'}`,
    '',
    `- Checked at: ${summary.checkedAt}`,
    `- Artifact: ${summary.artifactPath}`,
    `- Expected job name: ${summary.expectedName}`,
    `- Installed matches: ${summary.matchCount}`,
    `- Run health: ${summary.runHealth.verdict} - ${summary.runHealth.reason}`
  ];

  if (summary.installedJobs[0]) {
    const installed = summary.installedJobs[0];
    lines.push(`- Primary match id: ${installed.id}`);
    lines.push(`- Schedule: ${installed.schedule?.expr ?? 'unknown'} @ ${installed.schedule?.tz ?? 'unknown'}`);
    lines.push(`- Enabled: ${installed.enabled}`);
    lines.push(`- Delivery: ${installed.deliveryMode}`);
  }

  if (summary.recentRuns.inspected) {
    lines.push(`- Recent runs inspected: ${summary.recentRuns.entries.length}${summary.recentRuns.total !== null ? ` of ${summary.recentRuns.total}` : ''}`);
    if (summary.recentRuns.entries[0]) {
      const latest = summary.recentRuns.entries[0];
      lines.push(`- Latest run: ${latest.status} @ ${latest.startedAt ?? 'unknown time'}${latest.finishedAt ? ` | finished ${latest.finishedAt}` : ''}${latest.durationMs !== null && latest.durationMs !== undefined ? ` | duration ${formatAge(latest.durationMs)}` : ''}${summary.runHealth.latestRunAge ? ` | age ${summary.runHealth.latestRunAge}` : ''}${latest.text ? ` | ${latest.text}` : ''}`);
    }
  } else if (summary.options?.skipRuns) {
    lines.push('- Recent runs inspected: skipped by flag');
  }

  if (summary.warnings.length > 0) {
    lines.push('', '## Warnings');
    for (const warning of summary.warnings) lines.push(`- ${warning}`);
  }

  if (summary.errors.length > 0) {
    lines.push('', '## Errors');
    for (const error of summary.errors) lines.push(`- ${error}`);
  }

  if (summary.artifactPaths) {
    lines.push('', '## Recorded verification artifacts');
    lines.push(`- JSON: \`${summary.artifactPaths.latest.path}\` (${summary.artifactPaths.latest.sizeHuman}, updated ${summary.artifactPaths.latest.updatedAt})`);
    lines.push(`- Text: \`${summary.artifactPaths.latestText.path}\` (${summary.artifactPaths.latestText.sizeHuman}, updated ${summary.artifactPaths.latestText.updatedAt})`);
    lines.push(`- Markdown: \`${summary.artifactPaths.latestMarkdown.path}\` (${summary.artifactPaths.latestMarkdown.sizeHuman}, updated ${summary.artifactPaths.latestMarkdown.updatedAt})`);
    lines.push(`- History: \`${summary.artifactPaths.history.path}\` (${summary.artifactPaths.history.sizeHuman}, updated ${summary.artifactPaths.history.updatedAt})`);
  }

  return lines.join('\n');
}

async function recordCronVerification(summary) {
  await fs.mkdir(cronVerificationDir, { recursive: true });

  await fs.writeFile(cronVerificationLatestPath, `${JSON.stringify(summary, null, 2)}\n`, 'utf8');
  await fs.writeFile(cronVerificationLatestTextPath, `${renderConsoleSummary(summary)}\n`, 'utf8');
  await fs.writeFile(cronVerificationLatestMarkdownPath, `${renderMarkdownSummary(summary)}\n`, 'utf8');
  await fs.appendFile(cronVerificationHistoryPath, `${JSON.stringify(summary)}\n`, 'utf8');

  const artifactPaths = {
    dir: path.relative(projectRoot, cronVerificationDir),
    latest: await describeArtifact(cronVerificationLatestPath),
    latestText: await describeArtifact(cronVerificationLatestTextPath),
    latestMarkdown: await describeArtifact(cronVerificationLatestMarkdownPath),
    history: await describeArtifact(cronVerificationHistoryPath)
  };

  const finalizedSummary = {
    ...summary,
    artifactPaths
  };

  await fs.writeFile(cronVerificationLatestPath, `${JSON.stringify(finalizedSummary, null, 2)}\n`, 'utf8');
  await fs.writeFile(cronVerificationLatestTextPath, `${renderConsoleSummary(finalizedSummary)}\n`, 'utf8');
  await fs.writeFile(cronVerificationLatestMarkdownPath, `${renderMarkdownSummary(finalizedSummary)}\n`, 'utf8');

  finalizedSummary.artifactPaths = {
    ...artifactPaths,
    latest: await describeArtifact(cronVerificationLatestPath),
    latestText: await describeArtifact(cronVerificationLatestTextPath),
    latestMarkdown: await describeArtifact(cronVerificationLatestMarkdownPath),
    history: await describeArtifact(cronVerificationHistoryPath)
  };

  await fs.writeFile(cronVerificationLatestPath, `${JSON.stringify(finalizedSummary, null, 2)}\n`, 'utf8');
  await fs.writeFile(cronVerificationLatestTextPath, `${renderConsoleSummary(finalizedSummary)}\n`, 'utf8');
  await fs.writeFile(cronVerificationLatestMarkdownPath, `${renderMarkdownSummary(finalizedSummary)}\n`, 'utf8');

  return finalizedSummary;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const raw = await fs.readFile(artifactPath, 'utf8');
  const expectedJob = JSON.parse(raw);
  validateArtifact(expectedJob);

  const openclawCommand = resolveOpenClawCommand();
  const args = ['cron', 'list', '--json', '--all'];
  if (options.url) args.push('--url', options.url);
  if (options.token) args.push('--token', options.token);

  const result = await runJson(openclawCommand, args);
  const jobs = Array.isArray(result?.jobs) ? result.jobs : [];
  const expectedName = options.name ?? expectedJob.name;
  const matches = jobs.filter((job) => job?.name === expectedName);
  const primaryMatch = matches[0] ?? null;
  const recentRuns = await loadRecentRuns(primaryMatch?.id ?? null, options);
  const runHealth = classifyRecentRuns(recentRuns.entries, options.staleHours);

  let summary = {
    checkedAt: new Date().toISOString(),
    artifactPath: path.relative(projectRoot, artifactPath),
    expectedName,
    totalJobsSeen: jobs.length,
    matchCount: matches.length,
    duplicatesDetected: matches.length > 1,
    installedJobs: matches.map(summarizeJob),
    recentRuns,
    runHealth,
    warnings: [...recentRuns.warnings],
    errors: [],
    options: {
      strict: options.strict,
      skipRuns: options.skipRuns,
      runsLimit: options.runsLimit,
      staleHours: options.staleHours
    },
    artifactPaths: null
  };

  if (matches.length === 0) {
    summary.errors.push(`No installed cron job matched name ${JSON.stringify(expectedName)}.`);
  }

  if (matches.length > 1) {
    summary.errors.push(`Found ${matches.length} installed cron jobs named ${JSON.stringify(expectedName)}; expected exactly one.`);
  }

  if (matches.length >= 1) {
    const comparison = compareInstalledJob(matches[0], expectedJob, options.strict);
    summary.warnings.push(...comparison.warnings);
    summary.errors.push(...comparison.errors);
  }

  if (options.record) {
    summary = await recordCronVerification(summary);
  }

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    console.log(renderConsoleSummary(summary));
  }

  if (summary.errors.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Bull Bear installed-cron verification failed.');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
