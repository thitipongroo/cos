/**
 * Shared helpers for the spec-derived suite.
 * Not a test file (testMatch only picks up *.spec.ts).
 */
import * as fs from 'fs';
import * as path from 'path';
import { parse as parseYaml } from 'yaml';

export const repoRoot = path.resolve(__dirname, '..', '..');

export const abs = (rel: string): string => path.join(repoRoot, rel);

export const exists = (rel: string): boolean => fs.existsSync(abs(rel));

export const read = (rel: string): string => fs.readFileSync(abs(rel), 'utf8');

export const readYaml = <T = unknown>(rel: string): T => parseYaml(read(rel)) as T;

export const readJson = <T = unknown>(rel: string): T => JSON.parse(read(rel)) as T;

/**
 * JSON with comments. A naive regex stripper corrupts JSON — `"@cos/shared/*"`
 * opens what looks like a block comment and `"src/*"` closes it — so this walks
 * the text and only treats `//` and comment as a comment OUTSIDE string literals.
 */
export const stripJsonComments = (raw: string): string => {
  let out = '';
  let inString = false;
  let inLine = false;
  let inBlock = false;
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i];
    const next = raw[i + 1];
    if (inLine) {
      if (ch === '\n') {
        inLine = false;
        out += ch;
      }
      continue;
    }
    if (inBlock) {
      if (ch === '*' && next === '/') {
        inBlock = false;
        i += 1;
      }
      continue;
    }
    if (inString) {
      out += ch;
      if (ch === '\\') {
        out += next ?? '';
        i += 1;
      } else if (ch === '"') {
        inString = false;
      }
      continue;
    }
    if (ch === '"') {
      inString = true;
      out += ch;
      continue;
    }
    if (ch === '/' && next === '/') {
      inLine = true;
      i += 1;
      continue;
    }
    if (ch === '/' && next === '*') {
      inBlock = true;
      i += 1;
      continue;
    }
    out += ch;
  }
  return out;
};

export const readJsonc = <T = unknown>(rel: string): T =>
  JSON.parse(stripJsonComments(read(rel))) as T;

export const listDirs = (rel: string): string[] =>
  fs
    .readdirSync(abs(rel), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name);
