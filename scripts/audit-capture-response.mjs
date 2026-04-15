#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const generatedDir = path.join(projectRoot, 'data', 'generated', 'runtime-capture-audit');
const latestPath = path.join(generatedDir, 'latest.json');
const historyPath = path.join(generatedDir, 'history.ndjson');
const defaultCaptureBaseUrl = process.env.BULL_BEAR_APP_URL?.trim() || 'http://127.0.0.1:3078';

function parseStringFlag(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  return match ? match.slice(prefix.length) : fallback;
}

function parseTimeoutFlag(fallback) {
  const prefix = '--timeout-ms=';
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (!match) return fallback;
  const value = Number(match.slice(prefix.length));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function buildSummary(payload, url, capturedAt) {
  const frame = payload?.frame ?? null;
  const snapshot = payload?.snapshot ?? null;
  const generation = payload?.generation ?? null;

  return {
    capturedAt,
    url,
    httpStatus: payload?.httpStatus ?? 200,
    ok: payload?.error ? false : true,
    mode: payload?.mode ?? null,
    shouldPersist: payload?.shouldPersist ?? null,
    persisted: payload?.persisted ?? null,
    stateId: payload?.stateId ?? (frame?.stateIndex ? `state-${String(frame.stateIndex).padStart(2, '0')}` : null),
    stateLabel: payload?.stateLabel ?? frame?.stateLabel ?? snapshot?.stateLabel ?? null,
    provider: payload?.provider ?? generation?.provider ?? frame?.provider ?? null,
    generationStatus: generation?.status ?? null,
    imageUrl: frame?.imageUrl ?? generation?.imageUrl ?? null,
    frameTimestamp: frame?.timestamp ?? null,
    note: generation?.note ?? frame?.notes ?? null,
    failures: Array.isArray(payload?.failures) ? payload.failures : null,
    cronProofLines: Array.isArray(payload?.cronProofLines) ? payload.cronProofLines : null,
    cronProof: typeof payload?.cronProof === 'string' ? payload.cronProof : null,
    error: payload?.error ?? null
  };
}

async function ensureDir(dirPath) {
  await fs.mkdir(dirPath, { recursive: true });
}

async function appendHistory(entry) {
  await fs.appendFile(historyPath, `${JSON.stringify(entry)}\n`, 'utf8');
}

async function main() {
  const defaultUrl = process.env.BULL_BEAR_CAPTURE_URL?.trim() || `${defaultCaptureBaseUrl.replace(/\/$/, '')}/api/capture`;
  const defaultTimeoutMs = (() => {
    const raw = process.env.BULL_BEAR_CAPTURE_TIMEOUT_MS?.trim();
    const parsed = raw ? Number(raw) : Number.NaN;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 30000;
  })();

  const url = parseStringFlag('url', defaultUrl);
  const timeoutMs = parseTimeoutFlag(defaultTimeoutMs);
  const capturedAt = new Date().toISOString();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  let response;
  let payload;

  try {
    response = await fetch(url, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        Accept: 'application/json'
      }
    });
    payload = await response.json();
  } catch (error) {
    const failureEntry = buildSummary(
      {
        error: error instanceof Error ? error.message : String(error),
        httpStatus: 0
      },
      url,
      capturedAt
    );

    await ensureDir(generatedDir);
    await fs.writeFile(latestPath, `${JSON.stringify(failureEntry, null, 2)}\n`, 'utf8');
    await appendHistory(failureEntry);

    console.error('Bull Bear capture audit failed.');
    console.error(JSON.stringify(failureEntry, null, 2));
    process.exitCode = 1;
    return;
  } finally {
    clearTimeout(timeout);
  }

  const entry = buildSummary(
    {
      ...payload,
      httpStatus: response.status
    },
    url,
    capturedAt
  );

  await ensureDir(generatedDir);
  await fs.writeFile(latestPath, `${JSON.stringify(entry, null, 2)}\n`, 'utf8');
  await appendHistory(entry);

  console.log(JSON.stringify(entry, null, 2));

  if (!response.ok || payload?.error) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Bull Bear capture audit crashed.');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
