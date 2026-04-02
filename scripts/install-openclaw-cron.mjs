#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import os from 'node:os';

function resolveOpenClawCommand() {
  if (process.platform === 'win32') {
    return path.join(os.homedir(), 'AppData', 'Roaming', 'npm', 'openclaw.cmd');
  }
  return 'openclaw';
}

const projectRoot = process.cwd();
const artifactPath = path.join(projectRoot, 'docs', 'openclaw-hourly-capture-cron.json');
const compactCronMessage = 'Bull Bear local only: GET http://127.0.0.1:3078/api/capture once, then report state, provider, shouldPersist, persisted, and failures.';

function parseArgs(argv) {
  const options = {
    apply: false,
    json: false,
    verify: false,
    verifyRecord: false,
    audit: false,
    status: false,
    statusRecord: false,
    statusFailOnWatch: false,
    verifyStrict: false,
    verifyRunsLimit: null,
    runStaleHours: null,
    auditStaleHours: null,
    auditUrl: process.env.BULL_BEAR_CAPTURE_URL?.trim() || null,
    auditTimeoutMs: (() => {
      const raw = process.env.BULL_BEAR_CAPTURE_TIMEOUT_MS?.trim();
      const parsed = raw ? Number.parseInt(raw, 10) : Number.NaN;
      return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
    })(),
    channel: null,
    to: null,
    url: process.env.OPENCLAW_GATEWAY_URL?.trim() || null,
    token: process.env.OPENCLAW_GATEWAY_TOKEN?.trim() || null,
    name: process.env.BULL_BEAR_CRON_NAME?.trim() || null,
    enabled: null
  };

  for (const arg of argv) {
    if (arg === '--apply') {
      options.apply = true;
      continue;
    }
    if (arg === '--json') {
      options.json = true;
      continue;
    }
    if (arg === '--verify') {
      options.verify = true;
      continue;
    }
    if (arg === '--verify-record') {
      options.verify = true;
      options.verifyRecord = true;
      continue;
    }
    if (arg === '--audit') {
      options.audit = true;
      continue;
    }
    if (arg === '--verify-strict') {
      options.verify = true;
      options.verifyStrict = true;
      continue;
    }
    if (arg === '--status') {
      options.status = true;
      continue;
    }
    if (arg === '--status-record') {
      options.status = true;
      options.statusRecord = true;
      continue;
    }
    if (arg === '--status-fail-on-watch') {
      options.status = true;
      options.statusFailOnWatch = true;
      continue;
    }
    if (arg === '--enabled') {
      options.enabled = true;
      continue;
    }
    if (arg === '--disabled') {
      options.enabled = false;
      continue;
    }

    const [flag, rawValue] = arg.split('=', 2);
    const value = rawValue?.trim();
    if (!value) continue;

    if (flag === '--channel') options.channel = value;
    if (flag === '--to') options.to = value;
    if (flag === '--url') options.url = value;
    if (flag === '--token') options.token = value;
    if (flag === '--name') options.name = value;
    if (flag === '--audit-url') options.auditUrl = value;
    if (flag === '--audit-timeout-ms') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.auditTimeoutMs = parsed;
      }
    }
    if (flag === '--verify-runs-limit') {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed) && parsed >= 0) {
        options.verifyRunsLimit = parsed;
      }
    }
    if (flag === '--run-stale-hours') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.runStaleHours = parsed;
      }
    }
    if (flag === '--audit-stale-hours') {
      const parsed = Number.parseFloat(value);
      if (Number.isFinite(parsed) && parsed > 0) {
        options.auditStaleHours = parsed;
      }
    }
  }

  return options;
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message);
  }
}

function validateArtifact(job) {
  assert(job && typeof job === 'object', 'Cron artifact must be a JSON object.');
  assert(job.schedule?.kind === 'cron', 'Cron artifact must use a cron schedule.');
  assert(typeof job.schedule?.expr === 'string' && job.schedule.expr.trim().length > 0, 'Cron artifact must define schedule.expr.');
  assert(typeof job.schedule?.tz === 'string' && job.schedule.tz.trim().length > 0, 'Cron artifact must define schedule.tz.');
  assert(job.sessionTarget === 'isolated', 'Cron artifact must target an isolated session.');
  assert(job.payload?.kind === 'agentTurn', 'Cron artifact must use an agentTurn payload.');
  assert(typeof job.payload?.message === 'string' && job.payload.message.includes('http://localhost:3000/api/capture'), 'Cron artifact payload must call the local /api/capture route.');
  assert(job.payload.message.includes('shouldPersist'), 'Cron artifact payload must mention shouldPersist.');
  assert(job.payload.message.includes('state id and label'), 'Cron artifact payload must mention state id and label.');
  assert(job.payload.message.includes('asset provider'), 'Cron artifact payload must mention asset provider.');
  assert(job.payload.message.toLowerCase().includes('failure'), 'Cron artifact payload must require clear failure reporting.');
  assert(job.delivery?.mode === 'announce', 'Cron artifact delivery mode must be announce.');
}

function buildCommand(job, options) {
  const command = resolveOpenClawCommand();
  const args = ['cron', 'add'];

  args.push('--name', options.name ?? job.name);
  args.push('--cron', job.schedule.expr);
  args.push('--tz', job.schedule.tz);
  args.push('--session', job.sessionTarget);
  args.push('--message', compactCronMessage);

  const timeoutSeconds = typeof job.payload.timeoutSeconds === 'number'
    ? job.payload.timeoutSeconds
    : 420;
  args.push('--timeout-seconds', String(timeoutSeconds));

  if ((options.enabled ?? job.enabled) === false) {
    args.push('--disabled');
  }

  if (job.delivery?.mode === 'announce') {
    args.push('--announce');
  }

  if (options.channel) {
    args.push('--channel', options.channel);
  }

  if (options.to) {
    args.push('--to', options.to);
  }

  if (options.url) {
    args.push('--url', options.url);
  }

  if (options.token) {
    args.push('--token', options.token);
  }

  if (options.json) {
    args.push('--json');
  }

  return { command, args };
}

function quoteForDisplay(value) {
  if (/^[A-Za-z0-9_./:-]+$/.test(value)) return value;
  return JSON.stringify(value);
}

function formatCommand(command, args) {
  return [command, ...args].map(quoteForDisplay).join(' ');
}

function quotePowerShellArg(value) {
  if (value.length === 0) return "''";
  return `'${value.replace(/'/g, "''")}'`;
}

function run(command, args) {
  return new Promise((resolve, reject) => {
    const isWindowsCmd = process.platform === 'win32' && /\.cmd$/i.test(command);
    const child = isWindowsCmd
      ? spawn('powershell.exe', ['-NoProfile', '-Command', `& ${quotePowerShellArg(command)} ${args.map(quotePowerShellArg).join(' ')}`], {
          stdio: 'inherit',
          shell: false
        })
      : spawn(command, args, {
          stdio: 'inherit',
          shell: false
        });

    child.on('error', reject);
    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`Command exited with code ${code ?? 'unknown'}.`));
    });
  });
}

function buildVerifyCommand(options) {
  const command = 'node';
  const args = ['scripts/verify-installed-openclaw-cron.mjs'];

  if (options.url) args.push(`--url=${options.url}`);
  if (options.token) args.push(`--token=${options.token}`);
  if (options.name) args.push(`--name=${options.name}`);
  if (options.verifyStrict) args.push('--strict');
  if (options.verifyRecord) args.push('--record');
  if (options.verifyRunsLimit !== null) args.push(`--runs-limit=${options.verifyRunsLimit}`);

  return { command, args };
}

function buildAuditCommand(options) {
  const command = 'node';
  const args = ['scripts/audit-capture-response.mjs'];

  if (options.auditUrl) {
    args.push(`--url=${options.auditUrl}`);
  } else if (options.url && /^https?:\/\//i.test(options.url)) {
    args.push(`--url=${options.url.replace(/\/$/, '')}/api/capture`);
  }

  if (options.auditTimeoutMs !== null) {
    args.push(`--timeout-ms=${options.auditTimeoutMs}`);
  }

  return { command, args };
}

function buildStatusCommand(options) {
  const command = 'node';
  const args = ['scripts/check-operator-status.mjs'];

  if (options.url) args.push(`--url=${options.url}`);
  if (options.token) args.push(`--token=${options.token}`);
  if (options.name) args.push(`--name=${options.name}`);
  if (options.runStaleHours !== null) args.push(`--run-stale-hours=${options.runStaleHours}`);
  if (options.auditStaleHours !== null) args.push(`--audit-stale-hours=${options.auditStaleHours}`);
  if (options.statusRecord) args.push('--record');
  if (options.statusFailOnWatch) args.push('--fail-on-watch');

  return { command, args };
}

function buildPlan(job, options, installCommand) {
  const plan = {
    artifact: path.relative(projectRoot, artifactPath),
    schedule: {
      expr: job.schedule.expr,
      tz: job.schedule.tz
    },
    sessionTarget: job.sessionTarget,
    delivery: job.delivery?.mode ?? 'none',
    apply: options.apply,
    install: {
      command: installCommand.command,
      args: installCommand.args,
      text: formatCommand(installCommand.command, installCommand.args)
    },
    verify: null,
    audit: null,
    status: null
  };

  if (options.verify) {
    const verifyCommand = buildVerifyCommand(options);
    plan.verify = {
      command: verifyCommand.command,
      args: verifyCommand.args,
      text: formatCommand(verifyCommand.command, verifyCommand.args)
    };
  }

  if (options.audit) {
    const auditCommand = buildAuditCommand(options);
    plan.audit = {
      command: auditCommand.command,
      args: auditCommand.args,
      text: formatCommand(auditCommand.command, auditCommand.args)
    };
  }

  if (options.status) {
    const statusCommand = buildStatusCommand(options);
    plan.status = {
      command: statusCommand.command,
      args: statusCommand.args,
      text: formatCommand(statusCommand.command, statusCommand.args)
    };
  }

  return plan;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const raw = await fs.readFile(artifactPath, 'utf8');
  const job = JSON.parse(raw);
  validateArtifact(job);

  const installCommand = buildCommand(job, options);
  const commandText = formatCommand(installCommand.command, installCommand.args);
  const plan = buildPlan(job, options, installCommand);

  if (!options.apply) {
    if (options.json) {
      console.log(JSON.stringify({
        mode: 'dry-run',
        ...plan,
        note: 'Add --apply to execute the validated install command.'
      }, null, 2));
      return;
    }

    console.log('Bull Bear OpenClaw cron installer: dry run');
    console.log(`Artifact: ${path.relative(projectRoot, artifactPath)}`);
    console.log(`Schedule: ${job.schedule.expr} @ ${job.schedule.tz}`);
    console.log(`Session target: ${job.sessionTarget}`);
    console.log(`Delivery: ${job.delivery?.mode ?? 'none'}`);
    console.log('Install command:');
    console.log(commandText);
    if (plan.verify) {
      console.log('');
      console.log('Post-install verify command:');
      console.log(plan.verify.text);
    }
    if (plan.audit) {
      console.log('');
      console.log('Post-install capture-audit command:');
      console.log(plan.audit.text);
    }
    if (plan.status) {
      console.log('');
      console.log('Post-install operator-status command:');
      console.log(plan.status.text);
    }
    console.log('');
    console.log('Add --apply to execute the command after this validation step.');
    return;
  }

  if (options.json) {
    console.error('Bull Bear OpenClaw cron installer: applying validated artifact');
    console.error(commandText);
  } else {
    console.log('Bull Bear OpenClaw cron installer: applying validated artifact');
    console.log(commandText);
  }
  await run(installCommand.command, installCommand.args);

  if (plan.verify) {
    if (options.json) {
      console.error('');
      console.error('Bull Bear OpenClaw cron installer: running immediate post-install verification');
      console.error(plan.verify.text);
    } else {
      console.log('');
      console.log('Bull Bear OpenClaw cron installer: running immediate post-install verification');
      console.log(plan.verify.text);
    }
    await run(plan.verify.command, plan.verify.args);
  }

  if (plan.audit) {
    if (options.json) {
      console.error('');
      console.error('Bull Bear OpenClaw cron installer: writing immediate capture-audit proof');
      console.error(plan.audit.text);
    } else {
      console.log('');
      console.log('Bull Bear OpenClaw cron installer: writing immediate capture-audit proof');
      console.log(plan.audit.text);
    }
    await run(plan.audit.command, plan.audit.args);
  }

  if (plan.status) {
    if (options.json) {
      console.error('');
      console.error('Bull Bear OpenClaw cron installer: capturing final operator-status snapshot');
      console.error(plan.status.text);
    } else {
      console.log('');
      console.log('Bull Bear OpenClaw cron installer: capturing final operator-status snapshot');
      console.log(plan.status.text);
    }
    await run(plan.status.command, plan.status.args);
  }
}

main().catch((error) => {
  console.error('Bull Bear OpenClaw cron install helper failed.');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
