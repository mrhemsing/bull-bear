#!/usr/bin/env node

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
const expectedLoops = ['a', 'b', 'c'].map((suffix) => `/states/${key}-${suffix}.mp4`);

const videoMatch = html.match(/<video[^>]+src="([^"]+)"[^>]+poster="([^"]+)"[^>]+data-loop-sequence="([^"]+)"/i);
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
if (activeLoops.length !== 3) {
  throw new Error(`Expected 3 active loop sequence entries, found ${activeLoops.length}.`);
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
