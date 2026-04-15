#!/usr/bin/env node

import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const placeholderDir = path.join(projectRoot, 'out', 'imported-state-placeholders');
const entries = (await fs.readdir(placeholderDir)).filter((name) => name.endsWith('.placeholder.txt')).sort();

if (entries.length !== 80) {
  throw new Error(`Expected 80 imported-asset placeholder files, found ${entries.length}.`);
}

const nestedMatches = [];
for (const name of entries) {
  const content = await fs.readFile(path.join(placeholderDir, name), 'utf8');
  if (content.includes('/states/state-') || content.includes('public/states/state-')) {
    nestedMatches.push(name);
  }
}

if (nestedMatches.length > 0) {
  throw new Error(`Prepared placeholders still mention nested state paths: ${nestedMatches.slice(0, 5).join(', ')}`);
}

const sample = {
  still: await fs.readFile(path.join(placeholderDir, '01.png.placeholder.txt'), 'utf8'),
  loop: await fs.readFile(path.join(placeholderDir, '01-a.mp4.placeholder.txt'), 'utf8')
};

if (!sample.still.includes('Expected runtime path: /states/01.png')) {
  throw new Error('Still placeholder did not use the flat imported runtime path.');
}

if (!sample.loop.includes('Expected runtime path: /states/01-a.mp4')) {
  throw new Error('Loop placeholder did not use the flat imported runtime path.');
}

console.log(JSON.stringify({
  status: 'ok',
  placeholderDir,
  fileCount: entries.length,
  sampleFiles: ['01.png.placeholder.txt', '01-a.mp4.placeholder.txt']
}, null, 2));
