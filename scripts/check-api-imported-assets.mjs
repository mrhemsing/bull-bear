#!/usr/bin/env node

import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const scriptNames = [
  'check-api-live-imported-assets.mjs',
  'check-api-capture-imported-assets.mjs'
];

async function runScript(scriptName) {
  const { stdout, stderr } = await execFile(process.execPath, [scriptName], {
    cwd: new URL('.', import.meta.url),
    env: process.env
  });

  const output = `${stdout}${stderr}`.trim();
  const summary = output ? JSON.parse(output) : { status: 'ok' };
  return {
    script: scriptName,
    ...summary
  };
}

const results = [];
for (const scriptName of scriptNames) {
  results.push(await runScript(scriptName));
}

console.log(JSON.stringify({
  status: 'ok',
  baseUrl: process.env.BULL_BEAR_BASE_URL ?? 'http://127.0.0.1:3078',
  checks: results
}, null, 2));
