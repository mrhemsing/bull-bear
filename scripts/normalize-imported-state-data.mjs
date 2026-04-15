#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const manifestPath = path.join(projectRoot, 'data', 'state-manifest.json');
const framesPath = path.join(projectRoot, 'data', 'frames.json');

const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8')).map((entry) => {
  const key = String(entry.index).padStart(2, '0');
  return {
    ...entry,
    still: `/states/${key}.png`,
    loops: ['a', 'b', 'c'].map((suffix) => `/states/${key}-${suffix}.mp4`)
  };
});

fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const frames = JSON.parse(fs.readFileSync(framesPath, 'utf8')).map((frame) => {
  if (!frame.stateIndex) return frame;
  const key = String(frame.stateIndex).padStart(2, '0');
  return {
    ...frame,
    imageUrl: `/states/${key}.png`
  };
});

fs.writeFileSync(framesPath, `${JSON.stringify(frames, null, 2)}\n`);
console.log('normalized state-manifest.json and frames.json to flat imported asset paths');
