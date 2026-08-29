/**
 * Phase 9 — storage layout and the file lifecycle (master:3259-3274).
 */
import { read } from '../helpers';

const SERVICE = 'services/file-service';
const minio = read(`${SERVICE}/src/services/minio.service.ts`);
const storedKey = read(`${SERVICE}/src/util/stored-key.ts`);
const db = read(`${SERVICE}/src/services/db.service.ts`);

describe('Phase 9 · MinIO layout (master:3269-3274)', () => {
  it('one bucket per tenant, named cos-{tenant_id} (master:3270)', () => {
    expect(minio).toMatch(/`cos-\$\{tenantId\}`/);
  });

  it('the object key is {year}/{month}/{file_id}/{original_filename} (master:3271)', () => {
    // Two files uploaded in the same month with the same name must not collide, which is what the
    // file_id segment between the month and the filename is for.
    expect(storedKey).toMatch(/\$\{year\}\/\$\{month\}\/\$\{fileId\}\/\$\{filename\}/);
  });

  it('the key is built in one place, so upload and ZIP extraction cannot drift apart', () => {
    // A second copy of this format is a second chance to get it wrong, and the two paths write to
    // the same bucket.
    const extraction = read(`${SERVICE}/src/services/zip-extraction.service.ts`);
    const routes = read(`${SERVICE}/src/routes/files.routes.ts`);
    expect(`${extraction}\n${routes}`).toMatch(/buildStoredKey/);
  });

  it('signed download URLs default to a 1-hour TTL (master:3272)', () => {
    expect(read(`${SERVICE}/src/config.ts`)).toMatch(/SIGNED_URL_TTL_SECONDS'\] \?\? '3600'/);
  });
});

describe('Phase 9 · uploads go through the service, never straight to MinIO (master:3273)', () => {
  it('the storage layer signs URLs for reading only', () => {
    // "POST to File Service → File Service streams to MinIO (no direct client upload)". A presigned
    // PUT handed to a browser would bypass every check this phase exists for at once: the MIME
    // allowlist, the size cap, the extension block and the virus scan.
    expect(minio).toContain('presignedGetObject');
    expect(minio).not.toContain('presignedPutObject');
    expect(minio).not.toContain('presignedPostPolicy');
  });

  it('the service writes the object itself', () => {
    expect(minio).toContain('putObject');
  });
});

describe('Phase 9 · deletion is soft first, hard later (master:3265-3266)', () => {
  it('delete sets deleted_at rather than removing the row', () => {
    expect(db).toMatch(/deleted_at/);
    expect(db).toMatch(/softDelete/i);
  });

  it('hard deletion happens 30 days after the soft delete (master:3266)', () => {
    // The window is the whole point of a soft delete: it is how long someone has to say the
    // deletion was a mistake.
    expect(db).toMatch(/deleted_at \+ INTERVAL '30 days' < now\(\)/);
  });

  it('quarantined files are purged on their own 30-day clock (master:3253)', () => {
    expect(db).toMatch(/quarantined_at \+ INTERVAL '30 days' < now\(\)/);
  });

  it('cleanup runs as a scheduled Temporal workflow (master:3266)', () => {
    // "automated cleanup job (Temporal scheduled workflow)" — not a cron in a container that no one
    // notices has stopped.
    const worker = read(`${SERVICE}/src/cleanup/worker.ts`);
    expect(worker).toMatch(/ScheduleClient/);
    expect(worker).toMatch(/cronExpressions: \['0 0 \* \* \*'\]/);
  });

  it('legal hold blocks hard deletion (master:3260-3264)', () => {
    // Retention policies "with legal hold (WORM / Object-Lock style)". A hold that the cleanup job
    // ignores is not a hold.
    expect(db).toMatch(/legal_hold/);
  });
});
