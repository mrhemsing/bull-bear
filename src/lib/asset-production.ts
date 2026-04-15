import { existsSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import type { StateManifestEntry } from './types';

interface ChecklistStillEntry {
  target: string;
  status: string;
  reviewSource: string | null;
  selectedAnchor: {
    sourceFile: string;
    canonicalTarget: string;
    notes?: string;
  } | null;
  candidateFiles: string[];
}

interface ChecklistLoopEntry {
  target: string;
  prompt: string;
  status: string;
  exists?: boolean;
  reviewSource?: string | null;
}

interface ChecklistEntry {
  id: string;
  index: number;
  label: string;
  still: ChecklistStillEntry;
  loops: ChecklistLoopEntry[];
}

interface ReviewQueueEntry {
  stateId: string;
  label: string;
  reviewType: string;
  sourceDir: string;
  selectedFile: string | null;
  candidateFiles: string[];
  notes: string | null;
}

interface LoopQueueEntry {
  stateId: string;
  stateIndex: number;
  label: string;
  variant: 'a' | 'b' | 'c';
  prompt: string;
  stillSource: string;
  stillTarget: string;
  loopTarget: string;
  priorityGroup: string;
  notes: string;
}

interface StillQueueEntry {
  stateId: string;
  stateIndex: number;
  label: string;
  direction: 'bearish-expansion' | 'bullish-expansion';
  prompt: string;
  stillTarget: string;
  outputDir: string;
  referenceStateId: string | null;
  referenceStillTarget: string | null;
  priorityGroup: string;
  notes: string;
}

interface NextActionEntry {
  type: 'generate-still' | 'generate-loop';
  priority: number;
  stateId: string;
  stateIndex: number;
  label: string;
  title: string;
  target: string;
  source: string;
  referenceStateId: string | null;
  referenceStillTarget: string | null;
  prompt: string;
  notes: string;
}

interface StagedRenderHandoffEntry {
  type: 'still' | 'loop';
  priority: number;
  stateId: string;
  stateIndex: number;
  label: string;
  variant: 'a' | 'b' | 'c' | null;
  target: string;
  outputDir: string;
  renderDir: string;
  renderManifestPath: string;
  renderPromptPath: string;
  referenceStateId: string | null;
  referenceStillSource: string | null;
  referenceCopy: string | null;
  notes: string;
}

interface ImageGenerationJobEntry {
  stateId: string;
  stateIndex: number;
  label: string;
  provider: string;
  mode: 'edit';
  model: string;
  image: string | null;
  prompt: string;
  count: number;
  size: string;
  outputDir: string;
  canonicalTarget: string;
  suggestedOutputs: string[];
  renderManifestPath: string;
  renderPromptPath: string;
  notes: string;
}

interface ImageGenerationResultEntry {
  stateId: string;
  stateIndex: number;
  status: 'generated' | 'dry-run' | 'blocked-missing-openai-api-key';
  model: string;
  image: string | null;
  outputDir: string;
  suggestedOutputs?: string[];
  outputs?: string[];
  canonicalTarget?: string;
  recordedAt?: string;
  notes: string;
}

interface LoopGenerationResultEntry {
  stateId: string;
  stateIndex: number;
  label: string;
  variant: 'a' | 'b' | 'c';
  status: 'generated' | 'dry-run' | 'blocked-missing-fal-key' | 'ready-for-provider-implementation';
  provider: string;
  stillReference: string | null;
  stillSource: string;
  renderDir: string;
  target: string;
  targetFilesystemPath: string;
  recordedAt?: string;
  notes: string;
}

export interface AssetProductionArtifactEntry {
  fileName: string;
  label: string;
  contentType: string;
  relativePath: string;
  sizeBytes: number;
  sizeHuman: string;
  updatedAt: string;
  freshness: LedgerFreshnessSummary;
}

export interface LedgerFreshnessSummary {
  verdict: 'fresh' | 'stale' | 'missing' | 'unknown';
  reason: string;
  age: string | null;
  staleThresholdHours: number | null;
}

export interface GenerationResultSummary {
  total: number;
  statusCounts: Record<string, number>;
  latestRecordedAt: string | null;
  latestStatus: string | null;
  freshness: LedgerFreshnessSummary;
}

export interface AssetProductionSummary {
  totalStates: number;
  approvedStills: number;
  candidateStates: number;
  pendingStates: number;
  readyForLoopGeneration: number;
  approvedLoops: number;
  readyLoopTargets: number;
  statesMissingAnyLoops: number;
  totalCandidateImages: number;
  reviewSourceExpectedCount: number;
  reviewSourceExpectedFiles: string[];
  reviewSourceMissingCount: number;
  reviewSourceMissingFiles: string[];
  reviewSourceAllPresent: boolean;
  reviewSourceLatestUpdatedAt: string | null;
  artifactEntries: AssetProductionArtifactEntry[];
  expectedArtifactCount: number;
  expectedArtifactFiles: string[];
  missingArtifactCount: number;
  missingArtifactFiles: string[];
  allArtifactsPresent: boolean;
  artifactFreshCount: number;
  artifactStaleCount: number;
  assetArtifactStaleThresholdHours: number;
  approvedStates: Array<{ id: string; index: number; label: string; sourceFile: string; canonicalTarget: string; notes?: string }>;
  candidateStatesList: Array<{ id: string; index: number; label: string; sourceDir: string; canonicalTarget: string; candidateFiles: string[] }>;
  pendingStatesList: Array<{ id: string; index: number; label: string; status: string }>;
  pendingStatesPreview: Array<{ id: string; index: number; label: string }>;
  reviewQueue: Array<ReviewQueueEntry & { canonicalTarget: string }>;
  activeRange: { start: number; end: number; label: string } | null;
  frontierStates: Array<{ id: string; index: number; label: string; status: 'ready-to-generate' | 'in-review' | 'approved'; reason: string }>;
  stillQueue: StillQueueEntry[];
  stillQueuePreview: StillQueueEntry[];
  loopQueue: LoopQueueEntry[];
  loopQueuePreview: LoopQueueEntry[];
  nextActions: NextActionEntry[];
  nextActionsPreview: NextActionEntry[];
  stagedRenderHandoff: StagedRenderHandoffEntry[];
  stagedRenderHandoffPreview: StagedRenderHandoffEntry[];
  imageGenerationJobs: ImageGenerationJobEntry[];
  imageGenerationJobsPreview: ImageGenerationJobEntry[];
  imageGenerationResults: ImageGenerationResultEntry[];
  imageGenerationResultsPreview: ImageGenerationResultEntry[];
  imageGenerationBlockedCount: number;
  imageGenerationGeneratedCount: number;
  imageGenerationDryRunCount: number;
  latestImageGenerationStatus: string | null;
  latestImageGenerationRecordedAt: string | null;
  imageGenerationSummary: GenerationResultSummary;
  loopGenerationResults: LoopGenerationResultEntry[];
  loopGenerationResultsPreview: LoopGenerationResultEntry[];
  loopGenerationBlockedCount: number;
  loopGenerationDryRunCount: number;
  loopGenerationImplementationPendingCount: number;
  latestLoopGenerationStatus: string | null;
  latestLoopGenerationRecordedAt: string | null;
  loopGenerationGeneratedCount: number;
  loopGenerationSummary: GenerationResultSummary;
  fullCoverageComplete: boolean;
}

const generatedDataDir = path.join(process.cwd(), 'data', 'generated');
const reviewStatusSourceFiles = [
  'canonical-review-queue.json',
  'canonical-asset-checklist.json',
  'canonical-production-next-actions.json',
  'canonical-still-generation-queue.json',
  'canonical-loop-generation-queue.json'
] as const;
const assetArtifactConfigs = [
  ['canonical-production-next-actions.json', 'Production next actions (JSON)', 'application/json; charset=utf-8'],
  ['canonical-production-next-actions.md', 'Production next actions (Markdown)', 'text/markdown; charset=utf-8'],
  ['canonical-staged-render-handoff.json', 'Staged render handoff (JSON)', 'application/json; charset=utf-8'],
  ['canonical-staged-render-handoff.md', 'Staged render handoff (Markdown)', 'text/markdown; charset=utf-8'],
  ['canonical-image-generation-jobs.json', 'Still image generation jobs (JSON)', 'application/json; charset=utf-8'],
  ['canonical-image-generation-jobs.md', 'Still image generation jobs (Markdown)', 'text/markdown; charset=utf-8'],
  ['canonical-image-generation-results.json', 'Still generation results (JSON)', 'application/json; charset=utf-8'],
  ['canonical-still-generation-queue.json', 'Still generation queue (JSON)', 'application/json; charset=utf-8'],
  ['canonical-still-generation-queue.md', 'Still generation queue (Markdown)', 'text/markdown; charset=utf-8'],
  ['canonical-loop-generation-queue.json', 'Loop generation queue (JSON)', 'application/json; charset=utf-8'],
  ['canonical-loop-generation-queue.md', 'Loop generation queue (Markdown)', 'text/markdown; charset=utf-8'],
  ['canonical-loop-generation-results.json', 'Loop generation results (JSON)', 'application/json; charset=utf-8'],
  ['canonical-loop-render-jobs.json', 'Loop render jobs (JSON)', 'application/json; charset=utf-8'],
  ['canonical-loop-render-jobs.md', 'Loop render jobs (Markdown)', 'text/markdown; charset=utf-8']
] as const;

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes < 0) return 'unknown size';
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

function readGeneratedJson<T>(fileName: string, fallback: T): T {
  const resolvedPath = path.join(generatedDataDir, fileName);
  try {
    return JSON.parse(readFileSync(resolvedPath, 'utf8')) as T;
  } catch {
    return fallback;
  }
}

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

function getPositiveEnvHours(name: string, fallback: number) {
  const raw = process.env[name];
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function getLedgerStaleThresholdHours() {
  return getPositiveEnvHours('BULL_BEAR_ASSET_LEDGER_STALE_HOURS', 24);
}

export function getAssetArtifactStaleThresholdHours() {
  return getPositiveEnvHours('BULL_BEAR_ASSET_ARTIFACT_STALE_HOURS', 24);
}

function summarizeFreshness(latestRecordedAt: string | null): LedgerFreshnessSummary {
  const staleThresholdHours = getLedgerStaleThresholdHours();

  if (!latestRecordedAt) {
    return {
      verdict: 'missing',
      reason: 'No recorded execution entries yet.',
      age: null,
      staleThresholdHours
    };
  }

  const latestTime = Date.parse(latestRecordedAt);
  if (!Number.isFinite(latestTime)) {
    return {
      verdict: 'unknown',
      reason: 'The latest execution timestamp could not be parsed.',
      age: null,
      staleThresholdHours
    };
  }

  const ageMs = Math.max(0, Date.now() - latestTime);
  const age = formatAgeFromMs(ageMs);
  const staleThresholdMs = staleThresholdHours * 60 * 60 * 1000;
  const verdict = ageMs <= staleThresholdMs ? 'fresh' : 'stale';

  return {
    verdict,
    reason: verdict === 'fresh'
      ? `Latest execution ledger entry is within the ${staleThresholdHours}h freshness window.`
      : `Latest execution ledger entry is older than the ${staleThresholdHours}h freshness window.`,
    age,
    staleThresholdHours
  };
}

function summarizeArtifactFreshness(updatedAt: string): LedgerFreshnessSummary {
  const staleThresholdHours = getAssetArtifactStaleThresholdHours();
  const updatedMs = Date.parse(updatedAt);

  if (!Number.isFinite(updatedMs)) {
    return {
      verdict: 'unknown',
      reason: 'The artifact timestamp could not be parsed.',
      age: null,
      staleThresholdHours
    };
  }

  const ageMs = Math.max(0, Date.now() - updatedMs);
  const age = formatAgeFromMs(ageMs);
  const staleThresholdMs = staleThresholdHours * 60 * 60 * 1000;
  const verdict = ageMs <= staleThresholdMs ? 'fresh' : 'stale';

  return {
    verdict,
    reason: verdict === 'fresh'
      ? `Artifact was updated within the ${staleThresholdHours}h freshness window.`
      : `Artifact is older than the ${staleThresholdHours}h freshness window.`,
    age,
    staleThresholdHours
  };
}

function getAssetProductionArtifactEntries(): AssetProductionArtifactEntry[] {
  return assetArtifactConfigs.flatMap(([fileName, label, contentType]) => {
    const resolvedPath = path.join(generatedDataDir, fileName);
    if (!existsSync(resolvedPath)) return [];
    const fileStat = statSync(resolvedPath);
    const updatedAt = fileStat.mtime.toISOString();
    return [{
      fileName,
      label,
      contentType,
      relativePath: path.join('data', 'generated', fileName).replace(/\\/g, '/'),
      sizeBytes: fileStat.size,
      sizeHuman: formatBytes(fileStat.size),
      updatedAt,
      freshness: summarizeArtifactFreshness(updatedAt)
    } satisfies AssetProductionArtifactEntry];
  });
}

function normalizeImportedStateAssetPath(value: string) {
  return value
    .replace(/(^|\/)states\/state-(\d{2})$/i, '$1states/$2')
    .replace(/(^|\/)states\/state-(\d{2})\/still\.png$/i, '$1states/$2.png')
    .replace(/(^|\/)states\/state-(\d{2})\/loop-([abc])\.mp4$/i, '$1states/$2-$3.mp4');
}

function normalizeImportedStateAssetPaths<T>(value: T): T {
  if (typeof value === 'string') {
    return normalizeImportedStateAssetPath(value) as T;
  }

  if (Array.isArray(value)) {
    return value.map((entry) => normalizeImportedStateAssetPaths(entry)) as T;
  }

  if (!value || typeof value !== 'object') {
    return value;
  }

  return Object.fromEntries(
    Object.entries(value).map(([key, entry]) => [key, normalizeImportedStateAssetPaths(entry)])
  ) as T;
}

function getReviewSourceSummary() {
  const sourceEntries = reviewStatusSourceFiles.map((fileName) => {
    const resolvedPath = path.join(generatedDataDir, fileName);
    if (!existsSync(resolvedPath)) {
      return {
        fileName,
        exists: false,
        updatedAt: null,
      };
    }

    const ms = statSync(resolvedPath).mtimeMs;
    return {
      fileName,
      exists: true,
      updatedAt: Number.isFinite(ms) ? new Date(ms).toISOString() : null,
    };
  });

  const missingFiles = sourceEntries.filter((entry) => !entry.exists).map((entry) => entry.fileName);
  const latestUpdatedAt = sourceEntries
    .map((entry) => entry.updatedAt)
    .filter(Boolean)
    .map((value) => ({ value, ms: Date.parse(value as string) }))
    .filter((entry) => Number.isFinite(entry.ms))
    .sort((a, b) => b.ms - a.ms)[0]?.value ?? null;

  return {
    expectedFiles: [...reviewStatusSourceFiles],
    expectedCount: reviewStatusSourceFiles.length,
    missingFiles,
    missingCount: missingFiles.length,
    allPresent: missingFiles.length === 0,
    latestUpdatedAt,
  };
}

function summarizeGenerationResults<T extends { status: string; recordedAt?: string }>(entries: T[]): GenerationResultSummary {
  const summary = entries.reduce<{
    total: number;
    statusCounts: Record<string, number>;
    latestRecordedAt: string | null;
    latestStatus: string | null;
    latestRecordedAtMs: number | null;
  }>((current, entry) => {
    current.total += 1;
    current.statusCounts[entry.status] = (current.statusCounts[entry.status] ?? 0) + 1;

    if (entry.recordedAt) {
      const recordedAtMs = Date.parse(entry.recordedAt);
      if (Number.isFinite(recordedAtMs) && (current.latestRecordedAtMs === null || recordedAtMs > current.latestRecordedAtMs)) {
        current.latestRecordedAtMs = recordedAtMs;
        current.latestRecordedAt = entry.recordedAt;
        current.latestStatus = entry.status;
      }
    }

    return current;
  }, {
    total: 0,
    statusCounts: {},
    latestRecordedAt: null,
    latestStatus: null,
    latestRecordedAtMs: null,
  });

  return {
    total: summary.total,
    statusCounts: summary.statusCounts,
    latestRecordedAt: summary.latestRecordedAt,
    latestStatus: summary.latestStatus,
    freshness: summarizeFreshness(summary.latestRecordedAt)
  };
}

function buildContiguousRange(indexes: number[], seed: number) {
  if (!indexes.includes(seed)) {
    return null;
  }

  const approved = new Set(indexes);
  let start = seed;
  let end = seed;

  while (approved.has(start - 1)) start -= 1;
  while (approved.has(end + 1)) end += 1;

  return { start, end };
}

function readStateManifest() {
  return readGeneratedJson<StateManifestEntry[]>(path.join('..', 'state-manifest.json'), []);
}

function getImportedRuntimeCoverage(manifest: StateManifestEntry[]) {
  const publicDir = path.join(process.cwd(), 'public');
  const stateCoverage = manifest.map((entry) => {
    const stillExists = typeof entry.still === 'string' && existsSync(path.join(publicDir, entry.still.replace(/^\//, '').replace(/\//g, path.sep)));
    const existingLoops = (entry.loops ?? []).filter((loopPath) => typeof loopPath === 'string' && existsSync(path.join(publicDir, loopPath.replace(/^\//, '').replace(/\//g, path.sep))));

    return {
      entry,
      stillExists,
      existingLoops,
      hasFullLoopSet: existingLoops.length === 3
    };
  });

  return {
    totalStates: manifest.length,
    approvedStills: stateCoverage.filter((item) => item.stillExists).length,
    approvedLoops: stateCoverage.reduce((sum, item) => sum + item.existingLoops.length, 0),
    pendingStates: stateCoverage.filter((item) => !item.stillExists || !item.hasFullLoopSet).length,
    statesMissingAnyLoops: stateCoverage.filter((item) => item.stillExists && !item.hasFullLoopSet).length,
    fullCoverageComplete: manifest.length > 0 && stateCoverage.every((item) => item.stillExists && item.hasFullLoopSet)
  };
}

export function getAssetProductionSummary(): AssetProductionSummary {
  const canonicalChecklist = readGeneratedJson<ChecklistEntry[]>('canonical-asset-checklist.json', []);
  const stateManifest = readStateManifest();
  const importedCoverage = getImportedRuntimeCoverage(stateManifest);
  const canonicalLoopQueue = readGeneratedJson<LoopQueueEntry[]>('canonical-loop-generation-queue.json', []);
  const canonicalNextActions = readGeneratedJson<NextActionEntry[]>('canonical-production-next-actions.json', []);
  const canonicalReviewQueue = readGeneratedJson<ReviewQueueEntry[]>('canonical-review-queue.json', []);
  const canonicalStagedRenderHandoff = readGeneratedJson<StagedRenderHandoffEntry[]>('canonical-staged-render-handoff.json', []);
  const canonicalStillQueue = readGeneratedJson<StillQueueEntry[]>('canonical-still-generation-queue.json', []);
  const canonicalImageGenerationJobs = readGeneratedJson<ImageGenerationJobEntry[]>('canonical-image-generation-jobs.json', []);
  const canonicalImageGenerationResults = readGeneratedJson<ImageGenerationResultEntry[]>('canonical-image-generation-results.json', []);
  const canonicalLoopGenerationResults = readGeneratedJson<LoopGenerationResultEntry[]>('canonical-loop-generation-results.json', []);
  const assetNextActions = importedCoverage.fullCoverageComplete ? [] : canonicalNextActions;

  const approvedStates = canonicalChecklist
    .filter((entry) => entry.still.selectedAnchor)
    .map((entry) => ({
      id: entry.id,
      index: entry.index,
      label: entry.label,
      sourceFile: entry.still.selectedAnchor!.sourceFile,
      canonicalTarget: entry.still.selectedAnchor!.canonicalTarget,
      notes: entry.still.selectedAnchor!.notes
    }));

  const candidateStatesList = canonicalChecklist
    .filter((entry) => entry.still.candidateFiles.length > 0)
    .map((entry) => ({
      id: entry.id,
      index: entry.index,
      label: entry.label,
      sourceDir: entry.still.reviewSource ?? 'out/',
      canonicalTarget: entry.still.target,
      candidateFiles: entry.still.candidateFiles,
    }));

  const pendingStatesList = canonicalChecklist
    .filter((entry) => !entry.still.selectedAnchor && entry.still.candidateFiles.length === 0)
    .map((entry) => ({
      id: entry.id,
      index: entry.index,
      label: entry.label,
      status: entry.still.status
    }));

  const approvedLoopTargets = canonicalChecklist.flatMap((entry) => entry.loops).filter((loop) => loop.status === 'approved');
  const readyLoopTargets = canonicalChecklist.flatMap((entry) => entry.loops).filter((loop) => loop.status === 'ready-to-generate');
  const statesMissingAnyLoops = canonicalChecklist.filter((entry) => entry.still.selectedAnchor && entry.loops.some((loop) => loop.status !== 'approved'));

  const approvedIndexes = approvedStates.map((entry) => entry.index);
  const anchorStateId = canonicalReviewQueue.find((entry) => entry.reviewType === 'approved-anchor')?.stateId;
  const anchorIndex = canonicalChecklist.find((entry) => entry.id === anchorStateId)?.index ?? approvedIndexes[0] ?? null;
  const activeRangeBase = anchorIndex ? buildContiguousRange(approvedIndexes, anchorIndex) : null;
  const activeRange = activeRangeBase
    ? {
        ...activeRangeBase,
        label: activeRangeBase.start === activeRangeBase.end ? `State ${activeRangeBase.start}` : `States ${activeRangeBase.start}–${activeRangeBase.end}`
      }
    : null;

  const frontierIndexes = activeRangeBase
    ? [activeRangeBase.start - 1, activeRangeBase.end + 1].filter((index) => index >= 1 && index <= canonicalChecklist.length)
    : [];

  const frontierStates = frontierIndexes
    .map((index) => canonicalChecklist.find((entry) => entry.index === index))
    .filter((entry): entry is ChecklistEntry => Boolean(entry))
    .map((entry) => {
      if (entry.still.selectedAnchor) {
        return {
          id: entry.id,
          index: entry.index,
          label: entry.label,
          status: 'approved' as const,
          reason: `Approved and ready at ${entry.still.target}.`
        };
      }

      if (entry.still.candidateFiles.length > 0) {
        return {
          id: entry.id,
          index: entry.index,
          label: entry.label,
          status: 'in-review' as const,
          reason: `${entry.still.candidateFiles.length} adjacent candidates are waiting for winner selection.`
        };
      }

      return {
        id: entry.id,
        index: entry.index,
        label: entry.label,
        status: 'ready-to-generate' as const,
        reason: 'This is the next untouched outward state once the current contiguous range is locked.'
      };
    });

  const reviewSourceSummary = getReviewSourceSummary();
  const artifactEntries = getAssetProductionArtifactEntries();
  const expectedArtifactFiles = assetArtifactConfigs.map(([fileName]) => fileName);
  const expectedArtifactCount = expectedArtifactFiles.length;
  const presentArtifactFiles = artifactEntries.map((entry) => entry.fileName);
  const missingArtifactFiles = expectedArtifactFiles.filter((fileName) => !presentArtifactFiles.includes(fileName));
  const missingArtifactCount = missingArtifactFiles.length;
  const artifactFreshCount = artifactEntries.filter((entry) => entry.freshness.verdict === 'fresh').length;
  const artifactStaleCount = artifactEntries.filter((entry) => entry.freshness.verdict === 'stale').length;
  const assetArtifactStaleThresholdHours = getAssetArtifactStaleThresholdHours();
  const imageGenerationSummary = summarizeGenerationResults(canonicalImageGenerationResults);
  const imageGenerationBlockedCount = canonicalImageGenerationResults.filter((entry) => entry.status === 'blocked-missing-openai-api-key').length;
  const imageGenerationGeneratedCount = canonicalImageGenerationResults.filter((entry) => entry.status === 'generated').length;
  const imageGenerationDryRunCount = canonicalImageGenerationResults.filter((entry) => entry.status === 'dry-run').length;
  const latestImageGenerationStatus = imageGenerationSummary.latestStatus;
  const latestImageGenerationRecordedAt = imageGenerationSummary.latestRecordedAt;
  const loopGenerationSummary = summarizeGenerationResults(canonicalLoopGenerationResults);
  const loopGenerationBlockedCount = canonicalLoopGenerationResults.filter((entry) => entry.status === 'blocked-missing-fal-key').length;
  const loopGenerationDryRunCount = canonicalLoopGenerationResults.filter((entry) => entry.status === 'dry-run').length;
  const loopGenerationGeneratedCount = canonicalLoopGenerationResults.filter((entry) => entry.status === 'generated').length;
  const loopGenerationImplementationPendingCount = canonicalLoopGenerationResults.filter((entry) => entry.status === 'ready-for-provider-implementation').length;
  const latestLoopGenerationStatus = loopGenerationSummary.latestStatus;
  const latestLoopGenerationRecordedAt = loopGenerationSummary.latestRecordedAt;
  const fullCoverageComplete = importedCoverage.fullCoverageComplete;
  const totalStates = importedCoverage.totalStates || canonicalChecklist.length;
  const approvedStills = importedCoverage.approvedStills;
  const approvedLoops = importedCoverage.approvedLoops;
  const pendingStates = importedCoverage.pendingStates;
  const statesMissingAnyLoopsCount = importedCoverage.statesMissingAnyLoops;
  const readyForLoopGeneration = statesMissingAnyLoopsCount;

  return normalizeImportedStateAssetPaths({
    totalStates,
    approvedStills,
    candidateStates: candidateStatesList.length,
    pendingStates,
    readyForLoopGeneration,
    approvedLoops,
    readyLoopTargets: readyLoopTargets.length,
    statesMissingAnyLoops: statesMissingAnyLoopsCount,
    totalCandidateImages: candidateStatesList.reduce((sum, entry) => sum + entry.candidateFiles.length, 0),
    reviewSourceExpectedCount: reviewSourceSummary.expectedCount,
    reviewSourceExpectedFiles: reviewSourceSummary.expectedFiles,
    reviewSourceMissingCount: reviewSourceSummary.missingCount,
    reviewSourceMissingFiles: reviewSourceSummary.missingFiles,
    reviewSourceAllPresent: reviewSourceSummary.allPresent,
    reviewSourceLatestUpdatedAt: reviewSourceSummary.latestUpdatedAt,
    artifactEntries,
    expectedArtifactCount,
    expectedArtifactFiles,
    missingArtifactCount,
    missingArtifactFiles,
    allArtifactsPresent: artifactEntries.length === expectedArtifactCount,
    artifactFreshCount,
    artifactStaleCount,
    assetArtifactStaleThresholdHours,
    approvedStates,
    candidateStatesList,
    pendingStatesList,
    pendingStatesPreview: pendingStatesList.slice(0, 6).map(({ id, index, label }) => ({ id, index, label })),
    reviewQueue: canonicalReviewQueue.map((entry) => ({
      ...entry,
      canonicalTarget: canonicalChecklist.find((item) => item.id === entry.stateId)?.still.target ?? `/states/${String(entry.stateId).replace(/^state-/, '')}.png`
    })),
    activeRange,
    frontierStates,
    stillQueue: canonicalStillQueue,
    stillQueuePreview: canonicalStillQueue.slice(0, 6),
    loopQueue: canonicalLoopQueue,
    loopQueuePreview: canonicalLoopQueue.slice(0, 6),
    nextActions: assetNextActions,
    nextActionsPreview: assetNextActions.slice(0, 8),
    stagedRenderHandoff: canonicalStagedRenderHandoff,
    stagedRenderHandoffPreview: canonicalStagedRenderHandoff.slice(0, 8),
    imageGenerationJobs: canonicalImageGenerationJobs,
    imageGenerationJobsPreview: canonicalImageGenerationJobs.slice(0, 6),
    imageGenerationResults: canonicalImageGenerationResults,
    imageGenerationResultsPreview: canonicalImageGenerationResults.slice(0, 6),
    imageGenerationBlockedCount,
    imageGenerationGeneratedCount,
    imageGenerationDryRunCount,
    latestImageGenerationStatus,
    latestImageGenerationRecordedAt,
    imageGenerationSummary,
    loopGenerationResults: canonicalLoopGenerationResults,
    loopGenerationResultsPreview: canonicalLoopGenerationResults.slice(0, 6),
    loopGenerationBlockedCount,
    loopGenerationDryRunCount,
    loopGenerationGeneratedCount,
    loopGenerationImplementationPendingCount,
    latestLoopGenerationStatus,
    latestLoopGenerationRecordedAt,
    loopGenerationSummary,
    fullCoverageComplete,
  });
}
