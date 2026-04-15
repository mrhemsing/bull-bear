import fs from 'node:fs/promises';
import path from 'node:path';

export interface ReleaseArtifactFreshness {
  verdict: 'fresh' | 'stale';
  age: string;
  staleThresholdHours: number;
  reason: string;
}

export interface ReleaseArtifactMeta {
  fileName: 'latest.json' | 'latest.txt' | 'latest.md' | 'history.ndjson';
  label: string;
  relativePath: string;
  contentType: string;
  resolvedPath: string;
  sizeBytes: number;
  sizeHuman: string;
  updatedAt: string;
  freshness: ReleaseArtifactFreshness;
}

const releaseStatusDir = path.join(process.cwd(), 'data', 'generated', 'release-status');

const allowedArtifacts = new Map<ReleaseArtifactMeta['fileName'], { contentType: string; label: string }>([
  ['latest.json', { contentType: 'application/json; charset=utf-8', label: 'Recorded release status (JSON)' }],
  ['latest.txt', { contentType: 'text/plain; charset=utf-8', label: 'Recorded release status (text)' }],
  ['latest.md', { contentType: 'text/markdown; charset=utf-8', label: 'Recorded release status (Markdown)' }],
  ['history.ndjson', { contentType: 'application/x-ndjson; charset=utf-8', label: 'Recorded release status history (NDJSON)' }]
]);

const expectedArtifactFiles = Array.from(allowedArtifacts.keys());

function formatAgeFromMs(diffMs: number) {
  const totalMinutes = Math.max(0, Math.round(diffMs / 60000));
  if (totalMinutes < 60) return `${totalMinutes}m`;
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours < 24) return minutes === 0 ? `${hours}h` : `${hours}h ${minutes}m`;
  const days = Math.floor(hours / 24);
  const remainingHours = hours % 24;
  return remainingHours === 0 ? `${days}d` : `${days}d ${remainingHours}h`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const units = ['KB', 'MB', 'GB'];
  let value = bytes / 1024;
  let unitIndex = 0;
  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }
  return `${value.toFixed(value >= 10 || unitIndex === 0 ? 1 : 2)} ${units[unitIndex]}`;
}

export function getReleaseArtifactStaleThresholdHours() {
  const parsed = Number(process.env.BULL_BEAR_RELEASE_ARTIFACT_STALE_HOURS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
}

function summarizeArtifactFreshness(mtimeMs: number): ReleaseArtifactFreshness {
  const staleThresholdHours = getReleaseArtifactStaleThresholdHours();
  const ageMs = Math.max(0, Date.now() - mtimeMs);
  const staleThresholdMs = staleThresholdHours * 60 * 60 * 1000;
  const verdict = ageMs <= staleThresholdMs ? 'fresh' : 'stale';

  return {
    verdict,
    age: formatAgeFromMs(ageMs),
    staleThresholdHours,
    reason: verdict === 'fresh'
      ? `Recorded release artifact was updated within the ${staleThresholdHours}h freshness window.`
      : `Recorded release artifact is older than the ${staleThresholdHours}h freshness window.`
  };
}

export function getReleaseArtifactDefinition(fileName: string) {
  const artifact = allowedArtifacts.get(fileName as ReleaseArtifactMeta['fileName']);
  if (!artifact) return null;

  return {
    fileName: fileName as ReleaseArtifactMeta['fileName'],
    label: artifact.label,
    contentType: artifact.contentType,
    relativePath: path.join('data', 'generated', 'release-status', fileName).replace(/\\/g, '/'),
    resolvedPath: path.join(releaseStatusDir, fileName)
  };
}

export async function getReleaseArtifactMeta(fileName: string): Promise<ReleaseArtifactMeta | null> {
  const definition = getReleaseArtifactDefinition(fileName);
  if (!definition) return null;

  try {
    const fileStat = await fs.stat(definition.resolvedPath);
    return {
      ...definition,
      sizeBytes: fileStat.size,
      sizeHuman: formatBytes(fileStat.size),
      updatedAt: fileStat.mtime.toISOString(),
      freshness: summarizeArtifactFreshness(fileStat.mtimeMs)
    };
  } catch {
    return null;
  }
}

export async function getReleaseArtifactEntries(): Promise<ReleaseArtifactMeta[]> {
  const entries = await Promise.all(Array.from(allowedArtifacts.keys()).map((fileName) => getReleaseArtifactMeta(fileName)));
  return entries.filter((entry): entry is ReleaseArtifactMeta => Boolean(entry));
}

export async function getReleaseArtifactSummary() {
  const artifactEntries = await getReleaseArtifactEntries();
  const staleThresholdHours = getReleaseArtifactStaleThresholdHours();
  const expectedArtifactCount = allowedArtifacts.size;
  const artifactCount = artifactEntries.length;
  const presentFiles = artifactEntries.map((entry) => entry.fileName);
  const missingFiles = expectedArtifactFiles.filter((fileName) => !presentFiles.includes(fileName));
  const missingCount = missingFiles.length;
  const freshCount = artifactEntries.filter((entry) => entry.freshness.verdict === 'fresh').length;
  const staleCount = artifactEntries.filter((entry) => entry.freshness.verdict === 'stale').length;
  const latestArtifact = [...artifactEntries]
    .sort((a, b) => Date.parse(b.updatedAt) - Date.parse(a.updatedAt))[0] ?? null;
  const oldestArtifact = [...artifactEntries]
    .sort((a, b) => Date.parse(a.updatedAt) - Date.parse(b.updatedAt))[0] ?? null;
  const checkedAt = latestArtifact?.updatedAt ?? new Date().toISOString();

  return {
    artifactEntries,
    artifactCount,
    expectedArtifactCount,
    expectedArtifactFiles,
    missingCount,
    missingFiles,
    allPresent: artifactCount === expectedArtifactCount,
    freshCount,
    staleCount,
    allFresh: artifactEntries.length > 0 && staleCount === 0,
    staleThresholdHours,
    checkedAt,
    latestArtifact: latestArtifact
      ? {
          fileName: latestArtifact.fileName,
          updatedAt: latestArtifact.updatedAt,
          age: latestArtifact.freshness.age,
          freshness: latestArtifact.freshness.verdict
        }
      : null,
    oldestArtifact: oldestArtifact
      ? {
          fileName: oldestArtifact.fileName,
          updatedAt: oldestArtifact.updatedAt,
          age: oldestArtifact.freshness.age,
          freshness: oldestArtifact.freshness.verdict
        }
      : null
  };
}
