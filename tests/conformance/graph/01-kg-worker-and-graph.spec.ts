/**
 * Phase 13 — the knowledge-graph ingestion worker and the graph API (master:4061-4226).
 *
 * The worker is Go; its behaviour is exercised by its own `go test` suites, which master:4217-4218
 * asks for by name. Asserted here is the contract those suites are written against — the consumer
 * group, the topic pattern, the label set, the MERGE-not-CREATE rule — because each is a value a
 * refactor could change while every Go test still passed.
 */
import * as fs from 'fs';
import * as path from 'path';
import { exists, read, readYaml, repoRoot } from '../helpers';

const kg = 'services/kg-ingestion-worker';
const consumer = read(`${kg}/internal/consumer/kafka_consumer.go`);
const constraints = read(`${kg}/internal/graph/constraints.go`);
const mapper = read(`${kg}/internal/mapper/event_mapper.go`);
const goMod = read(`${kg}/go.mod`);

describe('Phase 13 · the worker is a Go Kafka consumer with a Neo4j writer (master:4068, 4211)', () => {
  it.each([
    ['Kafka consumer', `${kg}/internal/consumer/kafka_consumer.go`],
    ['Neo4j writer', `${kg}/internal/graph/neo4j_writer.go`],
    ['relationship mapper', `${kg}/internal/mapper/event_mapper.go`],
    ['schema constraints', `${kg}/internal/graph/constraints.go`],
  ])('has a %s', (_what, file) => {
    expect(exists(file)).toBe(true);
  });

  it('is a Go module', () => {
    expect(goMod).toMatch(/^module /m);
  });
});

describe('Phase 13 · Kafka subscription (master:4074-4084)', () => {
  it('uses the shared-tier consumer group name §7.3 defines', () => {
    // "kg-ingestion-worker.shared" — the convention supersedes the earlier literal "kg-consumer-group".
    // The group name is the offset key: renaming it silently replays the whole topic set.
    expect(consumer).toMatch(/ConsumerGroupID\s*=\s*"kg-ingestion-worker\.shared"/);
  });

  it('subscribes by the exact cross-tenant regex the spec fixes', () => {
    // `^[^.]+\.(construction|procurement|site|finance)\..*` — the leading segment is the tenant
    // prefix (§7.3), so this matches every tenant's topics for those four domains. A narrower
    // pattern silently stops ingesting for tenants onboarded later.
    expect(consumer).toMatch(
      /TopicRegex\s*=\s*`\^\[\^\.\]\+\\\.\(construction\|procurement\|site\|finance\)\\\.\.\*`/,
    );
  });

  it('consumes by regex rather than by a literal topic list', () => {
    // The call lives in the SHARED pipeline, which is what master:4081 describes: "via the shared
    // coskafka pipeline (kgo.ConsumeRegex)". Asserting it here rather than in the worker keeps the
    // check on the code that actually subscribes — the worker hands it a pattern and would look
    // identical whether or not the library treated it as one.
    expect(read('libs/go/coskafka/consumer.go')).toMatch(/kgo\.ConsumeRegex\(\)/);
    expect(consumer).toMatch(/coskafka/);
  });

  it('uses franz-go', () => {
    expect(goMod).toMatch(/github\.com\/twmb\/franz-go/);
  });

  it('has no sarama left anywhere in the module', () => {
    // Replaced for two reasons master:4082-4083 records: sarama has no regex topic subscription —
    // which the pattern above REQUIRES — and it json.Unmarshal'd Avro-framed bytes. Both failed only
    // against a real broker, so a stray import would not show up in a unit test.
    expect(goMod).not.toMatch(/sarama/i);
    expect(exists(`${kg}/go.sum`)).toBe(true);
    expect(read(`${kg}/go.sum`)).not.toMatch(/sarama/i);
  });
});

describe('Phase 13 · the graph is derived, not authoritative (master:4069-4072, 4086)', () => {
  const goSources = ((): string => {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name.endsWith('.go') && !e.name.endsWith('_test.go')) {
          out.push(fs.readFileSync(full, 'utf8'));
        }
      }
    };
    walk(path.join(repoRoot, kg));
    return out.join('\n');
  })();

  it('writes to Neo4j with MERGE, never CREATE', () => {
    // Last-event-wins on an eventually-consistent projection means every write must be idempotent:
    // a replay after a restart (master:4087) re-applies the same events, and CREATE would duplicate
    // every node it touched.
    expect(mapper).toMatch(/MERGE \(/);
    expect(mapper).not.toMatch(/\bCREATE \(/);
  });

  it('never writes back to PostgreSQL', () => {
    // "Graph is NOT the source of truth — PostgreSQL is authoritative." A worker holding a Postgres
    // handle is one refactor away from making the projection a writer.
    expect(goSources).not.toMatch(/database\/sql|pgx|lib\/pq/);
  });

  it('exposes an admin endpoint that replays from the beginning (master:4088, 4216)', () => {
    const main = read(`${kg}/cmd/kg-ingestion-worker/main.go`);
    expect(main).toMatch(/\/admin\/rebuild/);
  });
});

describe('Phase 13 · the eight event-backed labels (master:4161-4166, 4215)', () => {
  const EVENT_BACKED = [
    'Project',
    'Task',
    'Material',
    'Vendor',
    'Inspection',
    'Invoice',
    'Contract',
    'Delay',
  ];
  const NOT_INGESTED = ['Building', 'Floor', 'Room', 'Structure'];

  it.each(EVENT_BACKED)('%s has a uniqueness constraint', (label) => {
    expect(constraints).toMatch(new RegExp(`FOR \\(n:${label}\\)`));
  });

  it('constrains exactly those eight and no more', () => {
    const labels = [...constraints.matchAll(/FOR \(n:(\w+)\)/g)].map((m) => m[1]!);
    expect([...labels].sort()).toEqual([...EVENT_BACKED].sort());
  });

  it.each(NOT_INGESTED)('%s is absent — it emits no events (PO 2026-07-05)', (label) => {
    // The physical hierarchy is backing data with no Kafka producer, and KG sync is event-driven
    // only. A constraint for a label nothing can create would suggest the sync was broken rather
    // than that the label was never in scope.
    expect(constraints).not.toMatch(new RegExp(`FOR \\(n:${label}\\)`));
    expect(mapper).not.toMatch(new RegExp(`:${label}\\b`));
  });

  it('keys every constraint on the id AND the tenant (master:4215)', () => {
    // Uniqueness on the id alone would collide across tenants the moment two tenants share an id
    // space — and would let one tenant's MERGE adopt another's node.
    const requires = [...constraints.matchAll(/REQUIRE \(([^)]*)\) IS UNIQUE/g)].map((m) => m[1]!);
    expect(requires.length).toBe(8);
    for (const req of requires) expect(req).toMatch(/n\.tenant_id/);
  });
});

describe('Phase 13 · the relationships that are materialised (master:4168-4184)', () => {
  const MATERIALISED = [
    'HAS_MATERIAL',
    'SUPPLIED_BY',
    'DELIVERED_BY',
    'SUBMITTED',
    'BELONGS_TO',
    'VALIDATES',
    'HAS_INSPECTION',
    'IMPACTS',
  ];
  const NOT_MATERIALISED = ['HAS_FLOOR', 'HAS_ROOM', 'CONTAINS_STRUCTURE', 'LOCATED_IN'];

  it.each(MATERIALISED)('%s is written by the mapper', (rel) => {
    expect(mapper).toMatch(new RegExp(`-\\[:${rel}\\]->`));
  });

  it('writes exactly those eight relationship types', () => {
    const rels = [...new Set([...mapper.matchAll(/-\[:(\w+)\]->/g)].map((m) => m[1]!))];
    expect(rels.sort()).toEqual([...MATERIALISED].sort());
  });

  it.each(NOT_MATERIALISED)('%s is absent — it touches the physical hierarchy', (rel) => {
    expect(mapper).not.toMatch(new RegExp(`-\\[:${rel}\\]->`));
  });
});

describe('Phase 13 · the Delay node (master:4126-4136)', () => {
  it('is keyed on the CloudEvents event_id', () => {
    // "delay_id: String (UUID — maps to event_id from CloudEvents envelope; MERGE key)". Keying on
    // anything else would make a redelivered event a second delay.
    expect(mapper).toMatch(/MERGE \(d:Delay \{delay_id: \$delay_id, tenant_id: \$tenant_id\}\)/);
  });

  it('carries the properties the spec lists', () => {
    for (const prop of ['delay_days', 'cause', 'detected_by', 'severity', 'occurred_at']) {
      expect(mapper).toMatch(new RegExp(`\\$${prop}\\b|"${prop}"`));
    }
  });

  it('stores the severity the event carries rather than recomputing it', () => {
    // The bands (LOW 1-2 … CRITICAL 14+) belong to the producer; a derived projection that graded
    // delays itself could disagree with the event it was built from.
    expect(mapper).toMatch(/"severity":\s*p\.Severity/);
  });

  it('the severity bands agree across every source that states them', () => {
    // Phase 13 (this phase), Phase 12 (delay-risk), §32:452 (the Event Contract), and the delay-risk
    // prompt. Four statements of one rule is four chances for them to drift — which is the point of
    // reading all four here rather than trusting one.
    //
    // The first two used to be read from `context/00_master_construction_os.md`. The 25 Phase blocks
    // moved to `context/phases/` on 2026-09-02 (f55dee77), so both assertions were running against a
    // file that no longer held either sentence. Reading the phase files also states which phase owns
    // which wording, which the master never did.
    const phase13 = read('context/phases/phase-13-knowledge-graph.md');
    const phase12 = read('context/phases/phase-12-ai-report-assistant.md');
    const spec32 = read('docs/specifications/32-implementation-specifications.md');
    const prompt = read('ai/prompts/report-delay-risk-v1.j2');
    expect(phase13).toMatch(/LOW=1-2d, MEDIUM=3-6d, HIGH=7-13d, CRITICAL=14\+d/);
    expect(phase12).toMatch(/LOW=1-2, MEDIUM=3-6, HIGH=7-13, CRITICAL=14\+/);
    expect(spec32).toMatch(/LOW=1-2 days, MEDIUM=3-6, HIGH=7-13, CRITICAL=14\+/);
    expect(prompt).toMatch(/LOW\s*=\s*1[–-]2 days/);
    expect(prompt).toMatch(/CRITICAL\s*=\s*14\+ days/);
  });
});

describe('Phase 13 · the graph API (master:4202-4207, 4214, 4219)', () => {
  const controller = read('backend/src/modules/graph/graph.controller.ts');

  it.each([
    'graph/projects/:projectId/vendors',
    'graph/projects/:projectId/supply-chain',
    'graph/projects/:projectId/inspections',
    'graph/vendors/:vendorId/projects',
    'graph/vendors/:vendorId/invoices',
  ])('exposes GET /%s', (route) => {
    expect(controller).toContain(`@Get('${route}')`);
  });

  it('is a thin API that delegates to Neo4j', () => {
    // "NestJS thin API — delegates to Neo4j": the query logic is Cypher, not SQL assembled here.
    const service = read('backend/src/modules/graph/graph.service.ts');
    expect(service).toMatch(/MATCH \(/);
  });

  it('has an OpenAPI document', () => {
    expect(exists('docs/api/graph.openapi.yaml')).toBe(true);
  });

  it('documents every route the controller serves', () => {
    // The same check that found eight undocumented finance endpoints in Phase 7.
    const doc = readYaml<{ paths: Record<string, unknown> }>('docs/api/graph.openapi.yaml');
    const documented = Object.keys(doc.paths ?? {});
    const routes = [...controller.matchAll(/@Get\('([^']+)'\)/g)].map((m) =>
      `/${m[1]!}`.replace(/:(\w+)/g, '{$1}'),
    );
    for (const route of routes) {
      expect(documented.some((p) => p.endsWith(route))).toBe(true);
    }
  });
});

describe('Phase 13 · the tests the spec asks for exist (master:4217-4218)', () => {
  it('unit tests cover the event → Cypher transformation', () => {
    expect(exists(`${kg}/tests/unit/mapper_test.go`)).toBe(true);
  });

  it('the integration test uses a real Neo4j container', () => {
    // "Integration tests: full ingest pipeline with Neo4j test container". A mocked driver would
    // test the mapper twice and the Cypher not at all — Neo4j is what rejects a malformed MERGE.
    const integration = read(`${kg}/tests/integration/ingest_test.go`);
    expect(integration).toMatch(/testcontainers|neo4j:.*|Neo4jContainer/i);
  });
});

describe('Phase 13 · the API degrades rather than leaking a driver error', () => {
  const service = read('backend/src/modules/graph/graph.service.ts');

  it('answers 503 when Neo4j is unreachable', () => {
    // The graph lags PostgreSQL by design and may be down without the platform being down
    // (master:4069-4072). A driver stack trace reaching the caller would read as a platform fault
    // rather than an unavailable projection.
    expect(service).toMatch(/ServiceUnavailableException/);
    expect(service).toMatch(/Neo4j unavailable/);
  });

  it('closes the session even when the query throws', () => {
    // A leaked session holds a connection from a small pool; under a failing Neo4j every request
    // would take one and never give it back.
    expect(service).toMatch(/finally\s*\{[\s\S]{0,200}?session\??\.?close\(\)/);
  });
});

describe('Phase 13 · the Delay node has no source yet — deferred to Phase 23', () => {
  /**
   * `construction.delay.detected.v1` has a schema, a topic, a catalogue entry and TWO documented
   * consumers, and NOTHING in this repository publishes it. Product-owner decision 2026-08-23: the
   * producer waits for Phase 23's DelayForecastModel — the AI_FORECAST source the payload names —
   * and ships together with both consumers.
   *
   * These tests pin the state as it IS, so the day a producer appears they fail and this block is
   * removed deliberately. A permanently-red test would just be noise on every run.
   */
  const publishers = ((): string[] => {
    const hits: string[] = [];
    const roots = ['backend/src', 'services', 'packages/@cos/shared/src', 'apps'];
    const walk = (dir: string): void => {
      if (!fs.existsSync(dir)) return;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (
            !['node_modules', 'dist', '__pycache__', '.venv', 'build', '.next'].includes(e.name)
          ) {
            walk(full);
          }
        } else if (/\.(ts|py|go)$/.test(e.name) && !/\.(spec|test)\./.test(e.name)) {
          const body = fs.readFileSync(full, 'utf8');
          // A file that BOTH names the event and sends something. The first version looked only for
          // `publish(...construction.delay.detected...)` on one line, and missed the producer that
          // actually shipped: the AI gateway holds the event type in a constant and calls
          // `send_and_wait(topic, ...)` with an f-string topic. It kept answering "nothing publishes
          // it" after something did — the exact blind spot this estate exists to remove.
          const namesEvent = /construction\.delay\.detected/.test(body);
          const sends = /\b(publish\w*|send_and_wait|sendMessage|produce)\s*\(/.test(body);
          const isConsumer = /kafka\.on\(|ConsumeRegex|case "construction\.delay/.test(body);
          if (namesEvent && sends && !isConsumer) {
            hits.push(path.relative(repoRoot, full));
          }
        }
      }
    };
    for (const r of roots) walk(path.join(repoRoot, r));
    return hits;
  })();

  it('the event is still declared, so the contract survives the wait', () => {
    // The schema and the catalogue entry must NOT be removed while the producer is pending — the KG
    // mapper and the topic config are both written against them.
    expect(exists('packages/@cos/kafka/src/avro/construction.delay.detected.v1.avsc')).toBe(true);
    expect(read('packages/@cos/kafka/src/topic-catalog.ts')).toMatch(
      /'construction\.delay\.detected\.v1'/,
    );
  });

  it('something publishes it', () => {
    // Was 'nothing publishes it yet' until Phase 23 (2026-08-25). The deferral is resolved: the
    // producer ships with BOTH consumers, which is the condition master set for closing it.
    expect(publishers.length).toBeGreaterThan(0);
    expect(publishers.some((f) => /delay_event\.py$/.test(f))).toBe(true);
  });

  it('the second consumer — the task auto-block — exists too', () => {
    // The Knowledge Graph consumer was never the problem. §Phase 6 gate 6 stated the auto-block as
    // fact while no code performed it, so the event was only half-observable: a Delay node appeared
    // in the graph and nothing changed in the product.
    expect(exists('backend/src/modules/tasks/tasks.delay.consumer.ts')).toBe(true);
    expect(read('backend/src/modules/tasks/tasks.module.ts')).toContain('TasksDelayConsumer');
  });

  it('the phase file describes it as built, with the scope of the transition', () => {
    // Phase 6 owns the gate this describes, and its command file is where both sentences live since
    // the Phase blocks moved out of the master on 2026-09-02 (f55dee77).
    const phase06 = read('context/phases/phase-06-site-operations.md');
    expect(phase06).toMatch(/The AUTOMATIC path IS built/);
    // The literal reading of "auto-sets task.status = BLOCKED" would let a late or replayed forecast
    // un-finish completed work, so the consumer narrows it — and the spec now says so rather than
    // leaving the code quietly stricter than the sentence it implements.
    expect(phase06).toMatch(/SCOPE OF THE AUTOMATIC TRANSITION/);
  });

  it('the task-completion gate still works without it', () => {
    // The gate reads the status; a PM can set BLOCKED by hand. Only the automatic path is missing,
    // so the gate is not dead — worth pinning, because "no producer" reads like it would be.
    expect(read('backend/src/modules/tasks/tasks.service.ts')).toMatch(
      /task\.status === 'BLOCKED'/,
    );
    expect(read('backend/src/modules/tasks/dto/update-task.dto.ts')).toMatch(/BLOCKED = 'BLOCKED'/);
  });
});

/**
 * master:4156 — "(:Contract) contract_id: String — maps to po_id of APPROVED Purchase Orders
 * (APPROVED PO = contractual agreement; no separate Contract module needed)".
 *
 * The word APPROVED is the whole rule, and it was dropped: until 2026-08-29 the mapper wrote a
 * :Contract on `procurement.po.created.v1`, which fires while the PO is still a DRAFT — that
 * event carries no status field at all, and `purchase_orders.status` defaults to DRAFT. So the
 * graph held a node meaning "there is a binding agreement with this vendor" for every document
 * anyone had ever started, including the ones later rejected.
 *
 * Nothing caught it. The Go test was called TestMapPOCreated_ContractIDIsPoID and asserted that
 * contract_id equalled po_id — true, and beside the point. No conformance case mentioned Contract
 * except to count it among the eight constrained labels. And no query reads :Contract yet, so the
 * wrong data was never in front of anyone; it was simply accumulating.
 *
 * Asserted here as a cross-source rule because the Go tests can only see the mapper's output for
 * an input they choose, while this can see which EVENT the label is bound to at all.
 */
describe('Phase 13 · :Contract is an APPROVED purchase order (master:4156)', () => {
  it('is materialised from the status-changed event, not from po.created', () => {
    const poCreated = mapper.slice(
      mapper.indexOf('func mapPOCreated'),
      mapper.indexOf('func mapPOStatusChanged'),
    );
    // Cypher only. The function's comment names :Contract to point at where it moved, and an
    // assertion over the raw text matched that prose instead of the code — caught on the first
    // run, and worth keeping in mind for every other source-text check in this file.
    const cypher = poCreated.replace(/\/\/[^\n]*/g, '');
    expect(cypher).not.toMatch(/:Contract/);
    expect(cypher).toMatch(/:Vendor/);
  });

  it('the worker consumes procurement.po.status_changed.v1', () => {
    // Already inside the subscription regex (^[^.]+\.(construction|procurement|site|finance)\..*),
    // so what was missing was only the case arm.
    expect(mapper).toContain('procurement.po.status_changed.v1');
  });

  it('gates the write on APPROVED rather than writing on any transition', () => {
    const fn = mapper.slice(mapper.indexOf('func mapPOStatusChanged'));
    expect(fn).toMatch(/ToStatus\s*!=\s*"APPROVED"/);
    // The refusal must come BEFORE the MERGE, or the gate decides nothing.
    expect(fn.indexOf('"APPROVED"')).toBeLessThan(fn.indexOf(':Contract'));
  });

  it('still keys the node on po_id', () => {
    // The half the old test had right, kept.
    const fn = mapper.slice(mapper.indexOf('func mapPOStatusChanged'));
    expect(fn).toMatch(
      /MERGE \(n:Contract \{contract_id: \$contract_id, tenant_id: \$tenant_id\}\)/,
    );
    expect(fn).toMatch(/"contract_id":\s*p\.POID/);
  });
});
