import { ZipFile } from 'yazl';
import { ZipExtractionService, ZipBombError, inferMime } from '../services/zip-extraction.service';
import type { FileServiceConfig } from '../config';

// ── helpers ──────────────────────────────────────────────────────────────────

type ZipInput = { name: string; content: Buffer; compress?: boolean } | { dir: string };

function buildZip(inputs: ZipInput[]): Promise<Buffer> {
  const zf = new ZipFile();
  for (const i of inputs) {
    if ('dir' in i) zf.addEmptyDirectory(i.dir);
    else zf.addBuffer(i.content, i.name, { compress: i.compress ?? true });
  }
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    zf.outputStream.on('data', (c: Buffer) => chunks.push(c));
    zf.outputStream.on('end', () => resolve(Buffer.concat(chunks)));
    zf.outputStream.on('error', reject);
    zf.end();
  });
}

function cfg(overrides?: Partial<FileServiceConfig['zipExtraction']>): FileServiceConfig {
  return {
    zipExtraction: {
      maxRatio: 1_000_000_000,
      maxEntries: 1000,
      maxTotalBytes: 1024 * 1024 * 1024,
      ...overrides,
    },
  } as FileServiceConfig;
}

// ── pure helpers ─────────────────────────────────────────────────────────────

describe('inferMime', () => {
  it('maps known extensions (case-insensitive)', () => {
    expect(inferMime('a.jpg')).toBe('image/jpeg');
    expect(inferMime('B.PDF')).toBe('application/pdf');
    expect(inferMime('plan.dwg')).toBe('image/vnd.dwg');
  });
  it('returns null for unknown extension', () => {
    expect(inferMime('notes.txt')).toBeNull();
  });
  it('returns null when there is no dot', () => {
    expect(inferMime('README')).toBeNull();
  });
});

// ── extraction ───────────────────────────────────────────────────────────────

describe('ZipExtractionService.extract', () => {
  it('extracts valid entries with inferred MIME (incl. safe subdirectory basename)', async () => {
    const svc = new ZipExtractionService(cfg());
    const zip = await buildZip([
      { name: 'photos/a.jpg', content: Buffer.from('jpeg-bytes') },
      { name: 'doc.pdf', content: Buffer.from('pdf-bytes') },
    ]);
    const entries = await svc.extract(zip);
    expect(entries).toHaveLength(2);
    expect(entries).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ filename: 'a.jpg', mimeType: 'image/jpeg' }),
        expect.objectContaining({ filename: 'doc.pdf', mimeType: 'application/pdf' }),
      ]),
    );
  });

  it('includes a zero-byte entry (compressedSize === 0 ratio branch)', async () => {
    const svc = new ZipExtractionService(cfg());
    const zip = await buildZip([{ name: 'empty.jpg', content: Buffer.alloc(0), compress: false }]);
    const entries = await svc.extract(zip);
    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({ filename: 'empty.jpg', mimeType: 'image/jpeg' });
  });

  it('skips directories, unknown types, and no-extension entries', async () => {
    const svc = new ZipExtractionService(cfg());
    const zip = await buildZip([
      { dir: 'sub/' },
      { name: 'notes.txt', content: Buffer.from('x') },
      { name: 'README', content: Buffer.from('x') },
      { name: 'keep.png', content: Buffer.from('png') },
    ]);
    const entries = await svc.extract(zip);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.filename).toBe('keep.png');
  });

  it('rejects an archive containing a path-traversal entry (yauzl guard)', async () => {
    // yazl validates metadata paths, so build with a safe same-length placeholder then byte-patch
    // the filename to "../evil.jpg" (filenames are not part of the CRC/size fields). yauzl rejects
    // the '..' entry on read → the whole archive is rejected (defense-in-depth).
    const svc = new ZipExtractionService(cfg());
    const built = await buildZip([{ name: 'up/evil.jpg', content: Buffer.from('x') }]);
    const zip = Buffer.from(
      built.toString('latin1').replaceAll('up/evil.jpg', '../evil.jpg'),
      'latin1',
    );
    await expect(svc.extract(zip)).rejects.toThrow(/relative path|\.\./);
  });

  it('skips an entry that fails size validation (oversized image)', async () => {
    const svc = new ZipExtractionService(cfg());
    const oversized = Buffer.alloc(20 * 1024 * 1024 + 1); // > 20 MB image limit
    const zip = await buildZip([
      { name: 'big.jpg', content: oversized },
      { name: 'ok.png', content: Buffer.from('png') },
    ]);
    const entries = await svc.extract(zip);
    expect(entries).toHaveLength(1);
    expect(entries[0]?.filename).toBe('ok.png');
  });

  it('rejects a zip bomb when an entry exceeds the decompression ratio', async () => {
    const svc = new ZipExtractionService(cfg({ maxRatio: 2 }));
    const zip = await buildZip([{ name: 'bomb.jpg', content: Buffer.alloc(4096, 0) }]);
    await expect(svc.extract(zip)).rejects.toThrow(ZipBombError);
    await expect(svc.extract(zip)).rejects.toMatchObject({ code: 'COS-FILE-013' });
  });

  it('rejects an archive with too many entries', async () => {
    const svc = new ZipExtractionService(cfg({ maxEntries: 1 }));
    const zip = await buildZip([
      { name: 'a.jpg', content: Buffer.from('a') },
      { name: 'b.jpg', content: Buffer.from('b') },
    ]);
    await expect(svc.extract(zip)).rejects.toMatchObject({ code: 'COS-FILE-012' });
  });

  it('rejects when cumulative uncompressed size exceeds the cap', async () => {
    const svc = new ZipExtractionService(cfg({ maxTotalBytes: 4 }));
    const zip = await buildZip([{ name: 'a.jpg', content: Buffer.from('more-than-four-bytes') }]);
    await expect(svc.extract(zip)).rejects.toMatchObject({ code: 'COS-FILE-013' });
  });

  it('rejects an invalid (non-zip) buffer', async () => {
    const svc = new ZipExtractionService(cfg());
    await expect(svc.extract(Buffer.from('this is definitely not a zip'))).rejects.toBeInstanceOf(
      Error,
    );
  });
});
