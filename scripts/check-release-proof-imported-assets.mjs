#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const baseUrl = process.env.BULL_BEAR_BASE_URL ?? 'http://127.0.0.1:3004';
const operatorUrl = new URL('/api/operator-status', baseUrl).toString();
const releaseUrl = new URL('/api/release-status', baseUrl).toString();

async function fetchJsonViaCurl(url) {
  const curlBinary = process.platform === 'win32' ? 'curl.exe' : 'curl';
  const { stdout } = await execFile(curlBinary, [
    '--silent',
    '--show-error',
    '--location',
    '--header',
    'Accept: application/json',
    url
  ]);

  return JSON.parse(stdout);
}

async function fetchJson(url) {
  return fetchJsonViaCurl(url);
}

function collectNestedMatches(value, trail = '$', matches = []) {
  if (typeof value === 'string') {
    if (value.includes('/states/state-') || value.includes('public/states/state-')) {
      matches.push({ trail, value });
    }
    return matches;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => collectNestedMatches(entry, `${trail}[${index}]`, matches));
    return matches;
  }

  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      collectNestedMatches(entry, `${trail}.${key}`, matches);
    }
  }

  return matches;
}

const [operatorPayload, releasePayload] = await Promise.all([
  fetchJson(operatorUrl),
  fetchJson(releaseUrl)
]);

const nestedMatches = [
  ...collectNestedMatches(operatorPayload, '$operator'),
  ...collectNestedMatches(releasePayload, '$release')
];

if (nestedMatches.length > 0) {
  throw new Error(`Operator/release proof surfaces still expose nested state asset paths: ${JSON.stringify(nestedMatches.slice(0, 5))}`);
}

if (!['READY', 'WATCH', 'ATTENTION'].includes(operatorPayload?.overall?.level ?? '')) {
  throw new Error(`Operator status overall.level was unexpected: ${operatorPayload?.overall?.level}`);
}

if (!['PASS', 'WATCH', 'FAIL'].includes(releasePayload?.verdict ?? '')) {
  throw new Error(`Release status verdict was unexpected: ${releasePayload?.verdict}`);
}

if (!['rollout-proof-only', 'complete-no-open-work', 'assets-or-mixed'].includes(releasePayload?.activeWorkstream ?? '')) {
  throw new Error(`Release status activeWorkstream was unexpected: ${releasePayload?.activeWorkstream}`);
}

if (releasePayload?.assets?.fullCoverageComplete !== true) {
  throw new Error('Release status assets.fullCoverageComplete was not true.');
}

if (Number(releasePayload?.assets?.approvedStills) !== 20) {
  throw new Error(`Release status approved still count was unexpected: ${releasePayload?.assets?.approvedStills}`);
}

if (Number(releasePayload?.assets?.approvedLoops) !== 60) {
  throw new Error(`Release status approved loop count was unexpected: ${releasePayload?.assets?.approvedLoops}`);
}

console.log(JSON.stringify({
  status: 'ok',
  operatorUrl,
  releaseUrl,
  operatorLevel: operatorPayload.overall.level,
  releaseVerdict: releasePayload.verdict,
  activeWorkstream: releasePayload.activeWorkstream,
  assets: {
    fullCoverageComplete: releasePayload.assets.fullCoverageComplete,
    approvedStills: releasePayload.assets.approvedStills,
    approvedLoops: releasePayload.assets.approvedLoops,
    pendingStates: releasePayload.assets.pendingStates
  }
}, null, 2));
