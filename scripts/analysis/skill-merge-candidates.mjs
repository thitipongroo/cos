#!/usr/bin/env node
// Which two skills are close enough that keeping both costs more than merging them?
//
// Five independent signals, reported side by side and never blended into one score. A blended
// number hides the case that matters most — the pair where two signals say "merge" and one says
// "these answer to different mandates". That disagreement IS the finding.
//
//   S1 trigger    cosine over `description`  — do the same words bring you here?
//   S2 method     cosine over the body       — is the procedure the same once you arrive?
//   S3 tools      allowed-tools set equality — can they share one permission set at all?
//   S4 mandate    Jaccard over QM-n / Rule-n cited in the body — same governance?
//   S5 nearest    is each the other's nearest neighbour by description? (routing competition)
//
// Both cosines are reported as a ratio to the mean over all pairs, because the absolute numbers
// are small by construction: 45 deliberately distinct descriptions over one vocabulary.
//
// LIMITATION, stated because it decides how far this can be trusted: every signal here is lexical.
// It measures shared words, not shared meaning. Two skills that do the same thing in different
// vocabulary score low; two that share jargon but not purpose score high. Treat a high score as
// "read these two files side by side", never as "merge them".
//
// Usage: node scripts/analysis/skill-merge-candidates.mjs [--all]
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILLS = join(ROOT, '.claude', 'skills');
const ALL = process.argv.includes('--all');

const STOP = new Set(
  ('a an and are as at be been before by can for from has have how in into is it its of on or that the then there ' +
   'these they this to use used using was what when where which while who with you your not do does done make made ' +
   'get given also any each every their them so if but one two')
    .split(' '),
);
const stem = (w) => {
  for (const s of ['ations','ation','ingly','ising','izing','ing','ies','ers','er','es','ed','ly','s'])
    if (w.length > s.length + 2 && w.endsWith(s)) return w.slice(0, -s.length);
  return w;
};
const tok = (t) =>
  t.toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/[\s-]+/)
    .filter((w) => w.length > 2 && !STOP.has(w)).map(stem);

const skills = [];
for (const d of readdirSync(SKILLS, { withFileTypes: true })) {
  if (!d.isDirectory()) continue;
  const f = join(SKILLS, d.name, 'SKILL.md');
  if (!existsSync(f)) continue;
  const src = readFileSync(f, 'utf8');
  const fm = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!fm) continue;
  const desc = fm[1].match(/^description:\s*(.+)$/m)?.[1] ?? '';
  const body = src.slice(fm[0].length);
  const tools = new Set((fm[1].match(/^\s*-\s*"?([A-Za-z]+)"?\s*$/gm) ?? [])
    .map((l) => l.replace(/[^A-Za-z]/g, '')).filter(Boolean));
  const gov = new Set([...body.matchAll(/\b(QM-\d+|Rule\s+\d+)\b/g)].map((m) => m[1].replace(/\s+/, ' ')));
  skills.push({ name: d.name, desc, dt: tok(desc), bt: tok(body), tools, gov });
}
skills.sort((a, b) => a.name.localeCompare(b.name));

function space(field) {
  const df = new Map();
  for (const s of skills) for (const t of new Set(s[field])) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = new Map();
  for (const [t, n] of df) idf.set(t, Math.log((skills.length + 1) / (n + 1)) + 1);
  const vec = (ts) => {
    const tf = new Map();
    for (const t of ts) tf.set(t, (tf.get(t) ?? 0) + 1);
    const v = new Map(); let n = 0;
    for (const [t, c] of tf) { const w = (1 + Math.log(c)) * (idf.get(t) ?? 1); v.set(t, w); n += w * w; }
    n = Math.sqrt(n) || 1;
    for (const [t, w] of v) v.set(t, w / n);
    return v;
  };
  return new Map(skills.map((s) => [s.name, vec(s[field])]));
}
const cos = (a, b) => { let s = 0; const [x, y] = a.size < b.size ? [a, b] : [b, a];
  for (const [t, w] of x) { const o = y.get(t); if (o) s += w * o; } return s; };
const jac = (a, b) => (a.size === 0 && b.size === 0) ? null
  : [...a].filter((x) => b.has(x)).length / new Set([...a, ...b]).size;
const eq = (a, b) => a.size === b.size && [...a].every((x) => b.has(x));

const D = space('dt'), B = space('bt');

const pairs = [];
for (let i = 0; i < skills.length; i++)
  for (let j = i + 1; j < skills.length; j++) {
    const a = skills[i], b = skills[j];
    pairs.push({ a: a.name, b: b.name,
      d: cos(D.get(a.name), D.get(b.name)),
      m: cos(B.get(a.name), B.get(b.name)),
      tools: eq(a.tools, b.tools),
      toolDiff: [...new Set([...a.tools, ...b.tools])].filter((t) => a.tools.has(t) !== b.tools.has(t)),
      gov: jac(a.gov, b.gov) });
  }
const meanD = pairs.reduce((s, p) => s + p.d, 0) / pairs.length;
const meanM = pairs.reduce((s, p) => s + p.m, 0) / pairs.length;

// S5 — nearest neighbour by description
const nearest = new Map();
for (const s of skills) {
  let best = null, bs = -1;
  for (const o of skills) { if (o.name === s.name) continue;
    const v = cos(D.get(s.name), D.get(o.name)); if (v > bs) { bs = v; best = o.name; } }
  nearest.set(s.name, best);
}
for (const p of pairs) p.mutual = nearest.get(p.a) === p.b && nearest.get(p.b) === p.a;

for (const p of pairs) { p.dr = p.d / meanD; p.mr = p.m / meanM; }
pairs.sort((x, y) => (y.mutual - x.mutual) || (y.dr + y.mr) - (x.dr + x.mr));

console.log(`skill merge candidates — ${skills.length} skills, ${pairs.length} pairs`);
console.log(`baselines: mean description similarity ${meanD.toFixed(4)} · mean body similarity ${meanM.toFixed(4)}`);
console.log('ratios below are multiples of those baselines\n');

const fmt = (p) =>
  `  ${p.d.toFixed(3)} (${p.dr.toFixed(1).padStart(4)}x)` +
  `  ${p.m.toFixed(3)} (${p.mr.toFixed(1).padStart(4)}x)` +
  `  ${p.tools ? '  same ' : 'DIFFER'}` +
  `  ${p.gov === null ? '  —  ' : p.gov.toFixed(2).padStart(5)}   ${p.a} + ${p.b}`;
const hdr = '   S1 trigger      S2 method      S3 tools  S4 mand   pair';

// A. mutual nearest neighbours — each is the other's closest by description.
const mutual = pairs.filter((p) => p.mutual);
console.log(`A. MUTUAL NEAREST — ${mutual.length} pairs. Each is the other's closest by description.`);
console.log(hdr);
for (const p of mutual) {
  console.log(fmt(p));
  if (!p.tools) console.log(`${' '.repeat(54)}tools differ by: ${p.toolDiff.join(', ')}`);
}

// B. highest method overlap — same procedure, whatever the trigger words say.
console.log(`\nB. HIGHEST METHOD OVERLAP — top 10 by S2, the signal that survives a reworded description.`);
console.log(hdr);
for (const p of [...pairs].sort((x, y) => y.m - x.m).slice(0, 10)) {
  console.log(fmt(p) + (p.mutual ? '   [also mutual]' : ''));
  if (!p.tools) console.log(`${' '.repeat(54)}tools differ by: ${p.toolDiff.join(', ')}`);
}

// C. every skill's nearest neighbour — the map behind A.
console.log('\nC. NEAREST NEIGHBOUR OF EVERY SKILL (by description)');
const back = new Map();
for (const [k, v] of nearest) back.set(k, v);
for (const s of skills) {
  const n = back.get(s.name);
  const pr = pairs.find((p) => (p.a === s.name && p.b === n) || (p.b === s.name && p.a === n));
  const arrow = back.get(n) === s.name ? '<->' : ' ->';
  console.log(`  ${s.name.padEnd(32)} ${arrow} ${n.padEnd(32)} ${pr.d.toFixed(3)} (${pr.dr.toFixed(1)}x)`);
}
console.log('\n  <-> mutual · -> one-way (its nearest has a nearer neighbour of its own)');
console.log('\n  S3 DIFFER is a blocker, not a penalty: merging two skills with different allowed-tools');
console.log('  grants the union to both. Check what the stricter one was protecting before merging.');
console.log('  S4 is the share of QM/Rule citations the two bodies have in common; "—" means neither cites any.');
