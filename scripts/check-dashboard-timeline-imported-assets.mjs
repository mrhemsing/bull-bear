#!/usr/bin/env node

import { chromium } from 'playwright';

const baseUrl = process.env.BULL_BEAR_BASE_URL ?? 'http://127.0.0.1:3078';
const dashboardUrl = new URL('/dashboard', baseUrl).toString();
const framesUrl = new URL('/api/frames', baseUrl).toString();

function readRecordedAsset(text) {
  const match = text.match(/Recorded asset:\s*(\/states\/\d{2}\.png)/i);
  return match?.[1] ?? null;
}

const framesResponse = await fetch(framesUrl, {
  headers: {
    'user-agent': 'bull-bear-dashboard-timeline-check/1.0'
  }
});

if (!framesResponse.ok) {
  throw new Error(`Frames request failed: ${framesResponse.status} ${framesResponse.statusText}`);
}

const framesPayload = await framesResponse.json();
const history = Array.isArray(framesPayload?.frames) ? framesPayload.frames : [];
if (!history.length) {
  throw new Error('Frames payload did not include any saved history to verify.');
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(dashboardUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('input[aria-label="Timeline scrubber"]', { state: 'attached' });

  const assetLocator = page.locator('text=Recorded asset:').first();
  await assetLocator.waitFor({ state: 'visible' });

  const historyCount = Math.min(history.length, 3);
  const observed = [];

  for (let index = 0; index < historyCount; index += 1) {
    await page.locator('input[aria-label="Timeline scrubber"]').fill(String(index));
    await page.waitForFunction(
      ({ expected }) => {
        const node = Array.from(document.querySelectorAll('div')).find((element) => element.textContent?.includes('Recorded asset:'));
        return node?.textContent?.includes(expected) ?? false;
      },
      { expected: history[index].imageUrl }
    );

    const recordedText = await assetLocator.textContent();
    const recordedAsset = readRecordedAsset(recordedText ?? '');
    if (!recordedAsset) {
      throw new Error(`Could not parse recorded asset from timeline detail: ${recordedText}`);
    }

    if (recordedAsset !== history[index].imageUrl) {
      throw new Error(`Timeline selection ${index} expected ${history[index].imageUrl} but showed ${recordedAsset}.`);
    }

    if (!/^\/states\/\d{2}\.png$/.test(recordedAsset)) {
      throw new Error(`Timeline selection ${index} did not use a flat imported still path: ${recordedAsset}`);
    }

    observed.push({ index, recordedAsset });
  }

  const html = await page.content();
  if (html.includes('/states/state-')) {
    throw new Error('Dashboard timeline output still includes old nested /states/state-* asset paths.');
  }

  console.log(JSON.stringify({
    status: 'ok',
    dashboardUrl,
    framesUrl,
    checkedSelections: observed
  }, null, 2));
} finally {
  await browser.close();
}
