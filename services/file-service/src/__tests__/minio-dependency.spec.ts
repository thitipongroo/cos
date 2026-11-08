/**
 * The REAL minio, not a mock: every other spec mocks it, so none of them would notice if Jest
 * could no longer load minio's dependency tree.
 *
 * pnpm-workspace.yaml overrides decode-uri-component to 0.5.1 (GHSA-qr28-fpjm-wq7f), which is
 * ESM-only, under query-string@7.1.3 — a CommonJS package that `require`s it. jest.config.js
 * transforms that one file; without it this spec fails with "Unexpected token 'export'".
 *
 * Under the override query-string's stringify works and its decoding functions (parse, parseUrl,
 * stringifyUrl, pick, exclude) throw under Node 24
 * (docs/registers/dependency-advisories-2026-11.md, branch 1c). minio calls stringify only. The
 * last test reads minio's published code and fails if any file calls anything else on
 * query-string, so a minio upgrade that starts decoding shows up here, with this explanation,
 * rather than in production.
 */
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import * as Minio from 'minio';

// Offline: an explicit region stops presignedGetObject asking the server for the bucket's region,
// and presigning is pure computation from there. Port 9 is the discard port; nothing is sent.
const client = new Minio.Client({
  endPoint: 'localhost',
  port: 9,
  useSSL: false,
  accessKey: 'k',
  secretKey: 's',
  region: 'us-east-1',
});

// minio's package root, and its own copy of query-string — not whatever a bare
// `require('query-string')` would resolve to from here.
const minioRoot = dirname(require.resolve('minio/package.json'));
const queryStringPath = require.resolve('query-string', { paths: [minioRoot] });

function publishedCode(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return publishedCode(path);
    return /\.(c|m)?js$/.test(entry.name) ? [path] : [];
  });
}

describe('minio with decode-uri-component 0.5.1', () => {
  it('presigns a GET URL, query parameters encoded by query-string.stringify', async () => {
    const url = new URL(
      await client.presignedGetObject('cos-tenant', 'ใบ งาน.pdf', 60, {
        'response-content-disposition': 'attachment; filename="ใบ งาน.pdf"',
      }),
    );

    expect(url.pathname).toBe('/cos-tenant/%E0%B9%83%E0%B8%9A%20%E0%B8%87%E0%B8%B2%E0%B8%99.pdf');
    expect(url.searchParams.get('response-content-disposition')).toBe(
      'attachment; filename="ใบ งาน.pdf"',
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('60');
    expect(url.searchParams.get('X-Amz-Signature')).toMatch(/^[0-9a-f]{64}$/);
  });

  it("query-string's stringify works and parse throws: the cost of the override", () => {
    // Typed by hand: file-service does not depend on query-string, so its types are not resolvable.
    const qs = jest.requireActual<{
      stringify(object: Record<string, string>): string;
      parse(query: string): unknown;
    }>(queryStringPath);

    expect(qs.stringify({ a: 'ก ข' })).toBe('a=%E0%B8%81%20%E0%B8%82');
    expect(() => qs.parse('a=1')).toThrow('decodeComponent is not a function');
  });

  it('minio calls nothing on query-string but stringify', () => {
    // Each file binds query-string to a name — `var qs = …require("query-string")` in
    // dist/main, `import * as qs from 'query-string'` in dist/esm — and every use of that name
    // must be `.stringify`. Every mention of 'query-string' in a file must be such a binding, so
    // a second binding, a named import, a dynamic import() or a bare require(…).parse fails, and
    // a change in minio's build cannot make this pass by matching nothing. It also fails on a
    // harmless one, such as the bound name appearing in a comment: read the code, then adjust.
    // The name must sit right before `= require(…)` or `= wrapper(require(…))`, so on
    // `var a = 1, qs = require(…)` it is `qs` that is captured, not `a`.
    const cjs = /(?:var|let|const|,|;)\s*(\w+)\s*=\s*(?:[\w$.]+\()?require\("query-string"\)/
      .source;
    const esm = /import\s+\*\s+as\s+(\w+)\s+from\s+'query-string'/.source;
    const binding = new RegExp(`${cjs}|${esm}`, 'g');
    const uses: string[] = [];

    const files = publishedCode(join(minioRoot, 'dist')).filter((file) =>
      readFileSync(file, 'utf8').includes('query-string'),
    );
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const source = readFileSync(file, 'utf8');
      const names = [...source.matchAll(binding)].map((match) => match[1] ?? match[2]);
      const mentions = source.split('query-string').length - 1;
      expect({ file, mentions }).toEqual({ file, mentions: names.length });

      for (const name of names) {
        for (const use of source.matchAll(new RegExp(`\\b${name}\\.(\\w+)`, 'g'))) {
          uses.push(use[1]!);
        }
        // Any other mention of the bound name (passed along, indexed) is not a plain call.
        const bare = source.match(new RegExp(`\\b${name}\\b(?!\\.\\w)`, 'g')) ?? [];
        expect({ file, name, otherUses: bare.length }).toEqual({ file, name, otherUses: 1 });
      }
    }

    expect(uses.length).toBeGreaterThan(0);
    expect(new Set(uses)).toEqual(new Set(['stringify']));
  });
});
