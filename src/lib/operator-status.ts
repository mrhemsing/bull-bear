import fs from 'node:fs/promises';
import path from 'node:path';

interface OperatorStatusNextAction {
  priority: string;
  area: string;
  command: string;
  reason: string;
}

interface OperatorStatusLatestRun {
  status?: string | null;
  startedAt?: string | null;
  finishedAt?: string | null;
  durationMs?: number | null;
  text?: string | null;
}

export interface OperatorStatusHistorySummary {
  sampleSize: number;
  historyEntryCount: number;
  previousLevel: string | null;
  previousCheckedAt: string | null;
  levelChanged: boolean;
  recentLevels: Array<{
    checkedAt: string | null;
    level: string;
  }>;
  recentLevelCounts?: Record<string, number>;
  currentStreak?: {
    level: string | null;
    count: number;
    sinceCheckedAt: string | null;
  };
}

interface OperatorStatusArtifactMeta {
  path: string;
  sizeBytes: number;
  sizeHuman: string;
  updatedAt: string;
}

export interface OperatorStatusSummary {
  checkedAt: string;
  snapshotFreshness?: {
    verdict: 'fresh' | 'stale' | 'unknown';
    reason: string;
    ageMs?: number | null;
    age?: string | null;
    staleThresholdHours?: number | null;
  };
  overall: {
    level: 'READY' | 'WATCH' | 'ATTENTION' | string;
    issues: string[];
    warnings: string[];
  };
  artifactPaths?: {
    dir?: string | null;
    latest: OperatorStatusArtifactMeta;
    latestText: OperatorStatusArtifactMeta;
    latestMarkdown: OperatorStatusArtifactMeta;
    history: OperatorStatusArtifactMeta;
  } | null;
  runtimeHealth: {
    level: string;
    summary: string;
  };
  cronArtifact: {
    valid: boolean;
  };
  installedCron: {
    matchCount: number;
    duplicatesDetected: boolean;
    latestRun: OperatorStatusLatestRun | null;
    runHealth: {
      verdict?: string | null;
      reason?: string | null;
      latestRunAgeMs?: number | null;
      latestRunAge?: string | null;
      staleThresholdHours?: number | null;
    } | null;
  };
  latestCaptureAudit: {
    capturedAt?: string | null;
    httpStatus?: number | null;
    ok?: boolean | null;
    stateId?: string | null;
    stateLabel?: string | null;
    provider?: string | null;
    shouldPersist?: boolean | null;
    error?: string | null;
  } | null;
  auditHealth: {
    verdict: string;
    reason: string;
    ageMs?: number | null;
    age?: string | null;
    staleThresholdHours?: number | null;
  };
  nextActions: OperatorStatusNextAction[];
  historySummary?: OperatorStatusHistorySummary;
}

const operatorStatusPath = path.join(process.cwd(), 'data', 'generated', 'operator-status', 'latest.json');
const defaultOperatorSnapshotStaleThresholdHours = 2;

function formatAge(ms: number) {
  if (!Number.isFinite(ms) || ms < 0) return 'unknown';
  const totalMinutes = Math.round(ms / 60000);
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
}

function getSnapshotFreshness(
  checkedAt: string | null | undefined,
  staleHours = defaultOperatorSnapshotStaleThresholdHours
) {
  if (!checkedAt) {
    return {
      verdict: 'unknown' as const,
      reason: 'Recorded operator snapshot time is unavailable.',
      ageMs: null,
      age: null,
      staleThresholdHours: staleHours
    };
  }

  const checkedAtMs = Date.parse(checkedAt);
  if (!Number.isFinite(checkedAtMs)) {
    return {
      verdict: 'unknown' as const,
      reason: 'Recorded operator snapshot time could not be parsed.',
      ageMs: null,
      age: null,
      staleThresholdHours: staleHours
    };
  }

  const ageMs = Math.max(0, Date.now() - checkedAtMs);
  const age = formatAge(ageMs);
  const staleThresholdMs = staleHours * 60 * 60 * 1000;

  if (ageMs > staleThresholdMs) {
    return {
      verdict: 'stale' as const,
      reason: `Recorded operator snapshot is older than the ${staleHours}h freshness threshold (${age} old).`,
      ageMs,
      age,
      staleThresholdHours: staleHours
    };
  }

  return {
    verdict: 'fresh' as const,
    reason: `Recorded operator snapshot was refreshed ${age} ago.`,
    ageMs,
    age,
    staleThresholdHours: staleHours
  };
}

function getFallbackOperatorStatus(): OperatorStatusSummary {
  return {
    checkedAt: new Date(0).toISOString(),
    snapshotFreshness: {
      verdict: 'unknown',
      reason: 'No recorded operator snapshot found yet.',
      ageMs: null,
      age: null,
      staleThresholdHours: defaultOperatorSnapshotStaleThresholdHours
    },
    overall: {
      level: 'WATCH',
      issues: [],
      warnings: ['No recorded operator snapshot found yet. Run `npm run status:operator -- --record` to generate one.']
    },
    runtimeHealth: {
      level: 'UNKNOWN',
      summary: 'No recorded operator snapshot found yet.'
    },
    cronArtifact: {
      valid: false
    },
    installedCron: {
      matchCount: 0,
      duplicatesDetected: false,
      latestRun: null,
      runHealth: {
        verdict: 'unknown',
        reason: 'No recorded operator snapshot found yet.'
      }
    },
    latestCaptureAudit: null,
    auditHealth: {
      verdict: 'missing',
      reason: 'No recorded operator snapshot found yet.'
    },
    nextActions: [
      {
        priority: 'high',
        area: 'operator-loop',
        command: 'npm run status:operator -- --record',
        reason: 'Generate the first recorded operator snapshot so the app can show live rollout status.'
      }
    ],
    historySummary: {
      sampleSize: 5,
      historyEntryCount: 0,
      previousLevel: null,
      previousCheckedAt: null,
      levelChanged: false,
      recentLevels: [],
      recentLevelCounts: {},
      currentStreak: {
        level: null,
        count: 0,
        sinceCheckedAt: null
      }
    }
  };
}

export async function getOperatorStatusSummary(): Promise<OperatorStatusSummary> {
  try {
    const raw = await fs.readFile(operatorStatusPath, 'utf8');
    const parsed = JSON.parse(raw) as OperatorStatusSummary;
    const snapshotStaleHours = parsed.snapshotFreshness?.staleThresholdHours;
    return {
      ...parsed,
      snapshotFreshness: getSnapshotFreshness(
        parsed.checkedAt,
        typeof snapshotStaleHours === 'number' && Number.isFinite(snapshotStaleHours) && snapshotStaleHours > 0
          ? snapshotStaleHours
          : defaultOperatorSnapshotStaleThresholdHours
      )
    };
  } catch (error) {
    if (error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT') {
      return getFallbackOperatorStatus();
    }

    return {
      ...getFallbackOperatorStatus(),
      overall: {
        level: 'WATCH',
        issues: [],
        warnings: ['Recorded operator snapshot exists but could not be parsed. Re-run `npm run status:operator -- --record` to refresh it.']
      },
      runtimeHealth: {
        level: 'UNKNOWN',
        summary: 'Recorded operator snapshot could not be parsed.'
      },
      installedCron: {
        matchCount: 0,
        duplicatesDetected: false,
        latestRun: null,
        runHealth: {
          verdict: 'unknown',
          reason: 'Recorded operator snapshot could not be parsed.'
        }
      },
      auditHealth: {
        verdict: 'error',
        reason: 'Recorded operator snapshot could not be parsed.'
      },
      nextActions: [
        {
          priority: 'high',
          area: 'operator-loop',
          command: 'npm run status:operator -- --record',
          reason: 'Refresh the recorded operator snapshot after the parse failure.'
        }
      ]
    };
  }
}
