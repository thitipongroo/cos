// Bytes → a figure a person reads.
//
// Lifted out of (auth)/privacy-policy-downloaded.tsx when the Terms of Use gained a download receipt
// of its own (ADR-092) and needed the same figure. It moved to lib/ rather than being imported from
// one screen into another for a second reason: src/lib is inside the 100/100 coverage gate and
// src/app is not, so the rounding this states now has tests behind it.

/** KB/MB with one decimal, which is what both receipt drawings show. */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
