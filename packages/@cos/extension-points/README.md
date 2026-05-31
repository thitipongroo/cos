# @cos/extension-points

Extension point stubs, `StubBase` class, and security middleware for Construction OS.

## Purpose

All UNSPECIFIED or Post-MVP capabilities are implemented as extension point stubs. Every stub must extend `StubBase` and call `this.logStubCall()` on every method invocation — never a silent stub. Stubs emit a `WARN` log with `ep_id`, `phase`, and `trigger` fields so unactivated EPs are visible in Grafana.

The full EP registry is in `docs/extension-points.md` — review every sprint.

## Public API

```typescript
import { StubBase } from '@cos/extension-points';
import { CloudflareWafMiddleware } from '@cos/extension-points';
```

### `StubBase` (abstract class)

```typescript
abstract class StubBase {
  abstract readonly EP_ID: string; // e.g. 'EP-AI-001'
  abstract readonly EP_VERSION: string; // semver e.g. '0.1.0'
  abstract readonly TRIGGER: string; // condition that activates this EP
  abstract readonly PHASE: string; // e.g. 'Phase 11'

  protected logStubCall(method: string, context?: Record<string, unknown>): void;
  // Emits WARN log: { ep_id, ep_version, method, trigger, context }
}
```

### `CloudflareWafMiddleware` (NestJS middleware — Phase 16)

Validates `CF-Ray` header is present (confirms WAF traversal). Extracts real client IP from `CF-Connecting-IP` (not `X-Forwarded-For`). Logs `CF-Ray` for end-to-end tracing.

## Dependencies

- `@cos/logger` — stub calls emit WARN logs

## Configuration

No environment variables for `StubBase`. `CloudflareWafMiddleware` reads no config — it validates headers only.

## Usage

Creating a new stub:

```typescript
import { StubBase } from '@cos/extension-points';

export class CarbonCalculationEngine extends StubBase {
  readonly EP_ID = 'EP-ENV-001';
  readonly EP_VERSION = '0.1.0';
  readonly TRIGGER = 'Carbon reporting requirement from enterprise customer or regulation';
  readonly PHASE = 'Phase 6';

  async calculateProjectFootprint(
    projectId: string,
    tenantId: string,
  ): Promise<{ total_kg_co2e: number }> {
    this.logStubCall('calculateProjectFootprint', { projectId, tenantId });
    return { total_kg_co2e: 0, breakdown_by_material: {} };
  }
}
```

Registering stub in `docs/extension-points.md`:

```
| EP-ENV-001 | CarbonCalculationEngine | STUB | 0.1.0 | Phase 6 |
```

## Notes

- `EP_VERSION` increment: patch for non-breaking changes, minor for new contract, major for breaking
- Update status to `RESOLVED` in `docs/extension-points.md` when implementing a real EP
- Write contract tests for the EP's public interface when resolving from STUB → RESOLVED
- See EP naming convention: `EP-{DOMAIN}-{NUMBER}` (domains: AUTH, TENANT, FINANCE, PROC, AI, INFRA, DATA, MOBILE, DOMAIN)
