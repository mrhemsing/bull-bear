#!/usr/bin/env node

const baseUrl = process.env.BULL_BEAR_BASE_URL ?? 'http://127.0.0.1:3004';
const manifestUrl = new URL('/api/frames', baseUrl).toString();

const response = await fetch(manifestUrl, {
  headers: {
    'user-agent': 'bull-bear-frames-manifest-check/1.0'
  }
});

if (!response.ok) {
  throw new Error(`Frames manifest request failed: ${response.status} ${response.statusText}`);
}

const payload = await response.json();
const manifest = Array.isArray(payload?.manifest) ? payload.manifest : null;
if (!manifest?.length) {
  throw new Error('Frames manifest payload did not include any manifest entries.');
}

const invalidEntries = [];
for (const entry of manifest) {
  const key = String(entry.index).padStart(2, '0');
  const expectedStill = `/states/${key}.png`;
  const expectedLoops = ['a', 'b', 'c'].map((suffix) => `/states/${key}-${suffix}.mp4`);

  if (entry.still !== expectedStill) {
    invalidEntries.push({ index: entry.index, field: 'still', actual: entry.still, expected: expectedStill });
  }

  if (!Array.isArray(entry.loops) || entry.loops.length !== 3) {
    invalidEntries.push({ index: entry.index, field: 'loops', actual: entry.loops, expected: expectedLoops });
    continue;
  }

  for (const expectedLoop of expectedLoops) {
    if (!entry.loops.includes(expectedLoop)) {
      invalidEntries.push({ index: entry.index, field: 'loops', actual: entry.loops, expected: expectedLoops });
      break;
    }
  }
}

if (invalidEntries.length) {
  throw new Error(`Frames manifest still exposes non-imported runtime assets: ${JSON.stringify(invalidEntries.slice(0, 5))}`);
}

console.log(JSON.stringify({
  status: 'ok',
  manifestUrl,
  checkedStates: manifest.length,
  sample: manifest.slice(0, 3).map((entry) => ({ index: entry.index, still: entry.still, loops: entry.loops }))
}, null, 2));
