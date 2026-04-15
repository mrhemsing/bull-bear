#!/usr/bin/env node

const baseUrl = process.env.BULL_BEAR_BASE_URL ?? 'http://127.0.0.1:3004';
const reviewGalleryUrl = new URL('/review-gallery', baseUrl).toString();

const response = await fetch(reviewGalleryUrl, {
  headers: {
    'user-agent': 'bull-bear-review-gallery-check/1.0'
  }
});

if (!response.ok) {
  throw new Error(`Review gallery request failed: ${response.status} ${response.statusText}`);
}

const html = await response.text();
const normalizedHtml = html.replace(/\\u0026/g, '&');
const expectedStates = Array.from({ length: 20 }, (_, index) => String(index + 1).padStart(2, '0'));
const stillMatches = Array.from(normalizedHtml.matchAll(/<img[^>]+src="(\/states\/\d{2}\.png)"/g), (match) => match[1]);
if (stillMatches.length !== 20) {
  throw new Error(`Expected 20 flat still image sources, found ${stillMatches.length}.`);
}

const videoMatches = Array.from(normalizedHtml.matchAll(/<video[^>]+src="(\/states\/\d{2}-[abc]\.mp4)"/g), (match) => match[1]);
if (videoMatches.length !== 60) {
  throw new Error(`Expected 60 flat loop video sources, found ${videoMatches.length}.`);
}

for (const key of expectedStates) {
  const expectedStill = `/states/${key}.png`;
  if (!stillMatches.includes(expectedStill)) {
    throw new Error(`Missing flat still ${expectedStill} in review gallery output.`);
  }

  for (const suffix of ['a', 'b', 'c']) {
    const expectedLoop = `/states/${key}-${suffix}.mp4`;
    if (!videoMatches.includes(expectedLoop)) {
      throw new Error(`Missing flat loop ${expectedLoop} in review gallery output.`);
    }
  }
}

console.log(JSON.stringify({
  status: 'ok',
  reviewGalleryUrl,
  stateCount: expectedStates.length,
  stillCount: stillMatches.length,
  loopCount: videoMatches.length,
  firstState: expectedStates[0],
  lastState: expectedStates.at(-1)
}, null, 2));
