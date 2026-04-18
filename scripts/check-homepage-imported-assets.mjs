#!/usr/bin/env node

import { existsSync } from 'node:fs';

const baseUrl = process.env.BULL_BEAR_BASE_URL ?? 'http://127.0.0.1:3004';
const homepageUrl = new URL('/', baseUrl).toString();

const response = await fetch(homepageUrl, {
  headers: {
    'user-agent': 'bull-bear-homepage-check/1.0'
  }
});

if (!response.ok) {
  throw new Error(`Homepage request failed: ${response.status} ${response.statusText}`);
}

const html = await response.text();

const stateMatch = html.match(/stateIndex\\":(\d+)/);
if (!stateMatch) {
  throw new Error('Could not find live stateIndex in homepage payload.');
}

const stateIndex = Number(stateMatch[1]);
const key = String(stateIndex).padStart(2, '0');
const expectedPoster = `/states/${key}.png`;
const expectedLoops = ['a', 'b', 'c']
  .map((suffix) => `/states/${key}-${suffix}.mp4`)
  .filter((loopPath) => existsSync(new URL(`../public${loopPath}`, import.meta.url)));

const videoMatch = html.match(/<video[^>]+src="([^"]+)"[^>]+poster="([^"]+)"[^>]+data-loop-sequence="([^"]+)"/i);
const imageMatch = html.match(/<img[^>]+src="([^"]+)"[^>]+alt="[^"]*market beast still[^"]*"/i);

if (expectedLoops.length === 0) {
  if (!imageMatch) {
    throw new Error('Expected homepage hero to fall back to Matt\'s shipped still, but no hero image tag was found.');
  }

  const [, imageSrc] = imageMatch;
  if (imageSrc !== expectedPoster) {
    throw new Error(`Homepage hero still ${imageSrc} did not match imported flat still ${expectedPoster}.`);
  }

  console.log(JSON.stringify({
    status: 'ok',
    homepageUrl,
    stateIndex,
    posterSrc: imageSrc,
    activeLoops: []
  }, null, 2));
} else {
  if (!videoMatch) {
    throw new Error('Could not find homepage hero video tag with loop metadata.');
  }

  const [, videoSrc, posterSrc, loopSequence] = videoMatch;
  if (!expectedLoops.includes(videoSrc)) {
    throw new Error(`Homepage hero video src ${videoSrc} did not match imported flat loop set ${expectedLoops.join(', ')}.`);
  }

  if (posterSrc !== expectedPoster) {
    throw new Error(`Homepage hero poster ${posterSrc} did not match imported flat still ${expectedPoster}.`);
  }

  const activeLoops = loopSequence.split('|').filter(Boolean);
  if (activeLoops.length !== expectedLoops.length) {
    throw new Error(`Expected ${expectedLoops.length} active loop sequence entries, found ${activeLoops.length}.`);
  }

  for (const loop of expectedLoops) {
    if (!activeLoops.includes(loop)) {
      throw new Error(`Homepage loop sequence is missing expected imported loop ${loop}.`);
    }
  }

  console.log(JSON.stringify({
    status: 'ok',
    homepageUrl,
    stateIndex,
    videoSrc,
    posterSrc,
    activeLoops
  }, null, 2));
}
