#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const artifactPath = path.join(projectRoot, 'docs', 'openclaw-hourly-capture-cron.json');

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function fail(message, details = null) {
  const json = hasFlag('json');
  if (json) {
    console.log(JSON.stringify({ valid: false, message, ...(details ?? {}) }, null, 2));
  } else {
    console.error(message);
    if (details) {
      console.error(JSON.stringify(details, null, 2));
    }
  }
  process.exitCode = 1;
}

function ok(message, details = null) {
  const json = hasFlag('json');
  if (json) {
    console.log(JSON.stringify({ valid: true, message, ...(details ?? {}) }, null, 2));
  } else {
    console.log(message);
    if (details) {
      console.log(JSON.stringify(details, null, 2));
    }
  }
}

async function main() {
  const raw = await fs.readFile(artifactPath, 'utf8');
  const job = JSON.parse(raw);
  const errors = [];

  if (job?.name !== 'bull-bear-hourly-capture') {
    errors.push('Expected job.name to equal "bull-bear-hourly-capture".');
  }

  if (job?.schedule?.kind !== 'cron') {
    errors.push('Expected schedule.kind to equal "cron".');
  }

  if (job?.schedule?.expr !== '0 * * * *') {
    errors.push('Expected schedule.expr to equal "0 * * * *" for hourly execution.');
  }

  if (job?.schedule?.tz !== 'America/Los_Angeles') {
    errors.push('Expected schedule.tz to equal "America/Los_Angeles".');
  }

  if (job?.sessionTarget !== 'isolated') {
    errors.push('Expected sessionTarget to equal "isolated".');
  }

  if (job?.payload?.kind !== 'agentTurn') {
    errors.push('Expected payload.kind to equal "agentTurn".');
  }

  if (job?.payload?.timeoutSeconds !== 420) {
    errors.push('Expected payload.timeoutSeconds to equal 420.');
  }

  if (job?.delivery?.mode !== 'none') {
    errors.push('Expected delivery.mode to equal "none".');
  }

  if (job?.enabled !== true) {
    errors.push('Expected enabled to equal true.');
  }

  const message = job?.payload?.message ?? '';
  const requiredPhrases = [
    'http://127.0.0.1:3078/api/capture-proof?format=text',
    'output that single response body exactly, byte for byte',
    'Do not browse, search, infer, or use any other tool, source, URL, or endpoint',
    'Do not call cash-grab.vercel.app',
    'The response body is already the final five-line Bull Bear proof, so echo it verbatim and stop'
  ];

  for (const phrase of requiredPhrases) {
    if (!message.includes(phrase)) {
      errors.push(`Expected payload.message to include: ${phrase}`);
    }
  }

  if (errors.length > 0) {
    fail('Bull Bear cron artifact validation failed.', {
      artifactPath,
      errors
    });
    return;
  }

  ok('Bull Bear cron artifact validation passed.', {
    artifactPath,
    schedule: job.schedule,
    sessionTarget: job.sessionTarget,
    delivery: job.delivery,
    timeoutSeconds: job.payload.timeoutSeconds
  });
}

main().catch((error) => {
  fail('Bull Bear cron artifact validation crashed.', {
    artifactPath,
    error: error instanceof Error ? error.stack ?? error.message : String(error)
  });
});
