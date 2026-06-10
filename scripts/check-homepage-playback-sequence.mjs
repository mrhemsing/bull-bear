#!/usr/bin/env node

import { chromium } from 'playwright';

const baseUrl = process.env.BULL_BEAR_BASE_URL ?? 'http://127.0.0.1:3078';
const homepageUrl = new URL('/', baseUrl).toString();
const liveUrl = new URL('/api/live', baseUrl).toString();

const liveResponse = await fetch(liveUrl, {
  headers: {
    'user-agent': 'bull-bear-homepage-playback-check/1.0'
  }
});

if (!liveResponse.ok) {
  throw new Error(`/api/live request failed: ${liveResponse.status} ${liveResponse.statusText}`);
}

const livePayload = await liveResponse.json();
const liveStateIndex = Number(livePayload?.snapshot?.stateIndex ?? livePayload?.manifest?.index);
if (!Number.isInteger(liveStateIndex) || liveStateIndex < 1) {
  throw new Error(`Could not determine live state index from /api/live payload: ${JSON.stringify({ snapshotStateIndex: livePayload?.snapshot?.stateIndex, manifestIndex: livePayload?.manifest?.index })}`);
}

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage();

try {
  await page.goto(homepageUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('[data-testid="hero-media-video"]', { state: 'attached' });

  const initial = await page.locator('[data-testid="hero-media-video"]').evaluate((video) => ({
    src: video.getAttribute('src'),
    poster: video.getAttribute('poster'),
    loopIndex: video.getAttribute('data-loop-index'),
    loopSrc: video.getAttribute('data-loop-src'),
    loopSequence: video.getAttribute('data-loop-sequence')
  }));

  if (!initial.src || !initial.poster || !initial.loopSequence) {
    throw new Error(`Missing hero playback metadata: ${JSON.stringify(initial)}`);
  }

  const stateMatch = initial.poster.match(/\/states\/(\d{2})\.png$/);
  if (!stateMatch) {
    throw new Error(`Hero poster did not use flat imported still naming: ${initial.poster}`);
  }

  const key = stateMatch[1];
  if (key !== String(liveStateIndex).padStart(2, '0')) {
    throw new Error(`Homepage hero state ${key} did not match /api/live state ${String(liveStateIndex).padStart(2, '0')}.`);
  }

  const expectedSequence = ['a', 'b', 'c'].map((suffix) => `/states/${key}-${suffix}.mp4`);
  const declaredSequence = initial.loopSequence.split('|');

  if (JSON.stringify(declaredSequence) !== JSON.stringify(expectedSequence)) {
    throw new Error(`Hero declared sequence ${JSON.stringify(declaredSequence)} did not match expected ${JSON.stringify(expectedSequence)}.`);
  }

  const preloadHints = await page.locator('link[as="video"]').evaluateAll((links) => links.map((link) => ({
    rel: link.getAttribute('rel'),
    href: link.getAttribute('href')
  })));
  const preloadHref = preloadHints.find((link) => link.rel === 'preload')?.href;
  if (!preloadHref || !preloadHref.endsWith(initial.src)) {
    throw new Error(`Hero did not emit a high-priority preload hint for the active loop: ${JSON.stringify({ initialSrc: initial.src, preloadHints })}`);
  }

  const prefetchedLoops = preloadHints.filter((link) => link.rel === 'prefetch').map((link) => link.href ?? '');
  const expectedPrefetches = expectedSequence.filter((loop) => loop !== initial.src);
  for (const loop of expectedPrefetches) {
    if (!prefetchedLoops.some((href) => href.endsWith(loop))) {
      throw new Error(`Hero did not emit a prefetch hint for warm loop ${loop}: ${JSON.stringify(prefetchedLoops)}`);
    }
  }

  const hiddenPreloads = await page.locator('[data-testid="hero-media-preload-video"]').evaluateAll((videos) => videos.map((video) => ({
    src: video.getAttribute('src'),
    preload: video.getAttribute('preload'),
    loopSrc: video.getAttribute('data-loop-src')
  })));
  if (hiddenPreloads.length !== expectedPrefetches.length) {
    throw new Error(`Expected ${expectedPrefetches.length} hidden loop preload videos, found ${hiddenPreloads.length}: ${JSON.stringify(hiddenPreloads)}`);
  }
  for (const loop of expectedPrefetches) {
    const match = hiddenPreloads.find((video) => video.src === loop && video.loopSrc === loop);
    if (!match || match.preload !== 'auto') {
      throw new Error(`Missing hidden auto-preload video for ${loop}: ${JSON.stringify(hiddenPreloads)}`);
    }
  }

  const startIndex = expectedSequence.indexOf(initial.src);
  if (startIndex < 0) {
    throw new Error(`Initial hero src ${initial.src} was not in declared sequence ${JSON.stringify(expectedSequence)}.`);
  }

  const observed = [initial.src];

  for (let step = 0; step < 3; step += 1) {
    const expectedIndex = (startIndex + step + 1) % expectedSequence.length;
    const expectedSrc = expectedSequence[expectedIndex];

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
      { expectedSrc, expectedIndex }
    );

    const currentSrc = await page.locator('[data-testid="hero-media-video"]').getAttribute('src');
    observed.push(currentSrc);
  }

  const expectedObserved = Array.from({ length: expectedSequence.length + 1 }, (_, index) => expectedSequence[(startIndex + index) % expectedSequence.length]);
  if (JSON.stringify(observed) !== JSON.stringify(expectedObserved)) {
    throw new Error(`Observed playback order ${JSON.stringify(observed)} did not match ${JSON.stringify(expectedObserved)}.`);
  }

  console.log(JSON.stringify({
    status: 'ok',
    homepageUrl,
    liveUrl,
    key,
    poster: initial.poster,
    declaredSequence,
    observed
  }, null, 2));
} finally {
  await browser.close();
}
