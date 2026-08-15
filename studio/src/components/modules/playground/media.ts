import { getAssetUrl } from '@/lib/utils';

export function resolvePlaygroundMediaUrl(path: string | null | undefined): string {
  if (!path) return '';
  if (path.startsWith('data:')) return path;
  return getAssetUrl(path.replace(/^output\//, ''));
}

export function resolvePlaygroundMediaType(
  mediaType: string | null | undefined,
  path: string | null | undefined,
): 'image' | 'video' {
  if (mediaType === 'video') return 'video';
  if (mediaType === 'image') return 'image';
  return /\.(mp4|mov|webm|avi|mkv)(?:[?#].*)?$/i.test(path || '') ? 'video' : 'image';
}
