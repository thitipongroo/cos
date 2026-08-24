// Archiving the export (ADR-078).
//
// The round-trip test is the one that matters: yauzl is what File Service reads ZIPs with in
// production, so a ZIP this writes must be readable by that reader. Asserting on byte counts or on
// yazl's own output would only prove yazl agrees with itself.

import { fromBuffer, type Entry } from 'yauzl';
import { ZipFile } from 'yazl';
import {
  ARCHIVE_MIME,
  archiveContentType,
  archiveFilename,
  zipFiles,
} from '../data-export.archive';

const EXPORT = '33333333-3333-4333-8333-333333333333';

/** Read a ZIP back with yauzl — the same library file-service extracts with. */
function unzip(buffer: Buffer): Promise<Record<string, string>> {
  return new Promise((resolve, reject) => {
    fromBuffer(buffer, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(err ?? new Error('no zipfile'));
      const out: Record<string, string> = {};
      zip.readEntry();
      zip.on('entry', (entry: Entry) => {
        zip.openReadStream(entry, (streamErr, stream) => {
          if (streamErr || !stream) return reject(streamErr ?? new Error('no stream'));
          const chunks: Buffer[] = [];
          stream.on('data', (c: Buffer) => chunks.push(c));
          stream.on('end', () => {
            out[entry.fileName] = Buffer.concat(chunks).toString('utf8');
            zip.readEntry();
          });
        });
      });
      zip.on('end', () => resolve(out));
      zip.on('error', reject);
    });
  });
}

describe('zipFiles', () => {
  it('produces an archive yauzl can read back byte-for-byte', async () => {
    const files = {
      'manifest.json': '{"schema_version":"1.0"}',
      'identity/platform.users.csv': 'user_id,display_name\nu1,Somchai\n',
    };
    expect(await unzip(await zipFiles(files))).toEqual(files);
  });

  it('keeps directory-style entry names rather than flattening them', async () => {
    // platform.users appears under BOTH identity and contact with different columns; flattening the
    // prefix would let one silently overwrite the other inside the archive.
    const out = await unzip(
      await zipFiles({
        'identity/platform.users.csv': 'display_name\nSomchai\n',
        'contact/platform.users.csv': 'email\na@b.com\n',
      }),
    );
    expect(Object.keys(out).sort()).toEqual([
      'contact/platform.users.csv',
      'identity/platform.users.csv',
    ]);
    expect(out['identity/platform.users.csv']).toContain('display_name');
    expect(out['contact/platform.users.csv']).toContain('email');
  });

  it('round-trips non-ASCII content as UTF-8', async () => {
    // Thai worker names and site notes are the normal case here, not an edge case. A default-encoded
    // buffer would hand the subject mojibake and still open cleanly.
    const files = { 'identity/platform.users.csv': 'display_name\nสมชาย ก่อสร้าง\n' };
    expect(await unzip(await zipFiles(files))).toEqual(files);
  });

  it('produces a valid empty archive when there is nothing to pack', async () => {
    expect(await unzip(await zipFiles({}))).toEqual({});
  });

  it('rejects rather than hanging when the output stream errors', async () => {
    // Without the error handler the promise never settles, and the Temporal activity holding it sits
    // until its startToClose timeout instead of failing with a reason the subject can be told.
    const boom = new Error('stream exploded');
    const proto = ZipFile.prototype as unknown as { end: () => void };
    const original = proto.end;
    proto.end = function (this: ZipFile) {
      this.outputStream.emit('error', boom);
    };

    try {
      await expect(zipFiles({ 'a.txt': 'a' })).rejects.toBe(boom);
    } finally {
      proto.end = original;
    }
  });
});

describe('archiveFilename / archiveContentType', () => {
  it('names the file after the export id, never after the person', () => {
    // A filename is the one part of an export that leaks without the file being opened — it sits in
    // a downloads folder and gets forwarded.
    expect(archiveFilename(EXPORT, 'JSON')).toBe(`cos-data-export-${EXPORT}.json`);
    expect(archiveFilename(EXPORT, 'CSV')).toBe(`cos-data-export-${EXPORT}.zip`);
  });

  it('matches the content type to the container', () => {
    expect(archiveContentType('JSON')).toBe('application/json');
    expect(archiveContentType('CSV')).toBe(ARCHIVE_MIME);
  });
});
