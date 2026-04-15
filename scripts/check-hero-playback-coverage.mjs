#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright';

const projectRoot = path.resolve(import.meta.dirname, '..');
const appRoot = path.join(projectRoot, 'src', 'app');
const baseUrl = process.env.BULL_BEAR_BASE_URL ?? 'http://127.0.0.1:3078';

const expectedSurfaces = [
  {
    label: 'homepage',
    urlPath: '/'
  },
  {
    label: 'dashboard',
    urlPath: '/dashboard'
  }
];

const expectedConsumerFiles = [
  path.join(appRoot, 'live-snapshot.tsx'),
  path.join(appRoot, 'dashboard', 'page.tsx')
].sort();

const sourceFiles = [];
function collectSourceFiles(dir) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      collectSourceFiles(fullPath);
      continue;
    }
    if (entry.isFile() && /\.(ts|tsx)$/.test(entry.name)) {
      sourceFiles.push(fullPath);
    }
  }
}
collectSourceFiles(appRoot);

const heroConsumers = sourceFiles.filter((filePath) => fs.readFileSync(filePath, 'utf8').includes('<HeroMedia'));
const actualConsumerFiles = heroConsumers.slice().sort();

if (JSON.stringify(actualConsumerFiles) !== JSON.stringify(expectedConsumerFiles)) {
  throw new Error(`HeroMedia consumer coverage changed. Expected ${JSON.stringify(expectedConsumerFiles)}, found ${JSON.stringify(actualConsumerFiles)}.`);
}

const browser = await chromium.launch({ headless: true });

try {
  const results = [];

  for (const surface of expectedSurfaces) {
    const page = await browser.newPage();
    const url = new URL(surface.urlPath, baseUrl).toString();

    try {
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForSelector('[data-testid="hero-media-video"]', { state: 'attached' });

      const initial = await page.locator('[data-testid="hero-media-video"]').evaluate((video) => ({
        src: video.getAttribute('src'),
        poster: video.getAttribute('poster'),
        loopIndex: video.getAttribute('data-loop-index'),
        loopSequence: video.getAttribute('data-loop-sequence')
      }));

      if (!initial.src || !initial.poster || !initial.loopSequence) {
        throw new Error(`Missing ${surface.label} hero playback metadata: ${JSON.stringify(initial)}`);
      }

      const stateMatch = initial.poster.match(/\/states\/(\d{2})\.png$/);
      if (!stateMatch) {
        throw new Error(`${surface.label} hero poster did not use flat imported still naming: ${initial.poster}`);
      }

      const key = stateMatch[1];
      const expectedSequence = ['a', 'b', 'c'].map((suffix) => `/states/${key}-${suffix}.mp4`);
      const declaredSequence = initial.loopSequence.split('|');

      if (JSON.stringify(declaredSequence) !== JSON.stringify(expectedSequence)) {
        throw new Error(`${surface.label} declared sequence ${JSON.stringify(declaredSequence)} did not match expected ${JSON.stringify(expectedSequence)}.`);
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
        observed.push(await page.locator('[data-testid="hero-media-video"]').getAttribute('src'));
      }

      const expectedObserved = [...expectedSequence, expectedSequence[0]];
      if (JSON.stringify(observed) !== JSON.stringify(expectedObserved)) {
        throw new Error(`Observed ${surface.label} playback order ${JSON.stringify(observed)} did not match ${JSON.stringify(expectedObserved)}.`);
      }

      results.push({
        surface: surface.label,
        url,
        poster: initial.poster,
        declaredSequence,
        observed
      });
    } finally {
      await page.close();
    }
  }

  console.log(JSON.stringify({
    status: 'ok',
    baseUrl,
    heroConsumers: expectedConsumerFiles.map((filePath) => path.relative(projectRoot, filePath).replace(/\\/g, '/')),
    results
  }, null, 2));
} finally {
  await browser.close();
}
