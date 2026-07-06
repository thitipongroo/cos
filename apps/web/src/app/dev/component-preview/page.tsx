import { notFound } from 'next/navigation';
import { PreviewClient } from './PreviewClient';

// Dev/test-only component harness (see PreviewClient). Excluded from auth in middleware.ts and
// 404s in production, so it never ships as a reachable page.
export default function ComponentPreviewPage() {
  if (process.env.NODE_ENV === 'production') notFound();
  return <PreviewClient />;
}
