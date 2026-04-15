import { readFile } from 'node:fs/promises';
import path from 'node:path';

const repoRoot = process.cwd();
const allowedRoots = [path.join(repoRoot, 'out'), path.join(repoRoot, 'public', 'states')];

function getContentType(filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  if (extension === '.png') return 'image/png';
  if (extension === '.jpg' || extension === '.jpeg') return 'image/jpeg';
  if (extension === '.webp') return 'image/webp';
  return 'application/octet-stream';
}

export async function GET(_request: Request, context: { params: { assetPath: string[] } }) {
  const segments = context.params.assetPath ?? [];
  const resolvedPath = path.resolve(repoRoot, ...segments);
  const isAllowed = allowedRoots.some((root) => resolvedPath === root || resolvedPath.startsWith(`${root}${path.sep}`));

  if (!isAllowed) {
    return new Response('Not found', { status: 404 });
  }

  try {
    const file = await readFile(resolvedPath);
    return new Response(file, {
      headers: {
        'Content-Type': getContentType(resolvedPath),
        'Cache-Control': 'public, max-age=60'
      }
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
