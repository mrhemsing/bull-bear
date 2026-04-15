#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const execFile = promisify(execFileCallback);
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const releaseStatusOutputDir = path.join(projectRoot, 'data', 'generated', 'release-status');
const defaultBaseUrl = process.env.BULL_BEAR_APP_URL?.trim() || 'http://localhost:3000';
const releaseStatusPath = '/api/release-status';
const operatorStatusPath = '/api/operator-status';
const assetProductionStatusPath = '/api/asset-production-status';
const recordedOperatorStatusJsonPath = path.join(projectRoot, 'data', 'generated', 'operator-status', 'latest.json');

function parseArgs(argv) {
  const options = {
    json: false,
    record: false,
    failOnWatch: false,
    requireAppRoute: false,
    baseUrl: defaultBaseUrl,
    timeoutMs: 15000
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

    if (arg === '--require-app-route') {
      options.requireAppRoute = true;
      continue;
    }

    const [flag, rawValue] = arg.split('=', 2);
    const value = rawValue?.trim();
    if (!value) continue;

    if (flag === '--base-url' || flag === '--url') {
      options.baseUrl = value.replace(/\/$/, '');
      continue;
    }

    if (flag === '--timeout-ms') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.timeoutMs = parsed;
      }
    }
  }

  return options;
}

function formatAge(ms) {
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function ageFromTimestamp(value) {
  if (typeof value === 'number') {
    return Number.isFinite(value) ? Math.max(0, Date.now() - value) : null;
  }

  if (!value || typeof value !== 'string') return null;
  const numeric = Number(value);
  if (Number.isFinite(numeric) && /^\d+$/.test(value.trim())) {
    return Math.max(0, Date.now() - numeric);
  }

  const ms = Date.parse(value);
  if (!Number.isFinite(ms)) return null;
  return Math.max(0, Date.now() - ms);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getErrorMessage(error) {
  if (!(error instanceof Error)) return String(error);
  const cause = error.cause && typeof error.cause === 'object'
    ? error.cause.code ?? error.cause.message ?? null
    : null;
  return cause ? `${error.message} (${cause})` : error.message;
}

function shouldFallbackToHttpRequest(error) {
  if (!(error instanceof Error)) return false;
  const message = getErrorMessage(error).toLowerCase();
  return message.includes('headers_overflow')
    || message.includes('und_err_headers_overflow')
    || message.includes('header overflow')
    || message.includes('parse error: header overflow');
}

function isRetryableFetchError(error) {
  if (!(error instanceof Error)) return false;

  if (error.name === 'AbortError') return true;

  const message = getErrorMessage(error).toLowerCase();
  return message.includes('fetch failed')
    || message.includes('socket')
    || message.includes('econnreset')
    || message.includes('econnrefused')
    || message.includes('connect etimedout')
    || message.includes('other side closed')
    || message.includes('und_err');
}

async function fetchJsonViaHttpRequest(url, timeoutMs) {
  const parsedUrl = new URL(url);
  const transport = parsedUrl.protocol === 'https:' ? https : http;

  return new Promise((resolve, reject) => {
    const request = transport.request(parsedUrl, {
      method: 'GET',
      headers: {
        Accept: 'application/json'
      }
    }, (response) => {
      const chunks = [];
      response.setEncoding('utf8');
      response.on('data', (chunk) => chunks.push(chunk));
      response.on('end', () => {
        const text = chunks.join('');
        const statusCode = response.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          reject(new Error(`${statusCode} ${response.statusMessage ?? ''}${text ? `\n${text.slice(0, 400)}` : ''}`.trim()));
          return;
        }

        try {
          resolve(JSON.parse(text));
        } catch (error) {
          reject(new Error(`Invalid JSON from ${url}: ${error instanceof Error ? error.message : String(error)}`));
        }
      });
    });

    request.setTimeout(timeoutMs, () => {
      request.destroy(new Error(`Request timed out after ${timeoutMs}ms`));
    });

    request.on('error', reject);
    request.end();
  });
}

async function fetchJsonViaCurl(url, timeoutMs) {
  const curlBinary = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const { stdout } = await execFile(curlBinary, [
    '--silent',
    '--show-error',
    '--location',
    '--max-time',
    String(Math.max(1, Math.ceil(timeoutMs / 1000))),
    '--header',
    'Accept: application/json',
    url
  ], {
    maxBuffer: 5 * 1024 * 1024
  });

  try {
    return JSON.parse(stdout);
  } catch (error) {
    throw new Error(`Invalid JSON from ${url} via curl: ${error instanceof Error ? error.message : String(error)}`);
  }
}

async function fetchJson(url, timeoutMs) {
  const maxAttempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        headers: {
          Accept: 'application/json'
        }
      });

      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText}${text ? `\n${text.slice(0, 400)}` : ''}`);
      }

      try {
        return JSON.parse(text);
      } catch (error) {
        throw new Error(`Invalid JSON from ${url}: ${error instanceof Error ? error.message : String(error)}`);
      }
    } catch (error) {
      if (shouldFallbackToHttpRequest(error)) {
        try {
          return await fetchJsonViaHttpRequest(url, timeoutMs);
        } catch (httpError) {
          if (shouldFallbackToHttpRequest(httpError)) {
            return fetchJsonViaCurl(url, timeoutMs);
          }
          throw httpError;
        }
      }

      lastError = error;
      if (attempt >= maxAttempts || !isRetryableFetchError(error)) {
        throw new Error(`Failed to fetch ${url}: ${getErrorMessage(error)}`);
      }
      await sleep(500 * attempt);
    } finally {
      clearTimeout(timeout);
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url}`);
}

function releaseSummariesDiffer(appSummary, fallbackSummary) {
  const appComparable = {
    verdict: appSummary?.verdict ?? null,
    newestEvidenceAt: appSummary?.newestEvidenceAt ?? appSummary?.checkedAt ?? null,
    blockers: Array.isArray(appSummary?.blockers) ? appSummary.blockers : [],
    cautions: Array.isArray(appSummary?.cautions) ? appSummary.cautions : [],
    recommendedActions: Array.isArray(appSummary?.recommendedActions)
      ? appSummary.recommendedActions.map((action) => JSON.stringify(action))
      : [],
    operatorHeadline: appSummary?.operator?.headline ?? null,
    assetHeadline: appSummary?.assets?.headline ?? null,
    activeWorkstream: appSummary?.activeWorkstream ?? null,
    activeWorkstreamSummary: appSummary?.activeWorkstreamSummary ?? null
  };

  const fallbackComparable = {
    verdict: fallbackSummary?.verdict ?? null,
    newestEvidenceAt: fallbackSummary?.newestEvidenceAt ?? fallbackSummary?.checkedAt ?? null,
    blockers: Array.isArray(fallbackSummary?.blockers) ? fallbackSummary.blockers : [],
    cautions: Array.isArray(fallbackSummary?.cautions) ? fallbackSummary.cautions : [],
    recommendedActions: Array.isArray(fallbackSummary?.recommendedActions)
      ? fallbackSummary.recommendedActions.map((action) => JSON.stringify(action))
      : [],
    operatorHeadline: fallbackSummary?.operator?.headline ?? null,
    assetHeadline: fallbackSummary?.assets?.headline ?? null,
    activeWorkstream: fallbackSummary?.activeWorkstream ?? null,
    activeWorkstreamSummary: fallbackSummary?.activeWorkstreamSummary ?? null
  };

  return JSON.stringify(appComparable) !== JSON.stringify(fallbackComparable);
}

async function readRecordedOperatorStatus() {
  try {
    const raw = await readFile(recordedOperatorStatusJsonPath, 'utf8');
    return JSON.parse(raw);
  } catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw error;
  }
}

function timestampToMs(value) {
  if (!value || typeof value !== 'string') return Number.NaN;
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : Number.NaN;
}

async function fetchReleaseSummary(baseUrl, timeoutMs) {
  const releaseUrl = `${baseUrl}${releaseStatusPath}`;
  const operatorUrl = `${baseUrl}${operatorStatusPath}`;
  const assetUrl = `${baseUrl}${assetProductionStatusPath}`;

  const composeFallbackSummary = async () => {
    const [routeOperator, recordedOperator, assets] = await Promise.all([
      fetchJson(operatorUrl, timeoutMs),
      readRecordedOperatorStatus(),
      fetchJson(assetUrl, timeoutMs)
    ]);

    const routeOperatorMs = timestampToMs(routeOperator?.checkedAt);
    const recordedOperatorMs = timestampToMs(recordedOperator?.checkedAt);
    const routeAuditMs = timestampToMs(routeOperator?.latestCaptureAudit?.capturedAt);
    const recordedAuditMs = timestampToMs(recordedOperator?.latestCaptureAudit?.capturedAt);
    const routeRunMs = timestampToMs(routeOperator?.installedCron?.latestRun?.finishedAt)
      || timestampToMs(routeOperator?.installedCron?.latestRun?.startedAt);
    const recordedRunMs = timestampToMs(recordedOperator?.installedCron?.latestRun?.finishedAt)
      || timestampToMs(recordedOperator?.installedCron?.latestRun?.startedAt);

    const recordedHasNewerEvidence = Number.isFinite(recordedOperatorMs)
      && (
        !Number.isFinite(routeOperatorMs)
        || recordedOperatorMs > routeOperatorMs
        || (Number.isFinite(recordedAuditMs) && (!Number.isFinite(routeAuditMs) || recordedAuditMs > routeAuditMs))
        || (Number.isFinite(recordedRunMs) && (!Number.isFinite(routeRunMs) || recordedRunMs > routeRunMs))
      );

    const operator = recordedHasNewerEvidence
      ? recordedOperator
      : routeOperator;
    const operatorSource = operator === recordedOperator ? 'recorded-operator-status' : 'route-operator-status';

    const operatorSummary = summarizeOperator(operator);
    const assetSummary = summarizeAssets(assets);
    const summary = buildGate({ operatorSummary, assetSummary, operator, assets, options: { baseUrl, failOnWatch: false } });

    return {
      summary,
      source: operatorSource === 'recorded-operator-status' ? 'fallback-summary-recorded-operator+asset-route' : 'fallback-summary-routes',
      url: operatorSource === 'recorded-operator-status'
        ? `${recordedOperatorStatusJsonPath} + ${assetUrl}`
        : `${operatorUrl} + ${assetUrl}`,
      operator,
      assets,
      operatorSource
    };
  };

  try {
    const appSummary = await fetchJson(releaseUrl, timeoutMs);
    const fallback = await composeFallbackSummary();
    const appNewestEvidenceMs = Date.parse(appSummary?.newestEvidenceAt ?? appSummary?.checkedAt ?? '');
    const fallbackNewestEvidenceMs = Date.parse(
      fallback.summary?.newestEvidenceAt ?? fallback.summary?.checkedAt ?? ''
    );

    if (Number.isFinite(fallbackNewestEvidenceMs)
      && (!Number.isFinite(appNewestEvidenceMs) || fallbackNewestEvidenceMs > appNewestEvidenceMs)) {
      return {
        summary: fallback.summary,
        source: 'freshness-fallback-summary-routes',
        url: `${releaseUrl} -> ${fallback.url}`,
        fallbackReason: `App release summary lagged fresher operator/asset evidence (${appSummary?.newestEvidenceAt ?? 'unknown'} < ${fallback.summary?.newestEvidenceAt ?? 'unknown'}).`
      };
    }

    if (releaseSummariesDiffer(appSummary, fallback.summary)) {
      return {
        summary: fallback.summary,
        source: 'content-fallback-summary-routes',
        url: `${releaseUrl} -> ${fallback.url}`,
        fallbackReason: 'App release summary diverged from the current operator/asset source of truth, so the recorder used the freshly composed fallback summary instead.'
      };
    }

    return {
      summary: appSummary,
      source: 'app-release-status',
      url: releaseUrl
    };
  } catch (error) {
    const fallback = await composeFallbackSummary();

    return {
      summary: fallback.summary,
      source: 'fallback-summary-routes',
      url: fallback.url,
      fallbackReason: error instanceof Error ? error.message : String(error)
    };
  }
}

function formatWarningReasons(warnings) {
  const cleanWarnings = warnings
    .filter((warning) => typeof warning === 'string' && warning.trim().length > 0)
    .map((warning) => warning.trim().replace(/\.$/, ''));

  if (cleanWarnings.length === 0) return 'the current warning set is non-empty';
  return cleanWarnings.join('; ');
}

function summarizeOperator(operator) {
  const issues = operator?.overall?.issues ?? [];
  const warnings = operator?.overall?.warnings ?? [];
  const nextActions = operator?.nextActions ?? [];
  const level = operator?.overall?.level ?? 'UNKNOWN';
  const snapshotFreshness = operator?.snapshotFreshness?.verdict ?? 'unknown';
  const runHealth = operator?.installedCron?.runHealth?.verdict ?? 'unknown';
  const auditHealth = operator?.auditHealth?.verdict ?? 'unknown';
  const routineOperatorLoopOnly = level === 'WATCH'
    && warnings.length > 0
    && nextActions.length === 1
    && nextActions[0]?.area === 'operator-loop'
    && snapshotFreshness === 'fresh'
    && runHealth === 'healthy'
    && auditHealth === 'fresh';

  const blockers = [];
  const cautions = [];

  if (level === 'ATTENTION') {
    blockers.push('Operator status is ATTENTION.');
  } else if (level === 'WATCH') {
    cautions.push(
      routineOperatorLoopOnly
        ? `Operator status is WATCH only because: ${formatWarningReasons(warnings)}.`
        : 'Operator status is WATCH.'
    );
  }

  if (snapshotFreshness === 'stale') {
    cautions.push('Recorded operator snapshot is stale.');
  }

  if (runHealth === 'failing' || runHealth === 'stale' || runHealth === 'no-history') {
    blockers.push(`Installed cron run health is ${runHealth}.`);
  } else if (runHealth === 'running' || runHealth === 'queued' || runHealth === 'unknown') {
    cautions.push(`Installed cron run health is ${runHealth}.`);
  }

  if (auditHealth === 'error' || auditHealth === 'missing' || auditHealth === 'stale') {
    blockers.push(`Capture audit health is ${auditHealth}.`);
  }

  return {
    level,
    snapshotFreshness,
    runHealth,
    auditHealth,
    issueCount: issues.length,
    warningCount: warnings.length,
    nextActionCount: nextActions.length,
    blockers,
    cautions,
    headline: `operator=${level} snapshot=${snapshotFreshness} run=${runHealth} audit=${auditHealth}`
  };
}

function summarizeAssets(asset) {
  const nextActions = asset?.nextActions ?? [];
  const fullCoverageComplete = Boolean(asset?.fullCoverageComplete);
  const approvedStills = Number(asset?.approvedStills ?? 0);
  const totalStates = Number(asset?.totalStates ?? 0);
  const approvedLoops = Number(asset?.approvedLoops ?? 0);
  const pendingStates = Number(asset?.pendingStates ?? 0);
  const staleArtifactCount = (asset?.artifactEntries ?? []).filter((entry) => entry?.freshness?.verdict === 'stale').length;
  const imageLedgerFreshness = asset?.imageGenerationSummary?.freshness?.verdict ?? 'unknown';
  const loopLedgerFreshness = asset?.loopGenerationSummary?.freshness?.verdict ?? 'unknown';
  const assetWorkstreamActive = !fullCoverageComplete || pendingStates > 0 || nextActions.length > 0;

  const blockers = [];
  const cautions = [];

  if (!fullCoverageComplete) {
    blockers.push('Canonical asset coverage is incomplete.');
  }

  if (pendingStates > 0) {
    blockers.push(`${pendingStates} states are still pending asset approval.`);
  }

  if (nextActions.length > 0) {
    cautions.push(`${nextActions.length} asset-production next actions are still open.`);
  }

  if (assetWorkstreamActive && staleArtifactCount > 0) {
    cautions.push(`${staleArtifactCount} generated asset handoff artifacts are stale.`);
  }

  if (assetWorkstreamActive && (imageLedgerFreshness === 'stale' || loopLedgerFreshness === 'stale')) {
    cautions.push(`Generation ledger freshness is image=${imageLedgerFreshness}, loop=${loopLedgerFreshness}.`);
  }

  return {
    fullCoverageComplete,
    approvedStills,
    totalStates,
    approvedLoops,
    pendingStates,
    nextActionCount: nextActions.length,
    staleArtifactCount,
    imageLedgerFreshness,
    loopLedgerFreshness,
    blockers,
    cautions,
    headline: `coverage=${fullCoverageComplete ? 'complete' : 'incomplete'} stills=${approvedStills}/${totalStates} loops=${approvedLoops} pending=${pendingStates}`
  };
}

function buildGate({ operatorSummary, assetSummary, operator, assets, options }) {
  const blockers = [...operatorSummary.blockers, ...assetSummary.blockers];
  const cautions = [...operatorSummary.cautions, ...assetSummary.cautions];

  const verdict = blockers.length > 0
    ? 'FAIL'
    : cautions.length > 0
      ? 'WATCH'
      : 'PASS';

  const checkedAtCandidates = [
    operator?.checkedAt,
    operator?.latestCaptureAudit?.capturedAt,
    operator?.installedCron?.latestRun?.finishedAt,
    operator?.installedCron?.latestRun?.startedAt,
    assets?.imageGenerationSummary?.latestRecordedAt,
    assets?.loopGenerationSummary?.latestRecordedAt
  ].filter(Boolean);

  const newestEvidenceAt = checkedAtCandidates
    .map((value) => ({ value, ms: Date.parse(value) }))
    .filter((entry) => Number.isFinite(entry.ms))
    .sort((a, b) => b.ms - a.ms)[0]?.value ?? null;

  const newestEvidenceAge = newestEvidenceAt ? formatAge(ageFromTimestamp(newestEvidenceAt)) : null;
  const shouldFail = verdict === 'FAIL' || (options.failOnWatch && verdict === 'WATCH');
  const activeWorkstream = assetSummary.fullCoverageComplete && assetSummary.nextActionCount === 0
    ? (operatorSummary.blockers.length > 0 || operatorSummary.cautions.length > 0
      ? 'rollout-proof-only'
      : 'complete-no-open-work')
    : 'assets-or-mixed';
  const activeWorkstreamSummary = activeWorkstream === 'rollout-proof-only'
    ? 'Asset coverage is complete and the active lane is rollout / scheduler proof only.'
    : activeWorkstream === 'complete-no-open-work'
      ? 'Asset coverage is complete and no open release lane remains.'
      : 'Asset production and/or rollout proof still have open work.';

  return {
    verdict,
    shouldFail,
    checkedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    newestEvidenceAt,
    newestEvidenceAge,
    activeWorkstream,
    activeWorkstreamSummary,
    operator: operatorSummary,
    assets: assetSummary,
    blockers,
    cautions,
    recommendedActions: [
      ...new Set([
        ...(operator?.nextActions ?? []),
        ...(assets?.nextActions ?? [])
      ])
    ].slice(0, 10)
  };
}

function formatRecommendedAction(action) {
  if (typeof action === 'string') {
    return action;
  }

  if (action && typeof action === 'object') {
    const priority = typeof action.priority === 'string' ? action.priority : null;
    const area = typeof action.area === 'string' ? action.area : null;
    const command = typeof action.command === 'string' ? action.command : null;
    const reason = typeof action.reason === 'string' ? action.reason : null;

    const detailParts = [];
    if (priority) detailParts.push(`priority=${priority}`);
    if (area) detailParts.push(`area=${area}`);

    const headline = command ?? reason ?? JSON.stringify(action);
    return detailParts.length > 0 ? `${headline} (${detailParts.join(', ')})${reason && command ? ` — ${reason}` : ''}` : headline;
  }

  return String(action);
}

function buildTextSummary(summary) {
  const lines = [
    `Bull Bear release status: ${summary.verdict}`,
    `Base URL: ${summary.baseUrl}`,
    `Summary source: ${summary.summarySource}`
  ];

  if (summary.summaryUrl) {
    lines.push(`Summary URL: ${summary.summaryUrl}`);
  }
  if (summary.fallbackReason) {
    lines.push(`Fallback reason: ${summary.fallbackReason}`);
  }
  if (summary.requireAppRoute) {
    lines.push(`Require app-native release route: ${summary.sourceRequirementMet ? 'met' : 'NOT MET'}`);
  }
  if (summary.newestEvidenceAt) {
    lines.push(`Newest evidence: ${summary.newestEvidenceAt} (${summary.newestEvidenceAge} ago)`);
  }
  if (summary.activeWorkstreamSummary) {
    lines.push(`Active workstream: ${summary.activeWorkstreamSummary}`);
  }

  lines.push(`Operator: ${summary.operator.headline}`);
  lines.push(`Assets: ${summary.assets.headline}`);

  if (summary.blockers.length > 0) {
    lines.push('', 'Blockers:');
    for (const blocker of summary.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  if (summary.cautions.length > 0) {
    lines.push('', 'Cautions:');
    for (const caution of summary.cautions) {
      lines.push(`- ${caution}`);
    }
  }

  if (summary.recommendedActions.length > 0) {
    lines.push('', 'Recommended next actions:');
    for (const action of summary.recommendedActions) {
      lines.push(`- ${formatRecommendedAction(action)}`);
    }
  }

  return lines.join('\n');
}

function buildMarkdownSummary(summary) {
  const lines = [
    '# Bull Bear Release Status',
    '',
    `- Verdict: **${summary.verdict}**`,
    `- Base URL: \`${summary.baseUrl}\``,
    `- Summary source: \`${summary.summarySource}\``
  ];

  if (summary.summaryUrl) {
    lines.push(`- Summary URL: \`${summary.summaryUrl}\``);
  }
  if (summary.fallbackReason) {
    lines.push(`- Fallback reason: ${summary.fallbackReason}`);
  }
  if (summary.requireAppRoute) {
    lines.push(`- Require app-native release route: **${summary.sourceRequirementMet ? 'met' : 'NOT MET'}**`);
  }
  if (summary.newestEvidenceAt) {
    lines.push(`- Newest evidence: \`${summary.newestEvidenceAt}\` (${summary.newestEvidenceAge} ago)`);
  }
  if (summary.activeWorkstreamSummary) {
    lines.push(`- Active workstream: ${summary.activeWorkstreamSummary}`);
  }

  lines.push('', '## Headline', '', `- Operator: ${summary.operator.headline}`, `- Assets: ${summary.assets.headline}`);

  if (summary.blockers.length > 0) {
    lines.push('', '## Blockers', '');
    for (const blocker of summary.blockers) {
      lines.push(`- ${blocker}`);
    }
  }

  if (summary.cautions.length > 0) {
    lines.push('', '## Cautions', '');
    for (const caution of summary.cautions) {
      lines.push(`- ${caution}`);
    }
  }

  if (summary.recommendedActions.length > 0) {
    lines.push('', '## Recommended Next Actions', '');
    for (const action of summary.recommendedActions) {
      lines.push(`- ${formatRecommendedAction(action)}`);
    }
  }

  return lines.join('\n');
}

async function recordSummary(summary) {
  await mkdir(releaseStatusOutputDir, { recursive: true });

  const jsonPath = path.join(releaseStatusOutputDir, 'latest.json');
  const textPath = path.join(releaseStatusOutputDir, 'latest.txt');
  const markdownPath = path.join(releaseStatusOutputDir, 'latest.md');
  const historyPath = path.join(releaseStatusOutputDir, 'history.ndjson');

  const json = `${JSON.stringify(summary, null, 2)}\n`;
  const text = `${buildTextSummary(summary)}\n`;
  const markdown = `${buildMarkdownSummary(summary)}\n`;
  const historyEntry = `${JSON.stringify(summary)}\n`;

  let existingHistory = '';
  try {
    existingHistory = await readFile(historyPath, 'utf8');
  } catch (error) {
    if (error?.code !== 'ENOENT') {
      throw error;
    }
  }

  await Promise.all([
    writeFile(jsonPath, json, 'utf8'),
    writeFile(textPath, text, 'utf8'),
    writeFile(markdownPath, markdown, 'utf8'),
    writeFile(historyPath, `${existingHistory}${historyEntry}`, 'utf8')
  ]);
}

function printText(summary) {
  console.log(buildTextSummary(summary));
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const releaseSummary = await fetchReleaseSummary(options.baseUrl, options.timeoutMs);
  const summarySourceMismatch = options.requireAppRoute && releaseSummary.source !== 'app-release-status';
  const summary = {
    ...releaseSummary.summary,
    baseUrl: options.baseUrl,
    shouldFail:
      releaseSummary.summary.verdict === 'FAIL' ||
      (options.failOnWatch && releaseSummary.summary.verdict === 'WATCH') ||
      summarySourceMismatch,
    summarySource: releaseSummary.source,
    summaryUrl: releaseSummary.url,
    fallbackReason: releaseSummary.fallbackReason ?? null,
    requireAppRoute: options.requireAppRoute,
    sourceRequirementMet: !summarySourceMismatch
  };

  if (options.record) {
    await recordSummary(summary);
  }

  if (options.json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    printText(summary);
  }

  if (summary.shouldFail) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
