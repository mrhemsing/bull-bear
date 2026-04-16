const rawMediaBaseUrl = process.env.NEXT_PUBLIC_MEDIA_BASE_URL?.trim() || process.env.MEDIA_BASE_URL?.trim() || '';
const mediaBaseUrl = rawMediaBaseUrl.replace(/\/+$/, '');

export function mediaUrl(relativePath: string) {
  if (!relativePath.startsWith('/')) return relativePath;
  if (!mediaBaseUrl) return relativePath;
  return `${mediaBaseUrl}${relativePath}`;
}
