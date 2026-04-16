#!/usr/bin/env node

const baseUrl = process.env.BULL_BEAR_BASE_URL ?? 'http://127.0.0.1:3004';
const dashboardUrl = new URL('/dashboard', baseUrl).toString();

const response = await fetch(dashboardUrl, {
  headers: {
    'user-agent': 'bull-bear-dashboard-check/1.0'
  }
});

if (!response.ok) {
  throw new Error(`Dashboard request failed: ${response.status} ${response.statusText}`);
}

const html = await response.text();
const videoMatch = html.match(/<video[^>]+src="(\/states\/(\d{2})-[abc]\.mp4)"[^>]+poster="(\/states\/(\d{2})\.png)"[^>]+data-loop-sequence="([^"]+)"/i);
if (!videoMatch) {
  throw new Error('Could not find dashboard hero video tag with imported flat assets and loop metadata.');
}

const [, videoSrc, videoKey, posterSrc, posterKey, loopSequence] = videoMatch;
if (videoKey !== posterKey) {
  throw new Error(`Dashboard hero video/poster keys diverged: ${videoSrc} vs ${posterSrc}.`);
}

const expectedLoops = ['a', 'b', 'c'].map((suffix) => `/states/${videoKey}-${suffix}.mp4`);
const activeLoops = loopSequence.split('|').filter(Boolean);
if (activeLoops.length !== 3) {
  throw new Error(`Dashboard expected 3 declared loops, found ${activeLoops.length}.`);
}

for (const expectedLoop of expectedLoops) {
  if (!activeLoops.includes(expectedLoop)) {
    throw new Error(`Dashboard loop metadata is missing expected imported loop ${expectedLoop}.`);
  }
}

if (html.includes('/states/state-')) {
  throw new Error('Dashboard output still includes old nested /states/state-* asset paths.');
}

console.log(JSON.stringify({
  status: 'ok',
  dashboardUrl,
  stateKey: videoKey,
  videoSrc,
  posterSrc
}, null, 2));
