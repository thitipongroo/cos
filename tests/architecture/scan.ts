/**
 * Shared source-scanning helpers for the architecture invariants — §35.13 ESC-28.
 *
 * Pathspecs are DIRECTORIES, and the extension filter is applied in code. That is deliberate:
 * `git ls-files -- 'backend/src/**\/*.ts'` matches only files inside a SUBdirectory, silently
 * skipping `backend/src/main.ts` and every other top-level file. A scanner with a blind spot is
 * worse than no scanner, because it reports a clean result either way — this module exists so that
 * mistake is made once, in one place, with a test that proves the spot is covered.
 */

import { execFileSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

export const REPO_ROOT = path.resolve(__dirname, '../..');

export interface Hit {
  file: string;
  line: number;
  text: string;
}

/** Tracked files under the given directory pathspecs, filtered to the given extensions. */
export function trackedFiles(dirs: string[], extensions: string[]): string[] {
  const out = execFileSync('git', ['ls-files', '-z', '--', ...dirs], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024,
  });
  return out
    .split('\0')
    .filter(Boolean)
    .filter((f) => extensions.some((ext) => f.endsWith(ext)));
}

/** Every tracked line matching `pattern`, with the file and 1-indexed line number. */
export function grepTracked(
  pattern: RegExp,
  dirs: string[],
  extensions: string[],
  exclude: (file: string) => boolean = () => false,
): Hit[] {
  const hits: Hit[] = [];
  for (const file of trackedFiles(dirs, extensions)) {
    if (exclude(file)) continue;
    let content: string;
    try {
      content = fs.readFileSync(path.join(REPO_ROOT, file), 'utf8');
    } catch {
      continue; // removed between ls-files and read
    }
    content.split(/\r?\n/).forEach((text, i) => {
      if (pattern.test(text)) hits.push({ file, line: i + 1, text: text.trim() });
    });
    pattern.lastIndex = 0;
  }
  return hits;
}

/** Renders hits as `file:line  text`, one per line — an empty string means "no violations". */
export const report = (hits: Hit[]): string =>
  hits.map((h) => `${h.file}:${h.line}  ${h.text}`).join('\n');

/** Test code, mocks and fixtures are exempt from the production-source rules. */
export const isTest = (f: string): boolean =>
  /(^|\/)(__tests__|__mocks__|tests?)\//.test(f) || /\.(spec|test)\.[tj]sx?$/.test(f);

export const TS = ['.ts', '.tsx'];
export const PY = ['.py'];
export const SQL = ['.sql'];
