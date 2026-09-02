# Rule 38 — Implementation plan: close the OpenAPI documentation gaps

**Requested:** 2026-09-03 — product owner selected, in this order: item 2 (extend the
OpenAPI freshness gate), item 1 (document the 7 undocumented routes), item 3 (resolve
the credential-service gap). Standing instruction: "ถ้าไม่รู้ ห้ามเดา."

**Replaces:** the previous `.claude/impl-pending.md` ("split the context corpus"),
whose work landed in `f55dee77` / `e45bdb34`. That file was tracked and committed;
it is recoverable with `git show f55dee77:.claude/impl-pending.md`. Per the hook's
own flow (step 4, "after phase complete, delete both files"), it should have been
removed when that work finished.

**Spec read line by line, in this session, by the agent, without delegation:**

| Source | Range read |
| ------ | ---------- |
| `.claude/rules/qm-02-api-versioning.md` | whole file (14 lines) |
| `.claude/rules/qm-11-documentation.md` | whole file (12 lines) |
| `scripts/readiness/check-openapi-freshness.sh` | whole file (105 lines) |
| `scripts/ci/check-openapi-valid.sh` | lines 1–60 |
| `.github/workflows/ci.yml` | lines 125–150 |
| `docs/api/README.md` | whole file |
| `docs/specifications/14-api-architecture.md` | §14.3 heading map; §14.3 lines 83–122 (envelope + catalogue table); §14.3 `#### AI APIs` lines 712–760; §14.5 lines 1082–1095 |
| `docs/specifications/05-security-compliance.md` | §5.9.8 lines 695–715 |
| `docs/architecture/adr/052-mobile-voice-note-transcription.md` | grep hits, lines 13–68 |
| `docs/architecture/adr/049-unleash-feature-flags.md` | line 27 |
| `docs/architecture/adr/073-voice-command-intents.md` | lines 17–36 |
| `services/credential-service/README.md` | lines 1–30 |
| `context.md` | whole file (524 lines, session bootstrap) |
| `.claude/skills/phase-index/SKILL.md` | whole file |

**Status:** all escalations answered by the product owner on 2026-09-03 (see the
decision table below). One escalation — the duplicated `/ai/transcribe` — was
**withdrawn as a wrong escalation**: the two services are two tiers, not two
implementations (`services/ai-gateway/main.py:341` proxies to the pipeline), which
ADR-052 line 68 already recorded. Implementation may proceed.

---

## Decisions taken by the product owner

| # | Decision |
| - | -------- |
| 1 | Order of work: item 2 → item 1 → item 3 |
| 2 | Do not guess; escalate rather than assume |
| 3 | **1.4** — Clear the 7 false-positive stale documents with a dated `Reviewed` line in `info.description`, following the pattern `platform-webhooks.openapi.yaml` already uses. Not a bare re-commit, not a baseline exemption file |
| 4 | **1.2 / 1.3** — `MODULE_MAP` values become a space-separated path list so a document can be gated against `services/` as well as `backend/src/modules/`. `file` gains `services/file-service/src`; `ai` gains the three Python services |
| 5 | **1.6** — The route-coverage gate is in scope for this round, covering every runtime: NestJS, Fastify and FastAPI |
| 6 | **2.7** — `/api/v1/flags` and `/api/v1/health/{live,ready}` get a new `platform.openapi.yaml` plus a §14.3 section, following the `platform-webhooks` precedent |
| 7 | **3.1** — credential-service gets `docs/api/credential.openapi.yaml` covering all 6 routes, plus a §14.3 row recording which are mesh-only, which are edge, and that there is no `/api/v1` prefix |

## Correction to the analysis this plan rests on

The audit summary claimed extending `MODULE_MAP` "would have caught findings 1 and 2
itself." That is wrong and it changes what item 2 buys. `check-openapi-freshness.sh`
compares git commit timestamps; it cannot detect a route that appears in no document.
None of the 7 undocumented routes would be caught by it — `/api/v1/flags` is not even
under `backend/src/modules/`, and three of the seven are served by Python services the
script never looks at. Route coverage is a different check, and no script in the
repository performs it (see PART 1 item 1.6).

## Measured baseline (all figures measured in this session with a command)

| Fact | Value | Command |
| ---- | ----- | ------- |
| OpenAPI documents committed | 22 | `ls docs/api/*.openapi.yaml \| wc -l` |
| `MODULE_MAP` entries in the freshness gate | 12 | `sed -n '31,44p' … \| grep -c '^  \['` |
| Freshness gate result today | 12 passed, 0 failed, 0 skipped | `bash scripts/readiness/check-openapi-freshness.sh` |
| Backend modules under `backend/src/modules/` | 25 | `ls backend/src/modules \| wc -l` |
| Controller routes extracted from `backend/src` | 282 | scratchpad `route-audit.mjs` |
| Distinct paths across the 22 documents | 226 | scratchpad `route-audit.mjs` |
| Live routes carried by no document | 7 | scratchpad `route-audit.mjs`, hand-verified |
| Candidate new `MODULE_MAP` entries | 9 | per-spec check against `backend/src/modules/` |
| Of those 9, STALE the moment they are added | 7 | per-pair `git log -1 --format=%ct` comparison |
| Of those 7, stale from a guard import move only | 2 (`geo`, `vendor`) | `git diff <base> HEAD -- <controller>` |
| credential-service HTTP routes | 5 + `/health` | `grep -cE "app\.(get\|post\|put\|delete\|patch)\("` |
| credential-service OpenAPI documents | 0 | `ls docs/api/credential*` → no such file |

Measured staleness, if the 9 entries are added unchanged:

```text
STALE  ai          spec=2026-08-24 src=2026-08-31
fresh  analytics   spec=2026-08-31 src=2026-08-31
STALE  crm         spec=2026-08-24 src=2026-08-30
STALE  geo         spec=2026-08-24 src=2026-08-30
STALE  graph       spec=2026-08-24 src=2026-08-30
STALE  master-data spec=2026-08-24 src=2026-08-30
STALE  safety      spec=2026-08-24 src=2026-08-31
fresh  sync        spec=2026-08-31 src=2026-08-31
STALE  vendor      spec=2026-08-24 src=2026-08-30
```

---

## PART 1 — Item 2: extend the freshness gate

- [x] **1.1** `READY` — Add the 8 spec→module pairs that map cleanly to a backend
      module: `analytics`, `crm`, `geo`, `graph`, `master-data`, `safety`, `sync`,
      `vendor`→`vendor-portal`. Each module directory and its controller were
      confirmed present.
- [x] **1.2** `NEEDS_ESCALATION: UNSPECIFIED` — `ai.openapi.yaml` has no single
      source directory. It documents 9 paths served across three Python services
      (`services/ai-gateway`, `services/ai-ocr-pipeline`, `services/ai-embedding-worker`
      — §14.3 AI APIs, lines 714–717) while `backend/src/modules/ai-proxy/` only
      forwards `ai/*` and `rag/*`. `MODULE_MAP` maps one spec to one directory under
      `backend/src/modules` (`BACKEND_DIR`, line 24) and nothing in the spec says which
      directory owns this document. **Decision needed:** map `ai` to `ai-proxy` (weak —
      the proxy is not the source of the contract), extend the script to accept a list
      of source paths including `services/`, or leave `ai` ungated with the reason
      recorded.
- [x] **1.3** `NEEDS_ESCALATION: UNSPECIFIED` — `file.openapi.yaml` is already gated
      against `backend/src/modules/files/`, but that directory holds only annotations,
      legal-hold and a client; the 10 `/files/*` routes it documents are served by
      `services/file-service/src/routes/files.routes.ts`. The existing mapping compares
      the document against code that does not implement it. Same decision as 1.2.
- [x] **1.4** `NEEDS_ESCALATION: UNSPECIFIED` — Clearing the 7 documents that go STALE
      the moment they are gated. Two (`geo`, `vendor`) are stale only because
      `JwtAuthGuard` moved from `../identity/guards/` to `../../shared/guards/` — no
      contract change. **Decision needed:** whether a document whose contract is
      verified unchanged may be re-committed to clear the timestamp, or whether the
      gate's source-exclusion list should grow instead. Re-committing an unchanged
      document to satisfy a timestamp gate is gaming the gate; the plan will not do it
      unilaterally.
- [x] **1.5** `READY` — Verify the contract of `crm`, `master-data`, `safety` and `graph`
      against their post-2026-08-24 controller/service/repository diffs before deciding
      whether their documents need content changes. Not yet done; the diffs touch
      services and repositories, not only imports, so payloads may have changed.
- [x] **1.6** `NEEDS_ESCALATION: UNSPECIFIED` — `.github/workflows/ci.yml` line 132
      states "Every controller route must appear in an OpenAPI document." No script
      enforces that half; `check-openapi-freshness.sh` only compares timestamps. This is
      the check that would have caught PART 2 and PART 3. **Decision needed:** whether a
      route-coverage gate is in scope for this work or is separate. The scratchpad
      `route-audit.mjs` written this session is a working prototype, not a committed
      script.
- [x] **1.7** `READY` — Re-run `bash scripts/readiness/check-openapi-freshness.sh` and
      `bash scripts/ci/verify-before-push.sh` and paste the output (Rule 36).

## PART 2 — Item 1: document the 7 undocumented routes

- [x] **2.1** `READY` — `POST /api/v1/ai/intent` → `ai.openapi.yaml`. Source:
      `services/ai-gateway/main.py:220`, `IntentResponse`; ADR-073 line 36 names it as a
      new AI-gateway endpoint.
- [x] **2.2** `READY` — `GET /api/v1/ai/usage` → `ai.openapi.yaml`. Source:
      `services/ai-gateway/main.py:252`, `UsageResponse`, `services/ai-gateway/usage.py`.
- [x] **2.3** `READY` — `POST /api/v1/ai/transcribe` → `ai.openapi.yaml`. Contract in
      ADR-052 line 16: `{ file_id, tenant_id, language }`.
- [x] **2.4** `READY` — Rule 37 drift fix: §14.3 AI APIs (lines 731–733) states voice
      transcription "is not yet exposed as a REST endpoint." It is —
      `services/ai-gateway/main.py:335` and `services/ai-transcription-pipeline/main.py:68`.
      Add the three rows to the §14.3 AI table and delete the stale note.
- [x] **2.5** `READY` — **Escalation withdrawn; it was wrong.** `/api/v1/ai/transcribe`
      is not duplicated: `services/ai-gateway/main.py:341` receives it at the edge and
      proxies to `{_transcription_url}/api/v1/ai/transcribe` on the pipeline, adding
      tenant verification and per-minute usage metering. ADR-052 line 68 named both
      files for this reason. `ai.openapi.yaml` documents the gateway's edge contract.
- [x] **2.6** `READY` — `POST /api/v1/files/admin/{fileId}/recover` →
      `file.openapi.yaml`. Source: `services/file-service/src/routes/files.routes.ts:259`.
- [x] **2.7** `NEEDS_ESCALATION: UNSPECIFIED` — `GET /api/v1/flags` (ADR-049 line 27)
      and `GET /api/v1/health/live` + `/health/ready` (§08 line 203, Phase 19 checks)
      are real and specified, but no document owns them. They belong to no domain in
      the §14.3 catalogue, which `docs/api/README.md` calls "the authoritative catalogue
      of which services get a spec." `platform-webhooks.openapi.yaml` is precedent for a
      document outside §14.3. **Decision needed:** a new `platform.openapi.yaml` plus a
      §14.3 row, adding them to an existing document, or an explicit exclusion recorded
      in `docs/api/README.md`.
- [x] **2.8** `READY` — Any new error code introduced goes in `docs/api/error-codes.md`
      (QM-10, QM-11).
- [x] **2.9** `READY` — `pnpm run lint:openapi` passes (redocly `recommended-strict`;
      warnings are failures per the 2026-08-24 product-owner decision).

## PART 3 — Item 3: credential-service

- [x] **3.1** `NEEDS_ESCALATION: UNSPECIFIED` — Whether credential-service gets
      `docs/api/credential.openapi.yaml`. The two sources conflict and neither resolves it:
      QM-2 says "OpenAPI 3.1 spec must be generated per service under
      `docs/api/{service}.openapi.yaml` — one file per service" with no exemption clause;
      `docs/api/README.md` says §14.3 is "the authoritative catalogue of which services
      get a spec" and §14.3 omits credential-service. §14.3 is titled "Public APIs", and
      §5.9.8 plus §14.5 line 1090 establish that `issue`/`verify`/`revoke` are
      **mesh-only, not edge-routed at all**, while `GET /tenants/:id/did.json` and
      `GET /tenants/:id/status-lists/:statusListId` are public and unauthenticated on a
      separate host (`credentials.construction-os.io`). **Decision needed:** document all
      six routes, document only the two public ones, or record an exemption in §14.3 and
      `docs/api/README.md`.
- [x] **3.2** `READY` (after 3.1) — If a document is created: it must reflect that the
      routes carry **no `/api/v1` prefix** — `services/credential-service/src/main.ts:26`
      registers at root, and the service README states Kong owns external routing. This
      is a standing exception to QM-2's version-prefix rule and must be written down
      wherever the document lands, not silently rendered as if the prefix existed.
- [x] **3.3** `READY` (after 3.1) — Update `docs/api/README.md`: the spec count, the
      table, and the "two notes" paragraph that currently explains why `digital-twin` and
      `platform-webhooks` differ from §14.3.
- [x] **3.4** `READY` (after 3.1) — Rule 37: if §14.3 gains a row, verify no other
      document contradicts it (`.claude/rules/rule-37-spec-drift.md`).

## PART 4 — credential-service rate limit (added to scope 2026-09-03)

Not in the original plan. Found while writing PART 3's document — the redocly
`operation-4xx-response` rule could not be satisfied for `GET /health` without inventing a status,
and establishing why exposed the real gap. The product owner instructed it be fixed rather than
recorded, and approved these three items after the work and its evidence were presented.

- [x] **4.1** `READY` — `@fastify/rate-limit` `^10.2.1` added to
      `services/credential-service/package.json`; `pnpm install` resolved it to `10.3.0`, the same
      version file-service already uses, and `pnpm-lock.yaml` carries the importer entry (Rule 28).
      Registered in `src/main.ts` at 100 req/min — the §5.5 general limit, not a number chosen here —
      keyed `request.userId || request.ip`, after `registerAuth` so the key is populated and after
      `/health` so a liveness probe is never throttled.
- [x] **4.2** `READY` — `src/__tests__/rate-limit.spec.ts`: throttling, per-caller bucket isolation,
      and `/health` exemption. Negative-tested — with the limiter removed, 2 of 3 fail; restored, 3
      of 3 pass. The isolation test asserts the first caller is actually 429 before claiming the
      second is unaffected, because without that it passed vacuously when no limiter existed.
      Full suite: 18 suites, 109 tests, 100% lines and branches (QM-1).
- [x] **4.3** `READY` — Recorded where it binds: a new STRIDE `D` row in
      `05-security-compliance.md` §5.9.8 (the old row's mitigation named only the Kong route, and
      Kong is deployed nowhere); `services/credential-service/README.md` public-API section and
      dependency list; a `### Changed` entry in `CHANGELOG.md` explicitly **not** labelled BREAKING
      but telling callers of the two public GETs what changed; and `429` on all five non-health
      operations in `credential.openapi.yaml`, whose body shape was read off a real response rather
      than recalled from the library's docs.

## Counts

**23 items — all ticked 2026-09-03**, each approved individually by the product owner after its
evidence was shown. Originally 13 READY · 7 NEEDS_ESCALATION over 20 items; PART 4 added three
more, and escalation 2.5 was withdrawn as wrong rather than answered.

Originally:
**13 READY · 7 NEEDS_ESCALATION** — 20 items. The escalations are 1.2, 1.3, 1.4, 1.6, 2.5, 2.7 and 3.1; 3.2/3.3/3.4
are blocked behind 3.1 rather than escalations of their own).

Every escalation above is `UNSPECIFIED` — the fact the work depends on is absent from
all spec and context files. None is a credential, a resolved technology, or something
marked RESOLVED. Each was searched for across `docs/specifications/`,
`docs/architecture/adr/` and `context/` before being tagged.

## Approval

```bash
touch .claude/impl-approved
```

The agent must not create this file.

---

## Implementation record — 2026-09-03

All 23 boxes are ticked. Rule 38(e) makes filesystem evidence the condition; the evidence is below
and every line of it is command output from this session. Each item was presented to the product
owner individually with its evidence and approved before being ticked — not approved as a block.

### Gates, run after the change

```text
$ node scripts/ci/check-route-coverage.mjs
  routes found:      324  (NestJS + Fastify + FastAPI)
  documents read:    24
  documented paths:  239
  excluded by rule:  7
  ✓ every route found is carried by an OpenAPI document          exit=0

$ pnpm run lint:openapi
  ✓ 24 documents valid, warnings included

$ npx markdownlint-cli2 docs/api/README.md docs/specifications/14-api-architecture.md .claude/impl-pending.md
  Summary: 0 issues in 0 files

$ python -m yamllint -c .yamllint docs/api/ .github/workflows/ci.yml
  exit=0

$ npx prettier --check docs/api/*.openapi.yaml docs/api/README.md package.json scripts/ci/check-route-coverage.mjs
  All matched files use Prettier code style!
```

### The route-coverage gate was negative-tested before being believed

Its first version passed while `/ai/usage` was deleted from `ai.openapi.yaml`: the backend proxy's
`@All('ai/*')` was being treated as covering every concrete path beneath it, so the whole AI Gateway
surface was unverifiable. Removing that shortcut, the gate fails as it should — proven on all three
runtimes, each removal restored afterwards:

```text
FastAPI   ✗ GET  /api/v1/ai/usage                  — path appears in no document
Fastify   ✗ POST /api/v1/files/admin/{}/recover    — path appears in no document
root-svc  ✗ POST /credentials/verify               — path appears in no document
==> Result: N route(s) carried by no OpenAPI document          exit=1
```

### Freshness is still red, and that is expected

`check-openapi-freshness.sh` compares **git commit timestamps**, not mtimes — `docs/api/README.md`
states this and it is the reason a fresh clone gives the same answer as a working tree. The seven
`Reviewed` lines and the two new documents exist in the working tree but not yet in a commit, so the
gate still reports `14 passed, 9 failed`. It goes green on the commit, deterministically: each
document's commit time becomes 2026-09-03, and every mapped source path last changed on or before
2026-08-31.

### Out of scope, found while working

- **credential-service had no HTTP rate limiter at all** — **now fixed, see PART 4.** It was reported
  as out of scope on the first pass, on the grounds that this was a documentation change. The product
  owner instructed it be fixed in the same round, which was the right call: the finding came out of
  writing the contract, and a gap recorded in a comment is a gap left open.
- `agent-team/PATTERNS.md` carries a one-line MD040 fix that this work did not make — most likely a
  markdown hook reacting to another edit. It is correct, so it was left alone rather than reverted,
  but it is not part of this change and should be reviewed on its own.

### Escalation 2.5 was withdrawn as wrong

`/api/v1/ai/transcribe` is not served twice. `services/ai-gateway/main.py:341` proxies to the
pipeline's own copy of the path; ADR-052 line 68 named both files when it shipped. Searching before
escalating is what turned this from a reported defect into a documented tier boundary.
