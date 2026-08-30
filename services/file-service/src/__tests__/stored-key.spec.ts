// Unit tests for buildStoredKey — master:3286, "{year}/{month}/{file_id}/{original_filename}".
//
// The key format was already asserted before this file existed, but only as SOURCE TEXT: a
// conformance test regex-matches the template literal `${year}/${month}/${fileId}/${filename}` in
// util/stored-key.ts. That pins the SHAPE and nothing else. The function reported 100% line coverage
// the whole time — it is called by the upload route and the ZIP extraction worker — yet no test ever
// looked at what it returned, because coverage records that a line ran, not that anyone checked it.
//
// What the text assertion cannot see, and these cases can:
//   · getUTCMonth() + 1  ->  getUTCMonth()      every January key lands under /00/, December /11/
//   · padStart(2, '0') removed                  "2026/8/" — keys stop sorting lexicographically
//   · getUTCFullYear()   ->  getFullYear()      the key changes with the server's timezone
// Each leaves the template identical, so the regex still matches and all 249 tests stay green.
//
// Time is frozen per case: the function reads `new Date()`, so a test that did not pin the clock
// would assert whatever month it happened to run in and pass every day except two.
import { buildStoredKey } from '../util/stored-key';

const FILE_ID = '11111111-2222-3333-4444-555555555555';

const at = (iso: string, fn: () => void): void => {
  jest.useFakeTimers().setSystemTime(new Date(iso));
  try {
    fn();
  } finally {
    jest.useRealTimers();
  }
};

describe('buildStoredKey (master:3286)', () => {
  it('lays the key out as {year}/{month}/{file_id}/{original_filename}', () => {
    at('2026-06-15T12:00:00.000Z', () => {
      expect(buildStoredKey(FILE_ID, 'site-photo.jpg')).toBe(`2026/06/${FILE_ID}/site-photo.jpg`);
    });
  });

  it('renders January as 01, not 00', () => {
    // getUTCMonth() is zero-based. This is the case that catches a dropped `+ 1`, and it is the one
    // a fixture dated mid-year cannot see.
    at('2026-01-09T00:00:00.000Z', () => {
      expect(buildStoredKey(FILE_ID, 'a.pdf')).toBe(`2026/01/${FILE_ID}/a.pdf`);
    });
  });

  it('renders December as 12, not 11', () => {
    at('2026-12-31T23:59:59.000Z', () => {
      expect(buildStoredKey(FILE_ID, 'a.pdf')).toBe(`2026/12/${FILE_ID}/a.pdf`);
    });
  });

  it('zero-pads every single-digit month, so keys sort lexicographically', () => {
    // Without the pad, "2026/9" sorts after "2026/10" in every object listing MinIO returns.
    for (let m = 1; m <= 9; m++) {
      at(`2026-0${m}-15T12:00:00.000Z`, () => {
        expect(buildStoredKey(FILE_ID, 'f.dxf')).toBe(`2026/0${m}/${FILE_ID}/f.dxf`);
      });
    }
  });

  it('reads the clock in UTC, so the key does not depend on where the service runs', () => {
    // 23:30 UTC on the 31st is already the 1st of the next month in Bangkok (UTC+7). A local-time
    // reading would file this object under the wrong month — and under a different month depending
    // on which host handled the upload, which is worse than being wrong consistently.
    at('2026-03-31T23:30:00.000Z', () => {
      expect(buildStoredKey(FILE_ID, 'x.png')).toBe(`2026/03/${FILE_ID}/x.png`);
    });
  });

  it('keeps the filename exactly as given, including spaces and dots', () => {
    // The segment is the ORIGINAL filename per master:3286. Sanitising here would silently break the
    // download name; the guards that matter (extension block, MIME allowlist) run before this point.
    at('2026-06-15T12:00:00.000Z', () => {
      expect(buildStoredKey(FILE_ID, 'Site Report v1.2 (final).pdf')).toBe(
        `2026/06/${FILE_ID}/Site Report v1.2 (final).pdf`,
      );
    });
  });

  it('places the file_id between the month and the filename', () => {
    // Two uploads of the same name in the same month must not collide. That is the whole reason the
    // id segment exists, so assert the ORDER rather than mere presence.
    at('2026-06-15T12:00:00.000Z', () => {
      const a = buildStoredKey('id-a', 'photo.jpg');
      const b = buildStoredKey('id-b', 'photo.jpg');
      expect(a).not.toBe(b);
      expect(a.split('/')).toEqual(['2026', '06', 'id-a', 'photo.jpg']);
    });
  });
});
