import fs from 'node:fs/promises';
import path from 'node:path';

export interface OperatorArtifactFreshness {
  verdict: 'fresh' | 'stale';
  age: string;
  staleThresholdHours: number;
  reason: string;
}

export interface OperatorArtifactMeta {
  fileName: 'latest.json' | 'latest.txt' | 'latest.md' | 'history.ndjson';
  label: string;
  relativePath: string;
  contentType: string;
  resolvedPath: string;
  sizeBytes: number;
  sizeHuman: string;
  updatedAt: string;
  freshness: OperatorArtifactFreshness;
}

const operatorStatusDir = path.join(process.cwd(), 'data', 'generated', 'operator-status');

const allowedArtifacts = new Map<OperatorArtifactMeta['fileName'], { contentType: string; label: string }>([
  ['latest.json', { contentType: 'application/json; charset=utf-8', label: 'Recorded operator status (JSON)' }],
  ['latest.txt', { contentType: 'text/plain; charset=utf-8', label: 'Recorded operator status (text)' }],
  ['latest.md', { contentType: 'text/markdown; charset=utf-8', label: 'Recorded operator status (Markdown)' }],
  ['history.ndjson', { contentType: 'application/x-ndjson; charset=utf-8', label: 'Recorded operator status history (NDJSON)' }]
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

export function getOperatorArtifactStaleThresholdHours() {
  const parsed = Number(process.env.BULL_BEAR_OPERATOR_ARTIFACT_STALE_HOURS);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
}

function summarizeArtifactFreshness(mtimeMs: number): OperatorArtifactFreshness {
  const staleThresholdHours = getOperatorArtifactStaleThresholdHours();
  const ageMs = Math.max(0, Date.now() - mtimeMs);
  const staleThresholdMs = staleThresholdHours * 60 * 60 * 1000;
  const verdict = ageMs <= staleThresholdMs ? 'fresh' : 'stale';

  return {
    verdict,
    age: formatAgeFromMs(ageMs),
    staleThresholdHours,
    reason: verdict === 'fresh'
      ? `Recorded operator artifact was updated within the ${staleThresholdHours}h freshness window.`
      : `Recorded operator artifact is older than the ${staleThresholdHours}h freshness window.`
  };
}

export function getOperatorArtifactDefinition(fileName: string) {
  const artifact = allowedArtifacts.get(fileName as OperatorArtifactMeta['fileName']);
  if (!artifact) return null;

  return {
    fileName: fileName as OperatorArtifactMeta['fileName'],
    label: artifact.label,
    contentType: artifact.contentType,
    relativePath: path.join('data', 'generated', 'operator-status', fileName).replace(/\\/g, '/'),
    resolvedPath: path.join(operatorStatusDir, fileName)
  };
}

export async function getOperatorArtifactMeta(fileName: string): Promise<OperatorArtifactMeta | null> {
  const definition = getOperatorArtifactDefinition(fileName);
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

export async function getOperatorArtifactEntries(): Promise<OperatorArtifactMeta[]> {
  const entries = await Promise.all(Array.from(allowedArtifacts.keys()).map((fileName) => getOperatorArtifactMeta(fileName)));
  return entries.filter((entry): entry is OperatorArtifactMeta => Boolean(entry));
}

export async function getOperatorArtifactSummary() {
  const artifactEntries = await getOperatorArtifactEntries();
  const staleThresholdHours = getOperatorArtifactStaleThresholdHours();
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
