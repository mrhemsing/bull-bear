#!/usr/bin/env node

import { chromium } from 'playwright';

const baseUrl = process.env.BULL_BEAR_BASE_URL ?? 'http://127.0.0.1:3078';
const dashboardUrl = new URL('/dashboard', baseUrl).toString();

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(dashboardUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="hero-media-video"]', { state: 'attached' });

  const initial = await page.locator('[data-testid="hero-media-video"]').evaluate((video) => ({
    src: video.getAttribute('src'),
    poster: video.getAttribute('poster'),
    loopIndex: video.getAttribute('data-loop-index'),
    loopSrc: video.getAttribute('data-loop-src'),
    loopSequence: video.getAttribute('data-loop-sequence')
  }));

  if (!initial.src || !initial.poster || !initial.loopSequence) {
    throw new Error(`Missing dashboard playback metadata: ${JSON.stringify(initial)}`);
  }

  const stateMatch = initial.poster.match(/\/states\/(\d{2})\.png$/);
  if (!stateMatch) {
    throw new Error(`Dashboard hero poster did not use flat imported still naming: ${initial.poster}`);
  }

  const key = stateMatch[1];
  const expectedSequence = ['a', 'b', 'c'].map((suffix) => `/states/${key}-${suffix}.mp4`);
  const declaredSequence = initial.loopSequence.split('|');

  if (JSON.stringify(declaredSequence) !== JSON.stringify(expectedSequence)) {
    throw new Error(`Dashboard declared sequence ${JSON.stringify(declaredSequence)} did not match expected ${JSON.stringify(expectedSequence)}.`);
  }

  const observed = [initial.src];

  for (let step = 0; step < 3; step += 1) {
    await page.evaluate(() => {
      const debug = window.__heroMediaDebug;
      if (!debug) throw new Error('window.__heroMediaDebug was not available.');
      debug.advanceLoop();
    });
    await page.waitForFunction(
      ({ expectedSrc, expectedIndex }) => {
        const video = document.querySelector('[data-testid="hero-media-video"]');
        return !!video && video.getAttribute('src') === expectedSrc && video.getAttribute('data-loop-index') === String(expectedIndex);
      },
      { expectedSrc: expectedSequence[(step + 1) % expectedSequence.length], expectedIndex: (step + 1) % expectedSequence.length }
    );

    const currentSrc = await page.locator('[data-testid="hero-media-video"]').getAttribute('src');
    observed.push(currentSrc);
  }

  const expectedObserved = [...expectedSequence, expectedSequence[0]];
  if (JSON.stringify(observed) !== JSON.stringify(expectedObserved)) {
    throw new Error(`Observed dashboard playback order ${JSON.stringify(observed)} did not match ${JSON.stringify(expectedObserved)}.`);
  }

  console.log(JSON.stringify({
    status: 'ok',
    dashboardUrl,
    key,
    poster: initial.poster,
    declaredSequence,
    observed
  }, null, 2));
} finally {
  await browser.close();
}
