#!/usr/bin/env node

const baseUrl = process.env.BULL_BEAR_BASE_URL ?? 'http://127.0.0.1:3004';
const stillsUrl = new URL('/stills', baseUrl).toString();

const response = await fetch(stillsUrl, {
  headers: {
    'user-agent': 'bull-bear-stills-check/1.0'
  }
});

if (!response.ok) {
  throw new Error(`Stills page request failed: ${response.status} ${response.statusText}`);
}

const html = await response.text();
const stillMatches = Array.from(html.matchAll(/<img[^>]+src="(\/states\/\d{2}\.png)"/g), (match) => match[1]);
const expectedStates = Array.from({ length: 20 }, (_, index) => String(index + 1).padStart(2, '0'));

if (stillMatches.length !== 20) {
  throw new Error(`Expected 20 flat still image sources, found ${stillMatches.length}.`);
}

if (html.includes('/states/state-')) {
  throw new Error('Stills page output still includes old nested /states/state-* asset paths.');
}

for (const key of expectedStates) {
  const expectedStill = `/states/${key}.png`;
  if (!stillMatches.includes(expectedStill)) {
    throw new Error(`Missing imported still ${expectedStill} in stills page output.`);
  }
}

console.log(JSON.stringify({
  status: 'ok',
  stillsUrl,
  stateCount: expectedStates.length,
  stillCount: stillMatches.length,
  firstState: expectedStates[0],
  lastState: expectedStates.at(-1)
}, null, 2));
