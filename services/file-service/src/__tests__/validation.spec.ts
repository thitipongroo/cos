import {
  validateFile,
  ALLOWED_MIME_TYPES,
  ALLOWED_EXTENSIONS,
  readMultipartBuffer,
  sizeLimitFor,
  magicByteMismatch,
  toBasename,
} from '../middleware/validation';
import { FILE_ERRORS } from '../errors';

type Multipart = import('@fastify/multipart').MultipartFile;

/** A mock multipart part whose `file` stream yields the given chunks and records destroy(). */
function mockPart(chunks: Buffer[], truncated = false): Multipart {
  const gen = (async function* () {
    for (const chunk of chunks) yield chunk;
  })();
  return { file: Object.assign(gen, { destroy: jest.fn(), truncated }) } as unknown as Multipart;
}

describe('validateFile', () => {
  it('returns BLOCKED_EXTENSION for .exe', () => {
    const result = validateFile('malware.exe', 'application/octet-stream', 100);
    expect(result).toEqual(FILE_ERRORS.BLOCKED_EXTENSION);
  });

  it('returns BLOCKED_EXTENSION for .sh', () => {
    expect(validateFile('script.sh', 'text/plain', 100)).toEqual(FILE_ERRORS.BLOCKED_EXTENSION);
  });

  it('returns BLOCKED_EXTENSION for .bat', () => {
    expect(validateFile('run.bat', 'application/x-bat', 100)).toEqual(
      FILE_ERRORS.BLOCKED_EXTENSION,
    );
  });

  it('returns BLOCKED_EXTENSION for .js', () => {
    expect(validateFile('evil.js', 'text/javascript', 100)).toEqual(FILE_ERRORS.BLOCKED_EXTENSION);
  });

  it('returns MIME_TYPE_NOT_ALLOWED for unlisted MIME (with an allowed extension)', () => {
    const result = validateFile('file.png', 'application/unknown', 100);
    expect(result).toEqual(FILE_ERRORS.MIME_TYPE_NOT_ALLOWED);
  });

  it('returns BLOCKED_EXTENSION for a file with no extension', () => {
    expect(validateFile('noext', 'image/png', 100)).toEqual(FILE_ERRORS.BLOCKED_EXTENSION);
  });

  it('returns FILE_TOO_LARGE for image exceeding 20 MB', () => {
    const result = validateFile('photo.jpg', 'image/jpeg', 21 * 1024 * 1024);
    expect(result).toEqual(FILE_ERRORS.FILE_TOO_LARGE);
  });

  it('returns FILE_TOO_LARGE for PDF exceeding 100 MB', () => {
    const result = validateFile('doc.pdf', 'application/pdf', 101 * 1024 * 1024);
    expect(result).toEqual(FILE_ERRORS.FILE_TOO_LARGE);
  });

  it('returns FILE_TOO_LARGE for CAD exceeding 200 MB', () => {
    const result = validateFile('drawing.dxf', 'application/dxf', 201 * 1024 * 1024);
    expect(result).toEqual(FILE_ERRORS.FILE_TOO_LARGE);
  });

  it('returns FILE_TOO_LARGE for video exceeding 1 GB', () => {
    const result = validateFile('clip.mp4', 'video/mp4', 1025 * 1024 * 1024);
    expect(result).toEqual(FILE_ERRORS.FILE_TOO_LARGE);
  });

  it('returns FILE_TOO_LARGE for spreadsheet exceeding default 100 MB', () => {
    const result = validateFile(
      'data.xlsx',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      101 * 1024 * 1024,
    );
    expect(result).toEqual(FILE_ERRORS.FILE_TOO_LARGE);
  });

  it('returns null for valid JPEG within size limit', () => {
    expect(validateFile('photo.jpg', 'image/jpeg', 5 * 1024 * 1024)).toBeNull();
  });

  it('returns null for valid PDF within size limit', () => {
    expect(validateFile('doc.pdf', 'application/pdf', 50 * 1024 * 1024)).toBeNull();
  });

  it('returns null for valid video within size limit', () => {
    expect(validateFile('clip.mp4', 'video/mp4', 500 * 1024 * 1024)).toBeNull();
  });

  it('returns null for valid CAD file within size limit', () => {
    expect(validateFile('plan.dwg', 'image/vnd.dwg', 100 * 1024 * 1024)).toBeNull();
  });

  it('returns null for a valid voice-note audio within size limit (G-M7)', () => {
    expect(validateFile('note.m4a', 'audio/mp4', 2 * 1024 * 1024)).toBeNull();
  });

  it('returns FILE_TOO_LARGE for audio exceeding 25 MB', () => {
    const result = validateFile('note.m4a', 'audio/mp4', 26 * 1024 * 1024);
    expect(result).toEqual(FILE_ERRORS.FILE_TOO_LARGE);
  });

  it('ALLOWED_MIME_TYPES contains all required types', () => {
    expect(ALLOWED_MIME_TYPES.has('image/jpeg')).toBe(true);
    expect(ALLOWED_MIME_TYPES.has('application/pdf')).toBe(true);
    expect(ALLOWED_MIME_TYPES.has('video/mp4')).toBe(true);
    expect(ALLOWED_MIME_TYPES.has('audio/mp4')).toBe(true);
  });

  it('ALLOWED_EXTENSIONS is a closed allowlist (permits known types, rejects executables)', () => {
    expect(ALLOWED_EXTENSIONS.has('.jpg')).toBe(true);
    expect(ALLOWED_EXTENSIONS.has('.pdf')).toBe(true);
    expect(ALLOWED_EXTENSIONS.has('.exe')).toBe(false);
    expect(ALLOWED_EXTENSIONS.has('.svg')).toBe(false);
  });
});

describe('readMultipartBuffer', () => {
  it('concatenates all chunks into a single buffer under the cap', async () => {
    const { buffer, size, truncated } = await readMultipartBuffer(
      mockPart([Buffer.from('hello '), Buffer.from('world')]),
      100,
    );
    expect(buffer.toString()).toBe('hello world');
    expect(size).toBe(11);
    expect(truncated).toBe(false);
  });

  it('handles empty file', async () => {
    const { buffer, size, truncated } = await readMultipartBuffer(mockPart([]), 100);
    expect(buffer.length).toBe(0);
    expect(size).toBe(0);
    expect(truncated).toBe(false);
  });

  it('aborts and reports truncated when the per-type cap is exceeded mid-stream', async () => {
    const part = mockPart([Buffer.alloc(10), Buffer.alloc(10)]);
    const { size, truncated } = await readMultipartBuffer(part, 15);
    expect(truncated).toBe(true);
    expect(size).toBeGreaterThan(15);
    // The stream is destroyed so the client upload is not drained into memory.
    expect((part.file as unknown as { destroy: jest.Mock }).destroy).toHaveBeenCalled();
  });

  it('reports truncated when the multipart hard cap flagged the stream', async () => {
    const { truncated } = await readMultipartBuffer(mockPart([Buffer.from('x')], true), 100);
    expect(truncated).toBe(true);
  });
});

describe('toBasename', () => {
  it('strips forward-slash and backslash path segments', () => {
    expect(toBasename('a/b/photo.jpg')).toBe('photo.jpg');
    expect(toBasename('..\\..\\evil.png')).toBe('evil.png');
  });

  it('returns the raw value when it has no path separator', () => {
    expect(toBasename('photo.jpg')).toBe('photo.jpg');
  });

  it('falls back to the raw value when the basename is empty (trailing separator)', () => {
    expect(toBasename('folder/')).toBe('folder/');
  });
});

describe('sizeLimitFor', () => {
  it('returns the per-MIME cap for a known type', () => {
    expect(sizeLimitFor('image/png')).toBe(20 * 1024 * 1024);
    expect(sizeLimitFor('video/mp4')).toBe(1024 * 1024 * 1024);
  });

  it('falls back to the 100 MB default for an unlisted type', () => {
    expect(sizeLimitFor('application/zip')).toBe(100 * 1024 * 1024);
  });
});

describe('magicByteMismatch', () => {
  it('accepts a PNG whose bytes match the declared type', () => {
    const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
    expect(magicByteMismatch(png, 'image/png')).toBe(false);
  });

  it('rejects bytes that contradict the declared image type', () => {
    const notPng = Buffer.from('<html>hi</html>');
    expect(magicByteMismatch(notPng, 'image/png')).toBe(true);
  });

  it('accepts a PDF header and a ZIP (PK) container', () => {
    expect(magicByteMismatch(Buffer.from('%PDF-1.7'), 'application/pdf')).toBe(false);
    expect(magicByteMismatch(Buffer.from([0x50, 0x4b, 0x03, 0x04]), 'application/zip')).toBe(false);
  });

  it('treats an .xlsx (ZIP container) as valid for the OOXML spreadsheet type', () => {
    const xlsx = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x14, 0x00]);
    expect(
      magicByteMismatch(xlsx, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'),
    ).toBe(false);
  });

  it('does not enforce (no false positive) for types without a validator (e.g. DXF)', () => {
    expect(magicByteMismatch(Buffer.from('  0\r\nSECTION'), 'application/dxf')).toBe(false);
  });

  it('reports mismatch when the buffer is shorter than the signature', () => {
    // startsWith length guard — a 1-byte "PNG" cannot match the 8-byte signature.
    expect(magicByteMismatch(Buffer.from([0x89]), 'image/png')).toBe(true);
  });

  it('accepts the empty-archive ZIP signature (PK\\x05\\x06)', () => {
    expect(magicByteMismatch(Buffer.from([0x50, 0x4b, 0x05, 0x06]), 'application/zip')).toBe(false);
  });

  it('validates GIF, WebP and legacy XLS signatures', () => {
    expect(magicByteMismatch(Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39]), 'image/gif')).toBe(false);
    expect(magicByteMismatch(Buffer.from('GIF-nope'), 'image/gif')).toBe(true);

    const webp = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x45, 0x42, 0x50]);
    expect(magicByteMismatch(webp, 'image/webp')).toBe(false);
    // RIFF container but not WEBP (e.g. a WAV) — the second signature check must fail.
    const riffWav = Buffer.from([0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x57, 0x41, 0x56, 0x45]);
    expect(magicByteMismatch(riffWav, 'image/webp')).toBe(true);

    const xls = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1]);
    expect(magicByteMismatch(xls, 'application/vnd.ms-excel')).toBe(false);
    expect(magicByteMismatch(Buffer.from('not-xls'), 'application/vnd.ms-excel')).toBe(true);
  });
});
