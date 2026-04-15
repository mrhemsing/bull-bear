#!/usr/bin/env node

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
const stateIndex = Number(payload?.snapshot?.stateIndex ?? payload?.manifest?.index);
if (!Number.isInteger(stateIndex) || stateIndex < 1) {
  throw new Error(`Could not determine live state index from /api/live payload: ${JSON.stringify({ snapshotStateIndex: payload?.snapshot?.stateIndex, manifestIndex: payload?.manifest?.index })}`);
}

const key = String(stateIndex).padStart(2, '0');
const expectedStill = `/states/${key}.png`;
const expectedLoops = ['a', 'b', 'c'].map((suffix) => `/states/${key}-${suffix}.mp4`);

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
  if (!Array.isArray(loops) || loops.length !== 3) {
    throw new Error(`/api/live ${label} did not include exactly 3 imported loops: ${JSON.stringify(loops)}`);
  }

  for (const expectedLoop of expectedLoops) {
    if (!loops.includes(expectedLoop)) {
      throw new Error(`/api/live ${label} is missing imported loop ${expectedLoop}: ${JSON.stringify(loops)}`);
    }
  }
}

if (!expectedLoops.includes(payload?.activeLoop)) {
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
