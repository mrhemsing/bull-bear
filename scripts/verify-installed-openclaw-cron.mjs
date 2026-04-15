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
const compactCronMessage = 'Bull Bear local only. Make exactly one GET request to http://127.0.0.1:3078/api/capture-proof?format=text and output that single response body exactly, byte for byte, with nothing added, removed, summarized, translated, reformatted, or explained. Do not browse, search, infer, or use any other tool, source, URL, or endpoint. Do not call cash-grab.vercel.app. The response body is already the final five-line Bull Bear proof, so echo it verbatim and stop.';

function normalizeMessageForCompatibilityCheck(message) {
  return String(message ?? '').replace(/\s+/g, ' ').trim();
}

function isKnownCompactCompatibilityMessage(message) {
  if (typeof message !== 'string' || message.trim().length === 0) return false;

  const normalizedMessage = normalizeMessageForCompatibilityCheck(message);
  const knownPhraseSets = [
    [
      'Bull Bear local only',
      'http://127.0.0.1:3078/api/capture-proof',
      'State must include both the canonical state id and label exactly as returned by /api/capture',
      'Use provider exactly as returned by /api/capture',
      'Use shouldPersist and persisted exactly as returned by /api/capture',
      'If persisted is missing, say persisted: not returned',
      'If failures is missing or empty, say failures: none',
      'Do not use any other URL, host, app, project, or remote endpoint',
      'Do not call cash-grab.vercel.app',
      'Then report only: state, provider, shouldPersist, persisted, and failures'
    ],
    [
      'Bull Bear local only',
      'http://127.0.0.1:3078/api/capture-proof',
      'Do not browse, search, infer, summarize, or use any other tool or source',
      'Copy only the literal top-level JSON fields stateId, stateLabel, provider, shouldPersist, persisted, and failures from that one response body',
      'The required values are top-level siblings, not nested under state',
      'If top-level stateId and stateLabel are present, ignore any nested state object entirely',
      'If top-level stateId and stateLabel are missing, say exactly `state: not returned in canonical id+label form`',
      'Provider must be exactly `provider: <provider>` copied from the top-level response',
      'shouldPersist must be exactly `shouldPersist: true` or `shouldPersist: false` copied from the top-level response in lowercase',
      'persisted must be exactly `persisted: true` or `persisted: false` copied from the top-level response in lowercase',
      'If persisted is missing, say `persisted: not returned`',
      'failures must be exactly `failures: none` when the top-level failures field is missing or empty',
      'Do not set any field to null, unavailable, unknown, or omit it',
      'Do not use any other URL, host, app, project, or remote endpoint',
      'Do not call cash-grab.vercel.app',
      'Then output exactly these five lines and nothing else, in this order'
    ],
    [
      'Bull Bear local only',
      'http://127.0.0.1:3078/api/capture-proof',
      'Return only the exact Bull Bear capture JSON fields from that single response',
      'Do not browse, search, infer, summarize, or use any other tool or source',
      'Copy only the literal top-level JSON fields stateId, stateLabel, provider, shouldPersist, persisted, and failures from that one response body',
      'The required values are top-level siblings, not nested under state',
      'If top-level stateId and stateLabel are present, ignore any nested state object entirely',
      'If top-level stateId and stateLabel are missing, say exactly `state: not returned in canonical id+label form`',
      'Provider must be exactly `provider: <provider>` copied from the top-level response',
      'shouldPersist must be exactly `shouldPersist: true` or `shouldPersist: false` copied from the top-level response in lowercase',
      'persisted must be exactly `persisted: true` or `persisted: false` copied from the top-level response in lowercase',
      'If persisted is missing, say `persisted: not returned`',
      'failures must be exactly `failures: none` when the top-level failures field is missing or empty',
      'Do not set any field to null, unavailable, unknown, or omit it',
      'Do not use any other URL, host, app, project, or remote endpoint',
      'Do not call cash-grab.vercel.app',
      'Then output exactly these five lines and nothing else, in this order'
    ],
    [
      'Bull Bear local only',
      'http://127.0.0.1:3078/api/capture-proof',
      'use only that single JSON response body',
      'Do not browse, search, infer, summarize, explain, translate, or use any other tool, source, URL, or endpoint',
      'Do not call cash-grab.vercel.app',
      'If the response includes a top-level cronProof string, output that cronProof string exactly and nothing else',
      'Otherwise output exactly these five lines and nothing else, in this order, copied only from the top-level response fields stateId, stateLabel, provider, shouldPersist, persisted, and failures',
      'Line 1: state: <stateId> (<stateLabel>) when both top-level stateId and stateLabel exist; otherwise state: not returned in canonical id+label form',
      'Line 2: provider: <provider> or provider: not returned',
      'Line 3: shouldPersist: true or shouldPersist: false in lowercase',
      'Line 4: persisted: true or persisted: false in lowercase, or persisted: not returned if the top-level field is missing',
      'Line 5: failures: none if the top-level failures field is missing or empty; otherwise copy failures exactly',
      'Never use any nested state object and never output raw JSON, direction, intensity, stage, or signedScore'
    ],
    [
      'Bull Bear local only',
      'http://127.0.0.1:3078/api/capture-proof?format=text',
      'output that single response body exactly, byte for byte',
      'Do not browse, search, infer, or use any other tool, source, URL, or endpoint',
      'Do not call cash-grab.vercel.app',
      'The response body is already the final five-line Bull Bear proof, so echo it verbatim and stop'
    ]
  ];

  return knownPhraseSets.some((requiredPhrases) => requiredPhrases.every((phrase) => normalizedMessage.includes(normalizeMessageForCompatibilityCheck(phrase))));
}
const cronVerificationLatestPath = path.join(cronVerificationDir, 'latest.json');
const cronVerificationLatestTextPath = path.join(cronVerificationDir, 'latest.txt');
const cronVerificationLatestMarkdownPath = path.join(cronVerificationDir, 'latest.md');
const cronVerificationHistoryPath = path.join(cronVerificationDir, 'history.ndjson');
const localCronRunsDir = path.join(os.homedir(), '.openclaw', 'cron', 'runs');
const localCronJobsPath = path.join(os.homedir(), '.openclaw', 'cron', 'jobs.json');

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
  assert(typeof job.payload?.message === 'string' && job.payload.message.includes('http://127.0.0.1:3078/api/capture-proof?format=text'), 'Cron artifact payload must call the local /api/capture-proof?format=text route.');
  assert(job.payload.message.includes('output that single response body exactly, byte for byte'), 'Cron artifact payload must require exact proof echoing.');
  assert(job.payload.message.includes('Do not browse, search, infer, or use any other tool, source, URL, or endpoint'), 'Cron artifact payload must forbid alternate tools and endpoints.');
  assert(job.payload.message.includes('Do not call cash-grab.vercel.app'), 'Cron artifact payload must forbid cash-grab.vercel.app.');
  assert(job.payload.message.includes('The response body is already the final five-line Bull Bear proof, so echo it verbatim and stop'), 'Cron artifact payload must require the final proof body to be echoed verbatim.');
  assert(job.delivery?.mode === 'none', 'Cron artifact delivery mode must be none.');
  assert(job.enabled === true, 'Cron artifact must default to enabled.');
}

function quotePowerShellArg(value) {
  if (value.length === 0) return "''";
  return `'${value.replace(/'/g, "''")}'`;
}

function runJson(command, args) {
  return new Promise((resolve, reject) => {
    const timeoutMs = 35000;
    const isWindowsCmd = process.platform === 'win32' && /\.cmd$/i.test(command);
    const child = isWindowsCmd
      ? spawn('powershell.exe', ['-NoProfile', '-Command', `& ${quotePowerShellArg(command)} ${args.map(quotePowerShellArg).join(' ')}`], {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false
        })
      : spawn(command, args, {
          stdio: ['ignore', 'pipe', 'pipe'],
          shell: false
        });

    let stdout = '';
    let stderr = '';
    let timedOut = false;

    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill();
    }, timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += String(chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr += String(chunk);
    });

    child.on('error', (error) => {
      clearTimeout(timeout);
      reject(error);
    });
    child.on('exit', (code) => {
      clearTimeout(timeout);

      if (timedOut) {
        reject(new Error(`Command timed out after ${timeoutMs}ms${stderr ? `\n${stderr.trim()}` : ''}`));
        return;
      }

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
  const startedAt = run.startedAt ?? run.createdAt ?? run.runAtMs ?? run.ts ?? null;
  const finishedAt = run.finishedAt
    ?? run.completedAt
    ?? run.updatedAt
    ?? (Number.isFinite(startedAt) && Number.isFinite(run.durationMs) ? startedAt + run.durationMs : null);
  const text = run.summary ?? run.resultSummary ?? run.text ?? run.message ?? run.error ?? '';
  const normalizedText = typeof text === 'string' ? text.trim().replace(/\s+/g, ' ') : '';
  const truncatedText = normalizedText.slice(0, 240);
  const shouldPreserveFullText = normalizedText.startsWith('{') && normalizedText.endsWith('}');

  return {
    id: run.id ?? run.runId ?? null,
    status: run.status ?? run.state ?? 'unknown',
    startedAt,
    finishedAt,
    durationMs: run.durationMs ?? null,
    text: shouldPreserveFullText ? normalizedText : truncatedText
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

function parseJsonObjectSummary(text) {
  if (typeof text !== 'string') return null;
  const trimmed = text.trim();
  if (!trimmed.startsWith('{') || !trimmed.endsWith('}')) return null;

  try {
    const parsed = JSON.parse(trimmed);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function hasCanonicalCronProofLines(value) {
  if (!Array.isArray(value) || value.length < 5) return false;
  const lines = value.map((entry) => String(entry ?? '').trim());
  return [
    /^state:\s*state-\d+\s*\(.+\)$/i.test(lines[0] ?? ''),
    /^provider:\s*.+$/i.test(lines[1] ?? ''),
    /^shouldPersist:\s*(true|false)$/i.test(lines[2] ?? ''),
    /^persisted:\s*(true|false)$/i.test(lines[3] ?? ''),
    /^failures:\s*(none|.+)$/i.test(lines[4] ?? '')
  ].every(Boolean);
}

function inspectLatestRunSummaryFidelity(latest) {
  if (!latest) return [];

  const normalizedStatus = String(latest.status ?? 'unknown').toLowerCase();
  const successStates = new Set(['completed', 'complete', 'succeeded', 'success', 'ok']);
  if (!successStates.has(normalizedStatus)) return [];

  const latestText = String(latest.text ?? '');
  const lowerText = latestText.toLowerCase();
  const warnings = [];

  if (!latestText) {
    warnings.push('Latest successful cron run did not record any Bull Bear summary text, so proof surfaces cannot confirm the exact /api/capture fields that were returned.');
    return warnings;
  }

  const parsedJsonSummary = parseJsonObjectSummary(latestText);
  const jsonSummaryHasCanonicalProof = parsedJsonSummary
    && typeof parsedJsonSummary.stateId === 'string'
    && /^state-\d+$/i.test(parsedJsonSummary.stateId)
    && typeof parsedJsonSummary.stateLabel === 'string'
    && parsedJsonSummary.stateLabel.trim().length > 0
    && typeof parsedJsonSummary.provider === 'string'
    && parsedJsonSummary.provider.trim().length > 0
    && typeof parsedJsonSummary.shouldPersist === 'boolean'
    && typeof parsedJsonSummary.persisted === 'boolean'
    && Array.isArray(parsedJsonSummary.failures)
    && hasCanonicalCronProofLines(parsedJsonSummary.cronProofLines);

  if (jsonSummaryHasCanonicalProof) {
    return warnings;
  }

  const providerNotReturned = /provider:\s*(?:$|null|unavailable|not returned)/im.test(latestText);
  const persistedNotReturned = /persisted:\s*(null|unavailable|not returned)/i.test(latestText);
  const stateNotReturnedCanonically = /state:\s*not returned in canonical id\+label form;/i.test(latestText);
  const stateDirectionObjectInline = /state:\s*\{[^\n]*"direction"/i.test(latestText);
  const stateRawDirectionObject = /raw response was\s*\{[^\n]*"direction"/i.test(latestText);

  if (providerNotReturned) {
    warnings.push(stateNotReturnedCanonically || stateRawDirectionObject
      ? 'Latest successful cron run shows /api/capture did not return a concrete provider value; the cron summary preserved that omission instead of inventing one.'
      : 'Latest successful cron run summary is missing a concrete provider value from /api/capture.');
  }

  if (/shouldpersist:\s*(true|false)(?:\s|$)/im.test(latestText) === false) {
    warnings.push('Latest successful cron run summary does not preserve the canonical lowercase shouldPersist boolean from /api/capture.');
  }

  if (persistedNotReturned) {
    warnings.push('Latest successful cron run summary is missing a concrete persisted value from /api/capture.');
  }

  if (!/state-\d+/i.test(latestText)) {
    warnings.push(stateNotReturnedCanonically || stateRawDirectionObject
      ? 'Latest successful cron run shows /api/capture did not return the canonical Bull Bear state id/label; the cron summary preserved the raw non-canonical state payload instead of inventing one.'
      : 'Latest successful cron run summary does not include the canonical Bull Bear state id/label; it appears to be using a degraded state summary instead.');
  }

  if (stateDirectionObjectInline) {
    warnings.push('Latest successful cron run summary substituted a direction/intensity object for the canonical Bull Bear state id/label.');
  } else if (stateRawDirectionObject) {
    warnings.push('Latest successful cron run summary records that /api/capture returned a direction/intensity object instead of the canonical Bull Bear state id/label.');
  }

  if (/failures:\s*null/i.test(lowerText)) {
    warnings.push('Latest successful cron run summary reports failures as null instead of an explicit none-or-list result, so the capture proof is lossy.');
  }

  return warnings;
}

function classifyRecentRuns(entries, staleHours = 2, installedJob = null) {
  const latest = entries[0] ?? null;
  if (!latest) {
    const runningAtMs = parseTimestamp(installedJob?.state?.runningAtMs ?? null);
    if (runningAtMs !== null) {
      const latestRunAgeMs = Math.max(0, Date.now() - runningAtMs);
      return {
        verdict: 'running',
        reason: `Installed cron job is currently running and started ${formatAge(latestRunAgeMs)} ago, but no persisted run-history entry has landed yet.`,
        latestRunAgeMs,
        latestRunAge: formatAge(latestRunAgeMs),
        staleThresholdHours: staleHours
      };
    }

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
  const latestText = String(latest.text ?? '').toLowerCase();

  const failedStates = new Set(['failed', 'error', 'timed_out', 'timeout', 'cancelled', 'canceled']);
  const successStates = new Set(['completed', 'complete', 'succeeded', 'success', 'ok']);
  const runningStates = new Set(['running', 'in_progress', 'in-progress', 'started']);
  const queuedStates = new Set(['queued', 'pending', 'scheduled', 'created']);
  const staleThresholdMs = staleHours * 60 * 60 * 1000;
  const successButFailedSignals = [
    'capture failed',
    'attempted once:',
    'http 4',
    'http 5',
    'x-vercel-error',
    'deployment_disabled',
    'state: unavailable',
    'provider: unavailable',
    'shouldpersist: unavailable',
    'persisted: unavailable'
  ];
  const failureListMatch = latestText.match(/failures:\s*(\[[\s\S]*?\]|none\b)/i);
  const failureItems = failureListMatch && failureListMatch[1] && !/^none\b/i.test(failureListMatch[1])
    ? [...failureListMatch[1].matchAll(/"([^"]+)"/g)].map((match) => match[1].trim()).filter(Boolean)
    : [];
  const benignFailureItemPatterns = [
    /capture request still succeeded/i,
    /preface typo/i,
    /warning/i,
    /non-fatal/i,
    /succeeded anyway/i
  ];
  const hasNonBenignFailureItem = failureItems.some((item) => !benignFailureItemPatterns.some((pattern) => pattern.test(item)));
  const hasSuccessButFailedSignal = successButFailedSignals.some((signal) => latestText.includes(signal))
    || hasNonBenignFailureItem;

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
    if (hasSuccessButFailedSignal) {
      return {
        verdict: 'failing',
        reason: 'Latest cron run reported status ok, but its summary text contains Bull Bear capture failure signals.',
        latestRunAgeMs,
        latestRunAge: formatAge(latestRunAgeMs),
        staleThresholdHours: staleHours
      };
    }

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
  const installedMessage = String(installed.payload?.message ?? '');
  const usingCompactCompatibilityMessage = installedMessage === compactCronMessage
    || isKnownCompactCompatibilityMessage(installedMessage);

  const checks = [
    [installed.name === expected.name, `name mismatch: expected ${JSON.stringify(expected.name)}, received ${JSON.stringify(installed.name)}`],
    [installed.schedule?.kind === expected.schedule?.kind, `schedule.kind mismatch: expected ${JSON.stringify(expected.schedule?.kind)}, received ${JSON.stringify(installed.schedule?.kind)}`],
    [installed.schedule?.expr === expected.schedule?.expr, `schedule.expr mismatch: expected ${JSON.stringify(expected.schedule?.expr)}, received ${JSON.stringify(installed.schedule?.expr)}`],
    [installed.schedule?.tz === expected.schedule?.tz, `schedule.tz mismatch: expected ${JSON.stringify(expected.schedule?.tz)}, received ${JSON.stringify(installed.schedule?.tz)}`],
    [installed.sessionTarget === expected.sessionTarget, `sessionTarget mismatch: expected ${JSON.stringify(expected.sessionTarget)}, received ${JSON.stringify(installed.sessionTarget)}`],
    [installed.payload?.kind === expected.payload?.kind, `payload.kind mismatch: expected ${JSON.stringify(expected.payload?.kind)}, received ${JSON.stringify(installed.payload?.kind)}`],
    [installed.payload?.timeoutSeconds === expected.payload?.timeoutSeconds, `payload.timeoutSeconds mismatch: expected ${JSON.stringify(expected.payload?.timeoutSeconds)}, received ${JSON.stringify(installed.payload?.timeoutSeconds)}`],
    [installed.delivery?.mode === expected.delivery?.mode, `delivery.mode mismatch: expected ${JSON.stringify(expected.delivery?.mode)}, received ${JSON.stringify(installed.delivery?.mode)}`]
  ];

  for (const [ok, message] of checks) {
    if (!ok) errors.push(message);
  }

  if (installedMessage !== expected.payload?.message) {
    if (usingCompactCompatibilityMessage && !strict) {
      warnings.push('payload.message uses the known older-CLI compact compatibility text instead of the full committed artifact message.');
    } else {
      errors.push('payload.message mismatch: installed job does not exactly match the committed artifact message.');
    }
  }

  if (installed.enabled !== expected.enabled) {
    const message = `enabled mismatch: artifact expects ${expected.enabled}, installed job is ${installed.enabled}.`;
    if (strict) {
      errors.push(message);
    } else {
      warnings.push(message);
    }
  }

  if (usingCompactCompatibilityMessage && !strict) {
    const compactRequiredPhrases = installedMessage.includes('http://127.0.0.1:3078/api/capture-proof?format=text')
      ? [
          'http://127.0.0.1:3078/api/capture-proof?format=text',
          'output that single response body exactly, byte for byte',
          'Do not call cash-grab.vercel.app'
        ]
      : [
          'http://127.0.0.1:3078/api/capture-proof',
          'state',
          'provider',
          'shouldPersist',
          'persisted',
          'failures',
          'Do not call cash-grab.vercel.app'
        ];

    const compactAnyOfPhraseSets = installedMessage.includes('http://127.0.0.1:3078/api/capture-proof?format=text')
      ? [
          [
            'Do not browse, search, infer, or use any other tool, source, URL, or endpoint',
            'Do not use any other URL'
          ]
        ]
      : [
          [
            'Do not use any other URL',
            'any other URL or endpoint',
            'Do not browse, search, infer, summarize, explain, translate, or use any other tool, source, URL, or endpoint'
          ]
        ];

    for (const phrase of compactRequiredPhrases) {
      if (!installedMessage.includes(phrase)) {
        errors.push(`compact compatibility payload.message is missing required phrase: ${phrase}`);
      }
    }

    for (const phraseOptions of compactAnyOfPhraseSets) {
      if (!phraseOptions.some((phrase) => installedMessage.includes(phrase))) {
        errors.push(`compact compatibility payload.message is missing one of the required phrases: ${phraseOptions.join(' | ')}`);
      }
    }

    return { errors, warnings };
  }

  const captureMentions = [
    'http://localhost:3000/api/capture',
    'persisted',
    'shouldPersist',
    'state id and label',
    'provider',
    'failure clearly'
  ];

  if (usingCompactCompatibilityMessage && !strict) {
    return { errors, warnings };
  }

  for (const phrase of captureMentions) {
    if (!installedMessage.includes(phrase)) {
      errors.push(`installed payload.message is missing required phrase: ${phrase}`);
    }
  }

  return { errors, warnings };
}

async function loadLocalRunLog(jobId, limit) {
  const runLogPath = path.join(localCronRunsDir, `${jobId}.jsonl`);

  try {
    const raw = await fs.readFile(runLogPath, 'utf8');
    const entries = raw
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => JSON.parse(line))
      .map(summarizeRun);

    return {
      entries: entries.slice(-limit),
      warning: null
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        entries: [],
        warning: null
      };
    }

    return {
      entries: [],
      warning: `Unable to load local cron run log: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

async function loadLocalJobs() {
  try {
    const raw = await fs.readFile(localCronJobsPath, 'utf8');
    const parsed = JSON.parse(raw);
    const jobs = Array.isArray(parsed?.jobs) ? parsed.jobs : [];

    return {
      jobs,
      warning: null
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return {
        jobs: [],
        warning: null
      };
    }

    return {
      jobs: [],
      warning: `Unable to load local cron jobs file: ${error instanceof Error ? error.message : String(error)}`
    };
  }
}

function sortRunsNewestFirst(entries) {
  return [...entries].sort((a, b) => {
    const aTime = parseTimestamp(a.finishedAt) ?? parseTimestamp(a.startedAt) ?? -Infinity;
    const bTime = parseTimestamp(b.finishedAt) ?? parseTimestamp(b.startedAt) ?? -Infinity;
    return bTime - aTime;
  });
}

function mergeRecentRuns(cliEntries, localEntries, limit) {
  const merged = new Map();

  for (const entry of [...cliEntries, ...localEntries]) {
    const key = JSON.stringify([
      entry.status ?? null,
      parseTimestamp(entry.startedAt),
      parseTimestamp(entry.finishedAt),
      entry.durationMs ?? null,
      entry.text ?? ''
    ]);

    if (!merged.has(key)) {
      merged.set(key, entry);
    }
  }

  return sortRunsNewestFirst([...merged.values()]).slice(0, limit);
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

  let cliEntries = [];
  let cliTotal = null;
  const warnings = [];

  try {
    const result = await runJson(resolveOpenClawCommand(), args);
    cliEntries = Array.isArray(result?.entries) ? result.entries.map(summarizeRun) : [];
    cliTotal = Number.isFinite(result?.total) ? result.total : cliEntries.length;
  } catch (error) {
    warnings.push(`Unable to load cron run history from CLI: ${error instanceof Error ? error.message : String(error)}`);
  }

  const localRunLog = await loadLocalRunLog(jobId, options.runsLimit);
  if (localRunLog.warning) {
    warnings.push(localRunLog.warning);
  }

  const mergedEntries = mergeRecentRuns(cliEntries, localRunLog.entries, options.runsLimit);
  if (mergedEntries.length === 0) {
    warnings.push('No run-history entries were returned for the installed job yet.');
  }

  return {
    inspected: true,
    total: cliTotal ?? mergedEntries.length,
    limit: options.runsLimit,
    entries: mergedEntries,
    warnings
  };
}

function renderConsoleSummary(summary) {
  const lines = [
    'Bull Bear installed-cron verification',
    `Artifact: ${summary.artifactPath}`,
    `Expected job name: ${summary.expectedName}`,
    `Enabled installed matches: ${summary.matchCount}`
  ];

  if (Array.isArray(summary.disabledMatches) && summary.disabledMatches.length > 0) {
    lines.push(`Disabled legacy matches: ${summary.disabledMatches.length}`);
  }

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
    `- Enabled installed matches: ${summary.matchCount}`,
    `- Run health: ${summary.runHealth.verdict} - ${summary.runHealth.reason}`
  ];

  if (Array.isArray(summary.disabledMatches) && summary.disabledMatches.length > 0) {
    lines.push(`- Disabled legacy matches: ${summary.disabledMatches.length}`);
  }

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

  const localJobs = await loadLocalJobs();
  let result = null;
  let jobs = [];
  let cliListWarning = null;
  let loadedJobsFromLocalFile = false;
  const shouldPreferLocalJobs = !options.url && !options.token;

  if (shouldPreferLocalJobs && localJobs.jobs.length > 0) {
    jobs = localJobs.jobs;
    loadedJobsFromLocalFile = true;
  } else {
    try {
      result = await runJson(openclawCommand, args);
      jobs = Array.isArray(result?.jobs) ? result.jobs : [];
    } catch (error) {
      cliListWarning = `Unable to load installed cron jobs from CLI: ${error instanceof Error ? error.message : String(error)}`;
    }

    if (jobs.length === 0 && localJobs.jobs.length > 0) {
      jobs = localJobs.jobs;
      loadedJobsFromLocalFile = true;
    }
  }
  const expectedName = options.name ?? expectedJob.name;
  const matches = jobs.filter((job) => job?.name === expectedName);
  const enabledMatches = matches.filter((job) => job?.enabled !== false);
  const disabledMatches = matches.filter((job) => job?.enabled === false);
  const primaryMatch = enabledMatches[0] ?? null;
  const recentRuns = await loadRecentRuns(primaryMatch?.id ?? null, options);
  const runHealth = classifyRecentRuns(recentRuns.entries, options.staleHours, primaryMatch);

  let summary = {
    checkedAt: new Date().toISOString(),
    artifactPath: path.relative(projectRoot, artifactPath),
    expectedName,
    totalJobsSeen: jobs.length,
    matchCount: enabledMatches.length,
    duplicateCount: enabledMatches.length,
    duplicatesDetected: enabledMatches.length > 1,
    installedJobs: enabledMatches.map(summarizeJob),
    disabledMatches: disabledMatches.map(summarizeJob),
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

  if (localJobs.warning) {
    summary.warnings.push(localJobs.warning);
  }

  if (cliListWarning) {
    summary.warnings.push(cliListWarning);
  }

  if (loadedJobsFromLocalFile) {
    summary.warnings.push(shouldPreferLocalJobs
      ? `Loaded installed cron jobs from local file ${path.relative(projectRoot, localCronJobsPath)} for local verification.`
      : `Loaded installed cron jobs from local fallback file ${path.relative(projectRoot, localCronJobsPath)} because the CLI returned no jobs.`);
  }

  if (enabledMatches.length === 0) {
    if (disabledMatches.length > 0) {
      summary.errors.push(`Found ${disabledMatches.length} disabled cron jobs named ${JSON.stringify(expectedName)}, but no enabled installed job matches the committed Bull Bear cron artifact.`);
    } else {
      summary.errors.push(`No installed cron job matched name ${JSON.stringify(expectedName)}.`);
    }
  }

  if (enabledMatches.length > 1) {
    summary.errors.push(`Found ${enabledMatches.length} enabled installed cron jobs named ${JSON.stringify(expectedName)}; expected exactly one.`);
  }

  if (enabledMatches.length === 0 && disabledMatches.length === 0) {
    summary.errors.push(`No installed cron job matched name ${JSON.stringify(expectedName)}.`);
  }

  if (enabledMatches.length >= 1) {
    const comparison = compareInstalledJob(enabledMatches[0], expectedJob, options.strict);
    summary.warnings.push(...comparison.warnings);
    summary.errors.push(...comparison.errors);
  }

  summary.warnings.push(...inspectLatestRunSummaryFidelity(recentRuns.entries[0] ?? null));

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
