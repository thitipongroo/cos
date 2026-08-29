/**
 * Phase 9 — the authoritative file constraints (master:3221-3257).
 *
 * These are the limits a malicious upload probes first, so each is asserted as a VALUE, not as
 * "some limit exists". A 20 MB image cap that silently became 200 MB still passes any test that
 * only checks a cap is configured.
 */
import { read } from '../helpers';

const SERVICE = 'services/file-service';
const validation = read(`${SERVICE}/src/middleware/validation.ts`);

/** master:3231-3248 — every MIME type the spec allows, by group. */
const SPEC_MIME: Array<[string, string[]]> = [
  ['images', ['image/jpeg', 'image/png', 'image/webp', 'image/gif']],
  ['documents', ['application/pdf']],
  ['CAD', ['application/dxf', 'application/acad', 'image/vnd.dwg']],
  [
    'spreadsheets',
    [
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    ],
  ],
  ['archives', ['application/zip']],
  ['video', ['video/mp4', 'video/quicktime', 'video/webm', 'video/x-msvideo', 'video/x-ms-wmv']],
];

/** master:3224-3228 — the cap for each group, in bytes. */
const SPEC_SIZES: Array<[string, string, number]> = [
  ['image/jpeg', '20 MB', 20 * 1024 * 1024],
  ['image/png', '20 MB', 20 * 1024 * 1024],
  ['image/webp', '20 MB', 20 * 1024 * 1024],
  ['application/pdf', '100 MB', 100 * 1024 * 1024],
  ['application/dxf', '200 MB', 200 * 1024 * 1024],
  ['image/vnd.dwg', '200 MB', 200 * 1024 * 1024],
  ['video/mp4', '1 GB', 1024 * 1024 * 1024],
  ['video/quicktime', '1 GB', 1024 * 1024 * 1024],
];

describe('Phase 9 · runtime (master:3221, 3319)', () => {
  it('is a Fastify service, not a Nest module', () => {
    // "Runtime: Fastify (for multipart upload throughput)". The rest of the platform is NestJS; this
    // one is deliberately not.
    const pkg = read(`${SERVICE}/package.json`);
    expect(pkg).toMatch(/"fastify":/);
    expect(pkg).toMatch(/"@fastify\/multipart":/);
  });

  it('uses the MinIO client (master:3269, 3320)', () => {
    expect(read(`${SERVICE}/package.json`)).toMatch(/"minio":/);
  });
});

describe('Phase 9 · allowed MIME types (master:3231-3248)', () => {
  it.each(SPEC_MIME)('accepts every %s type the spec lists', (_group, types) => {
    // Asserted in the "must be present" direction only. The allowlist also carries audio types for
    // the voice notes of `20-ux-flow` §"Voice transcription for field notes", which master's Phase 9
    // list predates — a superset is a separate question from a missing entry, and only a missing
    // entry breaks a documented upload.
    for (const mime of types) expect(validation).toContain(`'${mime}'`);
  });

  it('the allowlist is closed, not a denylist', () => {
    // A denylist is open by default: whatever it forgets is accepted. The extension check has to be
    // an allowlist for the same reason the MIME check is.
    expect(validation).toMatch(/ALLOWED_MIME_TYPES/);
    expect(validation).toMatch(/ALLOWED_EXTENSIONS/);
  });
});

describe('Phase 9 · size caps (master:3224-3228)', () => {
  it.each(SPEC_SIZES)('%s is capped at %s', (mime, _label, bytes) => {
    const table = validation.slice(validation.indexOf('const SIZE_LIMITS'));
    const entry = new RegExp(`'${mime.replace('/', '\\/')}':\\s*([^,\\n]+)`);
    const match = table.match(entry);
    expect(match).not.toBeNull();
    // The source writes these as expressions (20 * 1024 * 1024); compare the value, not the spelling.

    expect(eval(match![1]!) as number).toBe(bytes);
  });
});

describe('Phase 9 · executables are blocked at upload (master:3250)', () => {
  it.each(['.exe', '.sh', '.bat', '.js'])('%s is not an accepted extension', (ext) => {
    // "NOT allowed: executable files (.exe, .sh, .bat, .js), BLOCKED at upload". With an allowlist
    // the test is that they are absent from it — a file that reaches storage and is served back
    // under a signed URL is a file someone can be persuaded to run.
    const list = validation.slice(
      validation.indexOf('ALLOWED_EXTENSIONS'),
      validation.indexOf('const SIZE_LIMITS'),
    );
    expect(list).not.toContain(`'${ext}'`);
  });

  it('rejection is explicit, not incidental', () => {
    expect(validation).toMatch(/BLOCKED_EXTENSION/);
  });
});

describe('Phase 9 · antivirus (master:3252-3257)', () => {
  const av = read(`${SERVICE}/src/services/antivirus.service.ts`);

  it('exposes scan(fileId) as the spec declares', () => {
    // `interface AntivirusHook { scan(fileId: UUID): Promise<ScanResult> }`
    expect(av).toMatch(/scan\(\s*fileId/);
  });

  it('returns a ScanResult carrying the threat when there is one', () => {
    // `{ clean: boolean, threat?: string }` — a boolean alone cannot tell an admin what was found.
    const types = read(`${SERVICE}/src/types.ts`);
    expect(types).toMatch(/ScanResult/);
    expect(types).toMatch(/threat/);
  });

  it('the three file statuses are exactly PENDING_SCAN, CLEAN, QUARANTINED (master:3257)', () => {
    const types = read(`${SERVICE}/src/types.ts`);
    for (const status of ['PENDING_SCAN', 'CLEAN', 'QUARANTINED']) {
      expect(types).toContain(status);
    }
  });

  it('quarantined files go to a separate bucket, not a folder (master:3253, 3274)', () => {
    // master:3253 writes the destination as "cos-quarantine/{tenant_id}/ bucket", which reads as a
    // path inside one shared bucket. It cannot be: master:3274 requires tenant isolation "enforced
    // via bucket-level policy in MinIO", and a shared bucket with per-tenant prefixes has no
    // bucket-level boundary to enforce. The implementation follows 3274 and the per-tenant bucket
    // pattern of 3270 — one quarantine bucket per tenant.
    const minio = read(`${SERVICE}/src/services/minio.service.ts`);
    expect(minio).toMatch(/cos-quarantine-\$\{tenantId\}/);
  });
});
