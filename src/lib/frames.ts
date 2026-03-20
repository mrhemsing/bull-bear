import fs from 'node:fs/promises';
import path from 'node:path';
import frames from '@/../data/frames.json';
import stateManifest from '@/../data/state-manifest.json';
import type { FrameRecord, StateManifestEntry } from './types';

const FRAMES_PATH = path.join(process.cwd(), 'data', 'frames.json');
const PUBLIC_FRAMES_DIR = path.join(process.cwd(), 'public', 'frames');
const STATE_MANIFEST = stateManifest as StateManifestEntry[];

export function getFrames(): FrameRecord[] {
  return [...(frames as FrameRecord[])].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

export function getLatestFrame(): FrameRecord | null {
  return getFrames()[0] ?? null;
}

export function getStateManifest(): StateManifestEntry[] {
  return [...STATE_MANIFEST];
}

export function getStateManifestEntry(stateIndex?: number): StateManifestEntry | null {
  if (!stateIndex) return null;
  return STATE_MANIFEST.find((entry) => entry.index === stateIndex) ?? null;
}

export async function readFramesFromDisk(): Promise<FrameRecord[]> {
  const content = await fs.readFile(FRAMES_PATH, 'utf8');
  return JSON.parse(content) as FrameRecord[];
}

export async function saveFrameRecord(frame: FrameRecord): Promise<FrameRecord[]> {
  const existing = await readFramesFromDisk();
  const withoutDuplicate = existing.filter((entry) => entry.id !== frame.id);
  const updated = [frame, ...withoutDuplicate].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
  await fs.writeFile(FRAMES_PATH, JSON.stringify(updated, null, 2));
  return updated;
}

export async function shouldPersistFrame(nextFrame: Pick<FrameRecord, 'stateIndex' | 'finalScore'>): Promise<boolean> {
  const existing = await readFramesFromDisk();
  const latest = [...existing].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1))[0];

  if (!latest) return true;
  if (latest.stateIndex !== nextFrame.stateIndex) return true;

  const latestScore = latest.finalScore ?? null;
  if (latestScore === null || nextFrame.finalScore === undefined) return false;

  return Math.abs(latestScore - nextFrame.finalScore) >= 10;
}

export async function saveGeneratedImage(params: {
  timestamp: string;
  imageBase64?: string;
  imageMimeType?: string;
}): Promise<string | null> {
  if (!params.imageBase64) {
    return null;
  }

  await fs.mkdir(PUBLIC_FRAMES_DIR, { recursive: true });

  const extension = params.imageMimeType === 'image/jpeg' ? 'jpg' : 'png';
  const safeName = params.timestamp.replaceAll(':', '-').replaceAll('.', '-');
  const fileName = `${safeName}.${extension}`;
  const filePath = path.join(PUBLIC_FRAMES_DIR, fileName);

  await fs.writeFile(filePath, Buffer.from(params.imageBase64, 'base64'));

  return `/frames/${fileName}`;
}
