// Registers @fastify/multipart on the backend's Fastify instance (ADR-061 amendment, 2026-09-15).
//
// WHY GLOBAL. Nest mounts every controller on the ROOT Fastify instance, so there is no encapsulated
// context to register a plugin for one route. What registration adds globally is small: a content-type
// parser for multipart/form-data that does NOT read the body, and the request decorators
// (isMultipart / parts / file). A route that never calls them never buffers a byte. Before this, a
// multipart request to any route was a 415; after it, a multipart request to a JSON route reaches the
// handler with no body and fails that route's own validation with a 400.
//
// WHY THESE LIMITS. The plugin-level limits are the import form's limits (IMPORT_MULTIPART_LIMITS): the
// only caller today is POST /admin/central-prices/import, and a future upload route that needs more must
// raise them deliberately rather than inherit the plugin's defaults (1000 parts; file size = Fastify's
// bodyLimit). A route's own req.parts({ limits }) is deep-merged over these, so it can only be explicit.

import multipart from '@fastify/multipart';
import type { NestFastifyApplication } from '@nestjs/platform-fastify';

/** Largest file one import accepts. A national price list as .xlsx or CSV is well under a megabyte. */
export const MAX_IMPORT_FILE_BYTES = 5 * 1024 * 1024;

/**
 * busboy limits for the import form: one file and its three text fields (effective_period, source_ref,
 * justification). fieldSize is bytes: a 500-character Thai justification is up to 1,500 bytes of UTF-8, so 4 KiB
 * leaves room without letting a field become a second upload. Declared here, beneath the modules, so shared/ does
 * not depend on one (tests/conformance/foundation/09-module-boundaries.spec.ts).
 */
export const IMPORT_MULTIPART_LIMITS = {
  fileSize: MAX_IMPORT_FILE_BYTES,
  files: 1,
  fields: 3,
  parts: 4,
  fieldSize: 4096,
  fieldNameSize: 100,
  headerPairs: 100,
} as const;

export async function registerMultipart(app: NestFastifyApplication): Promise<void> {
  await app.register(multipart, {
    limits: { ...IMPORT_MULTIPART_LIMITS },
    // A file over fileSize makes part.toBuffer() reject with FST_REQ_FILE_TOO_LARGE (mapped to 413),
    // instead of silently handing back a truncated buffer.
    throwFileSizeLimit: true,
  });
}
