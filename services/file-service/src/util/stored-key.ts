// MinIO object key layout (spec §Phase 9): {year}/{month}/{file_id}/{original_filename}.
// Shared by the upload route and the ZIP extraction worker so the key format never drifts.
export function buildStoredKey(fileId: string, filename: string): string {
  const now = new Date();
  const year = now.getUTCFullYear();
  const month = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${year}/${month}/${fileId}/${filename}`;
}
