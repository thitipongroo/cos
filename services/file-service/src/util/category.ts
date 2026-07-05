// File category derivation (mirrors the SQL backfill in 20260706000003). Retention policies are
// scoped per tenant + per category, so every stored file records the category it belongs to.

export type FileCategory = 'image' | 'document' | 'cad' | 'video' | 'archive' | 'other';

export const FILE_CATEGORIES: readonly FileCategory[] = [
  'image',
  'document',
  'cad',
  'video',
  'archive',
] as const;

const MIME_CATEGORY: Record<string, FileCategory> = {
  'image/jpeg': 'image',
  'image/png': 'image',
  'image/webp': 'image',
  'image/gif': 'image',
  'application/pdf': 'document',
  'application/vnd.ms-excel': 'document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'document',
  'application/dxf': 'cad',
  'application/acad': 'cad',
  'image/vnd.dwg': 'cad',
  'video/mp4': 'video',
  'video/quicktime': 'video',
  'video/webm': 'video',
  'video/x-msvideo': 'video',
  'video/x-ms-wmv': 'video',
  'application/zip': 'archive',
};

export function categoryFor(mimeType: string): FileCategory {
  return MIME_CATEGORY[mimeType] ?? 'other';
}

export function isValidCategory(value: string): value is FileCategory {
  return (FILE_CATEGORIES as readonly string[]).includes(value);
}
