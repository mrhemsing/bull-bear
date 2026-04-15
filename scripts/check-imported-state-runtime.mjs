#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

const projectRoot = process.cwd();
const statesDir = path.join(projectRoot, 'public', 'states');
const assetsSource = fs.readFileSync(path.join(projectRoot, 'src', 'lib', 'assets.ts'), 'utf8');
const heroMediaSource = fs.readFileSync(path.join(projectRoot, 'src', 'app', 'hero-media.tsx'), 'utf8');
const liveSnapshotSource = fs.readFileSync(path.join(projectRoot, 'src', 'app', 'live-snapshot.tsx'), 'utf8');

const missing = [];
for (let index = 1; index <= 20; index += 1) {
  const key = String(index).padStart(2, '0');
  const stillPath = path.join(statesDir, `${key}.png`);
  if (!fs.existsSync(stillPath)) missing.push(`missing still ${key}.png`);

  for (const suffix of ['a', 'b', 'c']) {
    const loopPath = path.join(statesDir, `${key}-${suffix}.mp4`);
    if (!fs.existsSync(loopPath)) missing.push(`missing loop ${key}-${suffix}.mp4`);
  }
}

const assertions = [
  {
    name: 'asset resolver prefers flat still paths',
    pass: /still:\s*fs\.existsSync\(stillPath\)\s*\?\s*`\/states\/\$\{key\}\.png`\s*:\s*null/.test(assetsSource)
  },
  {
    name: 'asset resolver probes flat A/B/C loop paths',
    pass: /\['a', 'b', 'c'\]\.map\(\(suffix\) => `\/states\/\$\{key\}-\$\{suffix\}\.mp4`\)/.test(assetsSource)
  },
  {
    name: 'hero playback advances sequentially with modulo wrap',
    pass: heroMediaSource.includes('setLoopIndex((current) => (current + 1) % loops.length)')
  },
  {
    name: 'hero playback starts from the ordered resolved loop array',
    pass: heroMediaSource.includes('const currentLoop = loops[loopIndex] ?? activeLoop;')
  },
  {
    name: 'live snapshot passes the resolved loop array into HeroMedia',
    pass: liveSnapshotSource.includes('loops={view.loops}')
  },
  {
    name: 'selected timeline states rebuild flat imported asset paths',
    pass: /function buildStateAssetSet\(stateIndex: number\)[\s\S]*still:\s*`\/states\/\$\{key\}\.png`,[\s\S]*loops:\s*\[`\/states\/\$\{key\}-a\.mp4`,\s*`\/states\/\$\{key\}-b\.mp4`,\s*`\/states\/\$\{key\}-c\.mp4`\]/.test(liveSnapshotSource)
  }
];

if (missing.length) {
  console.error('Imported state runtime check failed.');
  for (const item of missing) console.error(`- ${item}`);
  process.exit(1);
}

const failedAssertions = assertions.filter((assertion) => !assertion.pass);
if (failedAssertions.length) {
  console.error('Imported state runtime check failed.');
  for (const assertion of failedAssertions) console.error(`- ${assertion.name}`);
  process.exit(1);
}

console.log(JSON.stringify({
  status: 'ok',
  checkedStates: 20,
  checkedLoopsPerState: 3,
  assertions: assertions.map(({ name }) => name)
}, null, 2));
