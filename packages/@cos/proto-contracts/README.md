# @cos/proto-contracts

gRPC proto files and generated TypeScript/Python stubs for cross-deployable READ/query path communication.

## Purpose

Defines `protobuf` contracts for gRPC communication from the main NestJS application to Go workers on the READ/query path only. Write/ingestion paths use Kafka events. Generated stubs live in `src/generated/` (gitignored — regenerated from `.proto` files in CI).

**Current scope:** base setup. Concrete proto definitions added as Go workers (KG ingestion worker, Analytics worker) expose gRPC query APIs in Phases 13–14.

## Public API

Proto generation output (after `pnpm proto-gen`):

```typescript
import { KnowledgeGraphServiceClient } from '@cos/proto-contracts/generated';
import { AnalyticsQueryClient } from '@cos/proto-contracts/generated';
```

Source `.proto` files live in `src/protos/`:

```
src/protos/knowledge_graph.proto   — KG query service (Phase 13)
src/protos/analytics.proto         — Analytics query service (Phase 14)
```

## Dependencies

- `@bufbuild/protobuf` — protobuf runtime
- `@connectrpc/connect` — Connect protocol (gRPC-compatible)
- `buf` CLI — proto generation (install separately: `brew install bufbuild/buf/buf`)

## Configuration

`buf.gen.yaml` — controls TypeScript + Python generation targets.

| Variable                     | Description                                               |
| ---------------------------- | --------------------------------------------------------- |
| `KG_WORKER_GRPC_ADDR`        | KG ingestion worker gRPC address (e.g. `kg-worker:50051`) |
| `ANALYTICS_WORKER_GRPC_ADDR` | Analytics worker gRPC address                             |

## Usage

```bash
# Regenerate stubs after changing a .proto file
pnpm proto-gen
# or
make proto-gen
```

```typescript
// Use generated client in NestJS service
import { KnowledgeGraphServiceClient } from '@cos/proto-contracts/generated';

const client = new KnowledgeGraphServiceClient(process.env.KG_WORKER_GRPC_ADDR);
const vendors = await client.getProjectVendors({ projectId, tenantId });
```

## Notes

- gRPC is READ/query path only — write/ingestion path uses Kafka events (no direct HTTP between modules; Global Execution Rule)
- Generated files (`src/generated/`) are gitignored — they are rebuilt in CI via `pnpm proto-gen`
- Exempt from jest coverage requirement (Rule 35 — no executable logic in this package; only type stubs)
