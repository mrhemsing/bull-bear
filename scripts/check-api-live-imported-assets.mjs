#!/usr/bin/env node

import { existsSync } from 'node:fs';

const baseUrl = process.env.BULL_BEAR_BASE_URL ?? 'http://127.0.0.1:3078';
const liveUrl = new URL('/api/live', baseUrl).toString();

const response = await fetch(liveUrl, {
  headers: {
    'user-agent': 'bull-bear-api-live-check/1.0'
  }
});

if (!response.ok) {
  throw new Error(`Live API request failed: ${response.status} ${response.statusText}`);
}

const payload = await response.json();
const snapshot = payload?.snapshot ?? {};
const stateIndex = Number(snapshot?.stateIndex ?? payload?.manifest?.index);
if (!Number.isInteger(stateIndex) || stateIndex < 1) {
  throw new Error(`Could not determine live state index from /api/live payload: ${JSON.stringify({ snapshotStateIndex: snapshot?.stateIndex, manifestIndex: payload?.manifest?.index })}`);
}

if (snapshot?.source !== 'Fear & Greed + Coinbase spot regime + Coinbase momentum + Binance positioning') {
  throw new Error(`/api/live snapshot.source did not report the shipped current-market model: ${snapshot?.source}`);
}

for (const field of ['fearGreedScore', 'marketBiasScore', 'momentumScore', 'derivativesScore', 'finalScore']) {
  if (typeof snapshot?.[field] !== 'number' || Number.isNaN(snapshot[field])) {
    throw new Error(`/api/live snapshot.${field} was not a valid number: ${snapshot?.[field]}`);
  }
}

if (typeof snapshot?.fearAndGreed !== 'number' || snapshot.fearAndGreed < 0 || snapshot.fearAndGreed > 100) {
  throw new Error(`/api/live snapshot.fearAndGreed was outside the expected 0-100 range: ${snapshot?.fearAndGreed}`);
}

const expectedDirection = snapshot.finalScore > 4 ? 'bull' : snapshot.finalScore < -4 ? 'bear' : 'neutral';
if (payload?.creature?.direction !== expectedDirection) {
  throw new Error(`/api/live creature.direction ${payload?.creature?.direction} did not match finalScore ${snapshot.finalScore}`);
}

const key = String(stateIndex).padStart(2, '0');
const expectedStill = `/states/${key}.png`;
const expectedLoops = ['a', 'b', 'c']
  .map((suffix) => `/states/${key}-${suffix}.mp4`)
  .filter((loopPath) => existsSync(new URL(`../public${loopPath}`, import.meta.url)));

const checks = [
  ['activeStill', payload?.activeStill, expectedStill],
  ['assets.still', payload?.assets?.still, expectedStill],
  ['manifest.still', payload?.manifest?.still, expectedStill]
];

for (const [label, actual, expected] of checks) {
  if (actual !== expected) {
    throw new Error(`/api/live ${label} expected ${expected} but received ${actual}`);
  }
}

const loopSets = [
  ['activeLoops', payload?.activeLoops],
  ['assets.loops', payload?.assets?.loops],
  ['manifest.loops', payload?.manifest?.loops]
];

for (const [label, loops] of loopSets) {
  if (!Array.isArray(loops)) {
    throw new Error(`/api/live ${label} was not an array: ${JSON.stringify(loops)}`);
  }

  if (loops.length !== expectedLoops.length) {
    throw new Error(`/api/live ${label} expected ${expectedLoops.length} imported loops but received ${loops.length}: ${JSON.stringify(loops)}`);
  }

  for (const expectedLoop of expectedLoops) {
    if (!loops.includes(expectedLoop)) {
      throw new Error(`/api/live ${label} is missing imported loop ${expectedLoop}: ${JSON.stringify(loops)}`);
    }
  }
}

if (expectedLoops.length === 0) {
  if (payload?.activeLoop !== null) {
    throw new Error(`/api/live activeLoop should be null when no Matt animation loops are shipped for state ${key}: ${payload?.activeLoop}`);
  }
} else if (!expectedLoops.includes(payload?.activeLoop)) {
  throw new Error(`/api/live activeLoop ${payload?.activeLoop} did not match imported loop set ${expectedLoops.join(', ')}`);
}

const serialized = JSON.stringify(payload);
if (serialized.includes('/states/state-')) {
  throw new Error('/api/live payload still includes old nested /states/state-* asset paths.');
}

console.log(JSON.stringify({
  status: 'ok',
  liveUrl,
  stateIndex,
  activeStill: payload.activeStill,
  activeLoop: payload.activeLoop,
  activeLoops: payload.activeLoops
}, null, 2));
