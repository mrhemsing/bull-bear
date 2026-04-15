#!/usr/bin/env node
import fs from 'node:fs/promises';
import path from 'node:path';

const projectRoot = process.cwd();
const framesPath = path.join(projectRoot, 'data', 'frames.json');
const checklistPath = path.join(projectRoot, 'data', 'generated', 'canonical-asset-checklist.json');

function hasFlag(name) {
  return process.argv.slice(2).includes(`--${name}`);
}

function parseNumberFlag(name, fallback) {
  const prefix = `--${name}=`;
  const match = process.argv.slice(2).find((arg) => arg.startsWith(prefix));
  if (!match) return fallback;
  const value = Number(match.slice(prefix.length));
  return Number.isFinite(value) && value > 0 ? value : fallback;
}

function formatTimestamp(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString();
}

function formatDuration(hours) {
  if (!Number.isFinite(hours) || hours < 0) return 'unknown';
  if (hours < 1) {
    const minutes = Math.round(hours * 60);
    return `${minutes}m`;
  }

  const wholeHours = Math.floor(hours);
  const minutes = Math.round((hours - wholeHours) * 60);
  if (minutes === 0) return `${wholeHours}h`;
  return `${wholeHours}h ${minutes}m`;
}

function buildStatus(hoursSinceLatest, warnHours, staleHours) {
  if (!Number.isFinite(hoursSinceLatest)) {
    return {
      level: 'WARN',
      summary: 'No saved transitions found yet.'
    };
  }

  if (hoursSinceLatest >= staleHours) {
    return {
      level: 'STALE',
      summary: `Latest saved transition is older than ${staleHours}h.`
    };
  }

  if (hoursSinceLatest >= warnHours) {
    return {
      level: 'WATCH',
      summary: `Latest saved transition is older than ${warnHours}h.`
    };
  }

  return {
    level: 'HEALTHY',
    summary: 'Transition history looks fresh.'
  };
}

async function readJson(filePath) {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw);
}

async function main() {
  const warnHours = parseNumberFlag('warn-hours', 6);
  const staleHours = parseNumberFlag('stale-hours', 24);
  const json = hasFlag('json');

  const [frames, checklist] = await Promise.all([
    readJson(framesPath),
    readJson(checklistPath)
  ]);

  const latest = Array.isArray(frames) && frames.length > 0
    ? [...frames].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0]
    : null;

  const approvedStills = Array.isArray(checklist)
    ? checklist.filter((entry) => entry?.still?.selectedAnchor).length
    : 0;
  const approvedLoops = Array.isArray(checklist)
    ? checklist.flatMap((entry) => entry?.loops ?? []).filter((loop) => loop?.status === 'approved').length
    : 0;

  const now = new Date();
  const latestDate = latest?.timestamp ? new Date(latest.timestamp) : null;
  const hoursSinceLatest = latestDate && !Number.isNaN(latestDate.getTime())
    ? (now.getTime() - latestDate.getTime()) / (1000 * 60 * 60)
    : Number.NaN;

  const status = buildStatus(hoursSinceLatest, warnHours, staleHours);

  const summary = {
    level: status.level,
    summary: status.summary,
    latestTransition: latest
      ? {
          timestamp: latest.timestamp,
          formattedTimestamp: formatTimestamp(latest.timestamp),
          ageHours: Number.isFinite(hoursSinceLatest) ? Number(hoursSinceLatest.toFixed(2)) : null,
          ageText: formatDuration(hoursSinceLatest)
        }
      : null,
    latestState: latest?.stateIndex && latest?.stateLabel
      ? {
          stateId: `state-${String(latest.stateIndex).padStart(2, '0')}`,
          stateLabel: latest.stateLabel
        }
      : null,
    savedTransitionCount: Array.isArray(frames) ? frames.length : 0,
    assetCoverage: {
      approvedStills,
      totalStills: 20,
      approvedLoops,
      totalLoops: 60
    },
    thresholds: {
      watchHours: warnHours,
      staleHours
    },
    note: 'Transition history only grows when the canonical state changes, so an older timestamp can be legitimate during a flat market; confirm with the scheduler run history or a manual GET /api/capture check if this status looks suspicious.'
  };

  if (json) {
    console.log(JSON.stringify(summary, null, 2));
  } else {
    const lines = [
      `Bull Bear runtime health: ${summary.level}`,
      summary.summary,
      summary.latestTransition
        ? `Latest saved transition: ${summary.latestTransition.formattedTimestamp} (${summary.latestTransition.ageText} ago)`
        : 'Latest saved transition: none yet',
      summary.latestState
        ? `Latest saved state: ${summary.latestState.stateId} (${summary.latestState.stateLabel})`
        : 'Latest saved state: unavailable',
      `Saved transition count: ${summary.savedTransitionCount}`,
      `Canonical asset coverage: ${summary.assetCoverage.approvedStills}/${summary.assetCoverage.totalStills} stills, ${summary.assetCoverage.approvedLoops}/${summary.assetCoverage.totalLoops} loops approved`,
      `Thresholds: watch at ${summary.thresholds.watchHours}h, stale at ${summary.thresholds.staleHours}h`,
      `Note: ${summary.note}`
    ];

    console.log(lines.join('\n'));
  }

  if (status.level === 'STALE') {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Bull Bear runtime health check failed.');
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exitCode = 1;
});
