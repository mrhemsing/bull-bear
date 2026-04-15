#!/usr/bin/env node

const baseUrl = process.env.BULL_BEAR_BASE_URL ?? 'http://127.0.0.1:3004';
const statusUrl = new URL('/api/asset-production-status', baseUrl).toString();

const response = await fetch(statusUrl, {
  headers: {
    'user-agent': 'bull-bear-asset-production-check/1.0'
  }
});

if (!response.ok) {
  throw new Error(`Asset production status request failed: ${response.status} ${response.statusText}`);
}

const payload = await response.json();
const nestedMatches = [];

function walk(value, trail = '$') {
  if (typeof value === 'string') {
    if (value.includes('/states/state-') || value.includes('public/states/state-')) {
      nestedMatches.push({ trail, value });
    }
    return;
  }

  if (Array.isArray(value)) {
    value.forEach((entry, index) => walk(entry, `${trail}[${index}]`));
    return;
  }

  if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) {
      walk(entry, `${trail}.${key}`);
    }
  }
}

walk(payload);

if (nestedMatches.length) {
  throw new Error(`Asset production status still exposes nested state asset paths: ${JSON.stringify(nestedMatches.slice(0, 5))}`);
}

const approvedState = payload?.approvedStates?.[0] ?? null;
const reviewEntry = payload?.reviewQueue?.[0] ?? null;
const loopEntry = payload?.loopQueue?.[0] ?? null;

if (approvedState?.canonicalTarget && !/public\/states\/\d{2}\.png$/i.test(approvedState.canonicalTarget)) {
  throw new Error(`Approved state canonical target was not normalized to the imported still path: ${approvedState.canonicalTarget}`);
}

if (reviewEntry?.canonicalTarget && !/\/states\/\d{2}\.png$/i.test(reviewEntry.canonicalTarget)) {
  throw new Error(`Review queue canonical target was not normalized to the imported still path: ${reviewEntry.canonicalTarget}`);
}

if (loopEntry?.loopTarget && !/\/states\/\d{2}-[abc]\.mp4$/i.test(loopEntry.loopTarget)) {
  throw new Error(`Loop queue target was not normalized to the imported loop path: ${loopEntry.loopTarget}`);
}

console.log(JSON.stringify({
  status: 'ok',
  statusUrl,
  approvedState: approvedState ? {
    id: approvedState.id,
    canonicalTarget: approvedState.canonicalTarget
  } : null,
  reviewEntry: reviewEntry ? {
    stateId: reviewEntry.stateId,
    canonicalTarget: reviewEntry.canonicalTarget
  } : null,
  loopEntry: loopEntry ? {
    stateId: loopEntry.stateId,
    variant: loopEntry.variant,
    stillTarget: loopEntry.stillTarget,
    loopTarget: loopEntry.loopTarget
  } : null
}, null, 2));
