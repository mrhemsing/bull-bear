const fs = require('fs');
const path = require('path');

const inputPath = path.join(process.cwd(), 'data', 'generated', 'canonical-asset-checklist.json');
const outputPath = path.join(process.cwd(), 'data', 'generated', 'all-state-prompts.md');

const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

let out = '# Bull Bear Canonical Prompts\n\nSource: `data/generated/canonical-asset-checklist.json`\n';

for (const state of data) {
  out += `\n## State ${String(state.index).padStart(2, '0')}, ${state.label}\n\n`;
  out += `### Still\n${state.still?.prompt || ''}\n`;

  for (const loop of state.loops || []) {
    const name = loop.target?.match(/loop-([a-z])/i)?.[1]?.toUpperCase() || '?';
    out += `\n### Loop ${name}\n${loop.prompt || ''}\n`;
  }
}

fs.writeFileSync(outputPath, out);
console.log('wrote all-state-prompts.md');
