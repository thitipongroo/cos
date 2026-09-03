#!/usr/bin/env node
// Prove that a skill's `description` actually routes work to it.
//
// Why it exists: CLAUDE.md says plainly that "skill and agent auto-discovery is the model reading a
// description and deciding. It is a convenience, not a guarantee, and nothing enforces it." The
// §When to invoke what table closes that for the ten commands. It does not reach the skills sitting
// under the four routing agents, and there are dozens of them — so a description that misses the
// vocabulary a real request uses, or one broad enough to outrank its neighbour, fails silently and
// nobody finds out until the wrong method was followed.
//
// This is a lexical approximation, deliberately. Stemmed TF-IDF over the descriptions cannot judge
// meaning — that is what a behavioural eval would do, and it costs tokens and is not deterministic.
// It does catch the two failure modes that actually occur:
//
//   1. false negative — a realistic prompt does not rank the owning skill in the top K
//   2. collision     — two descriptions are so alike that neither can win its own prompts
//
// A failure here is nearly always a description to fix, not a case to relax.
//
// Cases: scripts/ci/skill-routing-cases.json
// Usage: node scripts/ci/check-skill-routing.mjs [--verbose]
// Exit:  0 all declared cases pass · 1 a case or a collision failed

import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILLS = join(ROOT, '.claude', 'skills');
const CASES = join(ROOT, 'scripts', 'ci', 'skill-routing-cases.json');
const VERBOSE = process.argv.includes('--verbose');

const COLLISION_THRESHOLD = 0.82;

const STOP = new Set(
  (
    'a an and are as at be been before by can for from has have how in into is it its of on or that ' +
    'the then there these they this to use used using was what when where which while who with you your ' +
    'not do does done make made get given also any each every their them so if but one two'
  ).split(' '),
);

// Light suffix stripping. Not a real stemmer — enough to make "testing"/"tests"/"test" one token,
// which is where the collisions in this repository live.
function stem(w) {
  for (const suf of [
    'ations',
    'ation',
    'ingly',
    'ising',
    'izing',
    'ing',
    'ies',
    'ers',
    'er',
    'es',
    'ed',
    'ly',
    's',
  ]) {
    if (w.length > suf.length + 2 && w.endsWith(suf)) return w.slice(0, -suf.length);
  }
  return w;
}

function tokens(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((w) => w.length > 2 && !STOP.has(w))
    .map(stem);
}

function readFrontmatter(file) {
  const src = readFileSync(file, 'utf8');
  const m = src.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const block = m[1];
  const name = block.match(/^name:\s*(.+)$/m)?.[1]?.trim();
  // description may be a single long line; frontmatter here never wraps it
  const description = block.match(/^description:\s*(.+)$/m)?.[1]?.trim();
  if (!name || !description) return null;
  return { name, description };
}

function loadSkills() {
  const out = [];
  for (const dir of readdirSync(SKILLS, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const file = join(SKILLS, dir.name, 'SKILL.md');
    if (!existsSync(file)) continue;
    const fm = readFrontmatter(file);
    if (!fm) {
      console.error(`  parse  ${dir.name}/SKILL.md — no name/description in frontmatter`);
      continue;
    }
    if (fm.name !== dir.name) {
      console.error(
        `  parse  ${dir.name}/SKILL.md — frontmatter name "${fm.name}" != directory name`,
      );
    }
    out.push({ ...fm, tokens: tokens(fm.description) });
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

function buildIdf(skills) {
  const df = new Map();
  for (const s of skills) {
    for (const t of new Set(s.tokens)) df.set(t, (df.get(t) ?? 0) + 1);
  }
  const idf = new Map();
  const N = skills.length;
  for (const [t, n] of df) idf.set(t, Math.log((N + 1) / (n + 1)) + 1);
  return idf;
}

function vector(toks, idf) {
  const tf = new Map();
  for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
  const v = new Map();
  let norm = 0;
  for (const [t, n] of tf) {
    const w = (1 + Math.log(n)) * (idf.get(t) ?? 1);
    v.set(t, w);
    norm += w * w;
  }
  norm = Math.sqrt(norm) || 1;
  for (const [t, w] of v) v.set(t, w / norm);
  return v;
}

function cosine(a, b) {
  let sum = 0;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const [t, w] of small) {
    const o = large.get(t);
    if (o) sum += w * o;
  }
  return sum;
}

function rank(prompt, skills, idf) {
  const q = vector(tokens(prompt), idf);
  return skills
    .map((s) => ({ name: s.name, score: cosine(q, s.vec) }))
    .sort((a, b) => b.score - a.score || a.name.localeCompare(b.name));
}

// ---------------------------------------------------------------------------

console.log('==> skill routing check\n');

const skills = loadSkills();
if (skills.length === 0) {
  console.error('  no skills found under .claude/skills — nothing to check');
  process.exit(1);
}

const idf = buildIdf(skills);
for (const s of skills) s.vec = vector(s.tokens, idf);

let fail = 0;
let pass = 0;

// --- 1. description collisions ---------------------------------------------
console.log('  description collisions');
let collisions = 0;
for (let i = 0; i < skills.length; i++) {
  for (let j = i + 1; j < skills.length; j++) {
    const sim = cosine(skills[i].vec, skills[j].vec);
    if (sim >= COLLISION_THRESHOLD) {
      console.error(
        `    FAIL  ${skills[i].name} ~ ${skills[j].name}  similarity ${sim.toFixed(3)} >= ${COLLISION_THRESHOLD}`,
      );
      collisions++;
      fail++;
    }
  }
}
if (collisions === 0)
  console.log(`    PASS  no pair above ${COLLISION_THRESHOLD} across ${skills.length} skills`);
console.log('');

// --- 2. declared cases ------------------------------------------------------
if (!existsSync(CASES)) {
  console.error(
    `  ${CASES} does not exist — declare at least one case per skill you rely on routing`,
  );
  process.exit(1);
}
const cases = JSON.parse(readFileSync(CASES, 'utf8'));
const known = new Set(skills.map((s) => s.name));
const withCases = new Set();

console.log('  declared cases');
for (const c of cases.skills) {
  if (!known.has(c.skill)) {
    console.error(`    FAIL  case declared for unknown skill "${c.skill}"`);
    fail++;
    continue;
  }
  withCases.add(c.skill);

  for (const p of c.positive ?? []) {
    const k = p.top_k ?? 3;
    const ranked = rank(p.prompt, skills, idf);
    const at = ranked.findIndex((r) => r.name === c.skill);
    if (at >= 0 && at < k) {
      pass++;
      if (VERBOSE) console.log(`    PASS  ${c.skill} @${at + 1}/${k}  "${p.prompt}"`);
    } else {
      const shown = at < 0 ? 'unranked' : `@${at + 1}`;
      console.error(`    FAIL  ${c.skill} ${shown}, needed top ${k}  "${p.prompt}"`);
      console.error(
        `          top 3: ${ranked
          .slice(0, 3)
          .map((r) => `${r.name}(${r.score.toFixed(2)})`)
          .join(', ')}`,
      );
      fail++;
    }
  }

  for (const n of c.negative ?? []) {
    const ranked = rank(n.prompt, skills, idf);
    const self = ranked.findIndex((r) => r.name === c.skill);
    const owner = ranked.findIndex((r) => r.name === n.owner);
    if (!known.has(n.owner)) {
      console.error(`    FAIL  negative case names unknown owner "${n.owner}"`);
      fail++;
    } else if (owner < self || self < 0) {
      pass++;
      if (VERBOSE) console.log(`    PASS  ${n.owner} outranks ${c.skill}  "${n.prompt}"`);
    } else {
      console.error(
        `    FAIL  ${c.skill} @${self + 1} outranks owner ${n.owner} @${owner + 1}  "${n.prompt}"`,
      );
      fail++;
    }
  }
}
console.log('');

// --- 2b. index integrity ----------------------------------------------------
// A skill is reached through an index, never by browsing the directory: agent-team/CATALOG.md
// lists every one, the routing tables in .claude/agents/ dispatch to them, and
// .claude/skills/workflow-sequence/SKILL.md records the handoffs between them. A rename that
// updates the directory and not the index leaves a reader pointed at nothing — the same failure
// scripts/ci/check-claude-rules-mirror.sh exists to prevent for .claude/rules/.
console.log('  index integrity');

const CATALOG = join(ROOT, 'agent-team', 'CATALOG.md');
if (existsSync(CATALOG)) {
  const catalog = readFileSync(CATALOG, 'utf8');
  const absent = skills.map((s) => s.name).filter((n) => !catalog.includes('`' + n + '`'));
  if (absent.length === 0) {
    console.log(`    PASS  all ${skills.length} skills are named in agent-team/CATALOG.md`);
  } else {
    for (const n of absent)
      console.error(
        `    FAIL  ${n} is in .claude/skills/ but named nowhere in agent-team/CATALOG.md`,
      );
    fail += absent.length;
  }
} else {
  console.error(
    '    FAIL  agent-team/CATALOG.md is missing — the catalogue is the index of what exists',
  );
  fail++;
}

// Domain-prefixed names are distinctive enough to be checked by shape: a backticked
// `engineering-*`, `qa-*`, `doc-*` or `devops-*` token is a skill reference or a typo, nothing
// else. Cross-domain names (spec-reading, phase-index, …) have no such shape and are covered by
// the CATALOG check above instead.
const refSources = [];
for (const dir of readdirSync(SKILLS, { withFileTypes: true })) {
  if (!dir.isDirectory()) continue;
  const f = join(SKILLS, dir.name, 'SKILL.md');
  if (existsSync(f))
    refSources.push([`.claude/skills/${dir.name}/SKILL.md`, readFileSync(f, 'utf8')]);
}
const AGENTS = join(ROOT, '.claude', 'agents');
if (existsSync(AGENTS)) {
  for (const f of readdirSync(AGENTS)) {
    if (f.endsWith('.md'))
      refSources.push([`.claude/agents/${f}`, readFileSync(join(AGENTS, f), 'utf8')]);
  }
}
const knownSkills = new Set(skills.map((s) => s.name));
let dangling = 0;
for (const [where, text] of refSources) {
  for (const m of text.matchAll(/`((?:engineering|qa|doc|devops)-[a-z0-9-]+)`/g)) {
    if (!knownSkills.has(m[1])) {
      console.error(`    FAIL  ${where} names \`${m[1]}\`, which is not a skill`);
      dangling++;
      fail++;
    }
  }
}
if (dangling === 0) console.log('    PASS  every domain-prefixed skill reference resolves');

// Commands are reported, not gated. A skill may legitimately name a command this repository does
// not define — workspace-isolation describes a `/worktree` the *harness* might provide, not one of
// ours — so an unknown name here is information, not a defect.
const CMDS = join(ROOT, '.claude', 'commands');
if (existsSync(CMDS)) {
  const haveCmds = new Set(
    readdirSync(CMDS)
      .filter((f) => f.endsWith('.md'))
      .map((f) => f.slice(0, -3)),
  );
  const unknownCmds = new Set();
  for (const [, text] of refSources) {
    for (const m of text.matchAll(/`\/([a-z][a-z0-9-]*)`/g))
      if (!haveCmds.has(m[1])) unknownCmds.add(m[1]);
  }
  if (unknownCmds.size === 0)
    console.log(`    PASS  every /command reference names one of the ${haveCmds.size} commands`);
  else
    console.log(
      `    note  referenced but not a command here (not a failure): ${[...unknownCmds].map((c) => '/' + c).join(', ')}`,
    );
}
console.log('');

// --- 3. coverage (reported, not enforced) ----------------------------------
const uncovered = skills.map((s) => s.name).filter((n) => !withCases.has(n));
if (uncovered.length > 0) {
  console.log(`  no cases yet (${uncovered.length}/${skills.length}) — reported, not a failure:`);
  for (const n of uncovered) console.log(`      ${n}`);
  console.log('');
}

console.log(`  ${pass} case(s) passed · ${fail} failure(s) · ${skills.length} skill(s) indexed`);

if (fail > 0) {
  console.error('');
  console.error(
    '  A failure here is usually the description, not the case. A prompt that cannot rank',
  );
  console.error('  its own skill is a prompt the model would route somewhere else. Widen the');
  console.error(
    '  description with the words a real request uses — do not reword the prompt to fit.',
  );
  process.exit(1);
}
process.exit(0);
