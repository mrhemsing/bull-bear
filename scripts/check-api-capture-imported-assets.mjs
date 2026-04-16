#!/usr/bin/env node

const baseUrl = process.env.BULL_BEAR_BASE_URL ?? 'http://127.0.0.1:3078';
const captureUrl = new URL('/api/capture', baseUrl).toString();

const response = await fetch(captureUrl, {
  headers: {
    'user-agent': 'bull-bear-api-capture-check/1.0'
  }
});

if (!response.ok) {
  throw new Error(`Capture API request failed: ${response.status} ${response.statusText}`);
}

const payload = await response.json();
const snapshot = payload?.snapshot ?? {};
const stateIndex = Number(snapshot?.stateIndex ?? payload?.frame?.stateIndex);
if (!Number.isInteger(stateIndex) || stateIndex < 1) {
  throw new Error(`Could not determine capture state index from /api/capture payload: ${JSON.stringify({ snapshotStateIndex: snapshot?.stateIndex, frameStateIndex: payload?.frame?.stateIndex })}`);
}

if (snapshot?.source !== 'Coinbase spot candles + Binance futures positioning + Alternative.me Fear & Greed') {
  throw new Error(`/api/capture snapshot.source did not report the new current-market model: ${snapshot?.source}`);
}

const key = String(stateIndex).padStart(2, '0');
const expectedStill = `/states/${key}.png`;

const checks = [
  ['generation.provider', payload?.generation?.provider, 'manifest'],
  ['provider', payload?.provider, 'manifest'],
  ['frame.imageUrl', payload?.frame?.imageUrl, expectedStill],
  ['generation.imageUrl', payload?.generation?.imageUrl, expectedStill]
];

for (const [label, actual, expected] of checks) {
  if (actual !== expected) {
    throw new Error(`/api/capture ${label} expected ${expected} but received ${actual}`);
  }
}

if (typeof payload?.shouldPersist !== 'boolean') {
  throw new Error(`/api/capture shouldPersist expected boolean but received ${payload?.shouldPersist}`);
}

if (typeof payload?.persisted !== 'boolean') {
  throw new Error(`/api/capture persisted expected boolean but received ${payload?.persisted}`);
}

if (payload.persisted !== payload.shouldPersist) {
  throw new Error(`/api/capture persisted ${payload?.persisted} did not match shouldPersist ${payload?.shouldPersist}`);
}

const serialized = JSON.stringify(payload);
if (serialized.includes('/states/state-')) {
  throw new Error('/api/capture payload still includes old nested /states/state-* asset paths.');
}

console.log(JSON.stringify({
  status: 'ok',
  captureUrl,
  stateIndex,
  source: snapshot?.source,
  provider: payload.provider,
  frameImageUrl: payload?.frame?.imageUrl,
  generationImageUrl: payload?.generation?.imageUrl,
  persisted: payload?.persisted,
  shouldPersist: payload?.shouldPersist
}, null, 2));
