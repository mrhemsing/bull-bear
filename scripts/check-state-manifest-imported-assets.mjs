#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const manifestPath = path.join(projectRoot, 'data', 'state-manifest.json');
const framesPath = path.join(projectRoot, 'data', 'frames.json');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const frames = JSON.parse(fs.readFileSync(framesPath, 'utf8'));

const failures = [];

for (let index = 1; index <= 20; index += 1) {
  const key = String(index).padStart(2, '0');
  const entry = manifest.find((item) => item.index === index);

  if (!entry) {
    failures.push(`missing manifest entry ${key}`);
    continue;
  }

  const expectedStill = `/states/${key}.png`;
  const expectedLoops = ['a', 'b', 'c'].map((suffix) => `/states/${key}-${suffix}.mp4`);

  if (entry.still !== expectedStill) {
    failures.push(`manifest state ${key} still expected ${expectedStill} but found ${entry.still}`);
  }

  if (JSON.stringify(entry.loops) !== JSON.stringify(expectedLoops)) {
    failures.push(`manifest state ${key} loops are not flat imported A/B/C paths`);
  }
}

for (const frame of frames) {
  if (!frame.stateIndex || !frame.imageUrl) continue;
  const key = String(frame.stateIndex).padStart(2, '0');
  const expectedStill = `/states/${key}.png`;
  if (frame.imageUrl !== expectedStill) {
    failures.push(`frame ${frame.id} expected ${expectedStill} but found ${frame.imageUrl}`);
  }
}

if (failures.length) {
  console.error('State manifest imported-asset check failed.');
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'ok',
  checkedManifestStates: manifest.length,
  checkedFrameRecords: frames.length
}, null, 2));
