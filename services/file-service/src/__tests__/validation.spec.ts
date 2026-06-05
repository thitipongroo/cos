import {
  validateFile,
  ALLOWED_MIME_TYPES,
  BLOCKED_EXTENSIONS,
  readMultipartBuffer,
} from '../middleware/validation';
import { FILE_ERRORS } from '../errors';

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

  it('returns MIME_TYPE_NOT_ALLOWED for unlisted MIME', () => {
    const result = validateFile('file.xyz', 'application/unknown', 100);
    expect(result).toEqual(FILE_ERRORS.MIME_TYPE_NOT_ALLOWED);
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

  it('ALLOWED_MIME_TYPES contains all required types', () => {
    expect(ALLOWED_MIME_TYPES.has('image/jpeg')).toBe(true);
    expect(ALLOWED_MIME_TYPES.has('application/pdf')).toBe(true);
    expect(ALLOWED_MIME_TYPES.has('video/mp4')).toBe(true);
  });

  it('BLOCKED_EXTENSIONS contains all blocked types', () => {
    expect(BLOCKED_EXTENSIONS.has('.exe')).toBe(true);
    expect(BLOCKED_EXTENSIONS.has('.sh')).toBe(true);
  });
});

describe('readMultipartBuffer', () => {
  it('concatenates all chunks into a single buffer', async () => {
    const chunks = [Buffer.from('hello '), Buffer.from('world')];
    const mockPart = {
      file: (async function* () {
        for (const chunk of chunks) yield chunk;
      })(),
    } as unknown as import('@fastify/multipart').MultipartFile;

    const { buffer, size } = await readMultipartBuffer(mockPart);
    expect(buffer.toString()).toBe('hello world');
    expect(size).toBe(11);
  });

  it('handles empty file', async () => {
    const mockPart = {
      file: (async function* () {})(),
    } as unknown as import('@fastify/multipart').MultipartFile;

    const { buffer, size } = await readMultipartBuffer(mockPart);
    expect(buffer.length).toBe(0);
    expect(size).toBe(0);
  });
});
