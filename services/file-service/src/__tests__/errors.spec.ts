import { buildError, FILE_ERRORS } from '../errors';

describe('buildError', () => {
  it('returns structured COS error for a known key', () => {
    const result = buildError('FILE_NOT_FOUND', 'trace-123');
    expect(result.error.code).toBe('COS-FILE-005');
    expect(result.error.message).toBe('File not found');
    expect(result.error.traceId).toBe('trace-123');
    expect(typeof result.error.timestamp).toBe('string');
  });

  it('covers all FILE_ERRORS keys', () => {
    for (const key of Object.keys(FILE_ERRORS) as (keyof typeof FILE_ERRORS)[]) {
      const result = buildError(key, 'trace-abc');
      expect(result.error.code).toMatch(/^COS-FILE-\d{3}$/);
      expect(result.error.traceId).toBe('trace-abc');
    }
  });
});
