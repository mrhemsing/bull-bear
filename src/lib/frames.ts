import frames from '@/../data/frames.json';
import type { FrameRecord } from './types';

export function getFrames(): FrameRecord[] {
  return [...(frames as FrameRecord[])].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

export function getLatestFrame(): FrameRecord | null {
  return getFrames()[0] ?? null;
}
