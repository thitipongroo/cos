# ADR-042: NestJS 11 + Fastify 5 upgrade

**Date:** 2026-07-01
**Status:** Accepted
**Deciders:** Product owner / engineering lead
**Tags:** infra, architecture

---

## Context

The backend + file-service were pinned to NestJS 10 with Fastify 4. `pnpm-workspace.yaml` documented
this as an intentional lock: `@nestjs/platform-fastify@10` requires Fastify 4, and several
CVE-ignores in `auditConfig` are held open by that pin ("needs NestJS 11 upgrade"). file-service
imports `fastify` directly, so a single Fastify version must satisfy both it and
`@nestjs/platform-fastify` (the `fastify: 4.29.1` override).

NestJS 11's `@nestjs/platform-fastify` requires Fastify 5. Upgrading the framework forces a
coordinated bump of the whole NestJS package set, Fastify 4->5, the `@fastify/*` plugins, and the
file-service Fastify code that uses the v4 plugin/hook API. Node >= 20 is required (platform runs 24).

## Decision

Upgrade to NestJS 11 and Fastify 5 together: all `@nestjs/*` -> 11 (core, common, platform-fastify,
platform-express, testing, cli, schematics) plus peer-versioned ones (config 3->4, jwt 10->11,
passport 10->11, terminus 10->11, swagger 7->11, throttler 5->6, cache-manager 2->3, schedule 4->6,
event-emitter 2->3); `fastify` 4->5 in backend + file-service with a single v5 override; `@fastify/*`
plugins (cors, helmet, multipart, swagger, swagger-ui) to their Fastify-5 majors; adapt
file-service's direct Fastify usage to the v5 API; clear the now-unblocked CVE-ignores.

Verified against existing gates: build, backend unit + workflow + integration (100% coverage),
file-service suite, Docker Compose health.

## Rationale

The Fastify-4 lock exists only because of NestJS 10; NestJS 11 is the supported way off it and
reopens the held CVE fixes. The whole set must move at once — NestJS packages are peer-locked to the
same major and platform-fastify 11 hard-requires Fastify 5. Alternative rejected: staying on NestJS
10 leaves the framework a major behind with CVE-ignores permanently open.

## Consequences

### Positive

- Framework current; CVE-ignores tied to Fastify 4 / NestJS 10 removed.

### Negative

- Large coordinated change across backend + file-service HTTP layers; Fastify 5 + plugin API changes
  touch every file-service plugin/route.

### Neutral

- No change to business logic, Prisma (see ADR-041), RLS, or the tenant model — only the HTTP
  framework layer moves.

## References

- `pnpm-workspace.yaml` `auditConfig`; QM-4 (dependency scan); Fastify v4->v5 + NestJS v11 migrations
