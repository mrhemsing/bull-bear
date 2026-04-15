#!/usr/bin/env node

const baseUrl = process.env.BULL_BEAR_BASE_URL ?? 'http://127.0.0.1:3004';
const visualUpdateUrl = new URL('/visual-update', baseUrl).toString();

const response = await fetch(visualUpdateUrl, {
  headers: {
    'user-agent': 'bull-bear-visual-update-check/1.0'
  }
});

if (!response.ok) {
  throw new Error(`Visual update request failed: ${response.status} ${response.statusText}`);
}

const html = (await response.text()).replace(/\\u0026/g, '&');
const importedStillMatches = Array.from(html.matchAll(/<img[^>]+src="(\/states\/\d{2}\.png)"/g), (match) => match[1]);
const expectedImportedStills = ['/states/08.png', '/states/09.png', '/states/10.png', '/states/11.png', '/states/12.png'];

for (const expectedStill of expectedImportedStills) {
  if (!importedStillMatches.includes(expectedStill)) {
    throw new Error(`Missing imported visual-update still ${expectedStill}.`);
  }
}

if (html.includes('/states/state-')) {
  throw new Error('Visual update output still includes old nested /states/state-* asset paths.');
}

console.log(JSON.stringify({
  status: 'ok',
  visualUpdateUrl,
  importedStillCount: importedStillMatches.length,
  importedStills: expectedImportedStills
}, null, 2));
