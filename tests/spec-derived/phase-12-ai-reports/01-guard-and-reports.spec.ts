/**
 * Phase 12 — the Hallucination Guard, the four report capabilities, and the constraints that make
 * the output safe to show a user (master:3935-4056).
 *
 * The guard's five checks are exercised behaviourally in the service's own pytest suite, which the
 * spec asks for by name (master:4035 "test each check independently"). What is asserted here is the
 * contract that suite is written against — the thresholds, the fallback payload, the mandatory
 * ordering — because those are the numbers a future edit would change without any test noticing that
 * the SPEC said otherwise.
 */
import * as fs from 'fs';
import * as path from 'path';
import { exists, read, repoRoot } from '../helpers';

const gateway = 'services/ai-gateway';
const guard = read(`${gateway}/reports/guard.py`);
const models = read(`${gateway}/reports/models.py`);
const pipeline = read(`${gateway}/reports/pipeline.py`);
const main = read(`${gateway}/main.py`);

describe('Phase 12 · HallucinationGuard thresholds (master:3944-3954)', () => {
  it('bounds the summary at 50 and 500 words', () => {
    expect(guard).toMatch(/MIN_WORDS\s*=\s*50/);
    expect(guard).toMatch(/MAX_WORDS\s*=\s*500/);
  });

  it('sets the low-confidence threshold at 0.7', () => {
    expect(guard).toMatch(/CONFIDENCE_THRESHOLD\s*=\s*0\.7/);
  });

  it('treats the threshold as a floor, not a ceiling', () => {
    // master:3949 — "if confidence < 0.7 → return fallback". Exactly 0.7 must PASS. `<=` here would
    // reject every report that lands precisely on the boundary the spec chose to allow.
    expect(guard).toMatch(/confidence\)\s*<\s*CONFIDENCE_THRESHOLD/);
    expect(guard).not.toMatch(/confidence\)\s*<=\s*CONFIDENCE_THRESHOLD/);
  });

  it('runs the source-attribution check BEFORE the confidence floor', () => {
    // Check 2 fails on confidence == 0. If the `< 0.7` test ran first it would swallow the zero
    // case and check 2 would be unreachable — five checks in the source, four in effect.
    expect(guard.indexOf('no source attribution')).toBeLessThan(guard.indexOf('LOW_CONFIDENCE'));
  });

  it('validates that confidence is a number inside [0.0, 1.0]', () => {
    expect(guard).toMatch(/0\.0\s*<=\s*float\(confidence\)\s*<=\s*1\.0/);
  });

  it('detects contradictions by comparing figures against the context', () => {
    // Check 5 — "summary contains data not in input context". Numbers are the part of a summary
    // that can be checked mechanically, and the part a reader will quote.
    expect(guard).toMatch(/def _check_contradiction/);
  });
});

describe('Phase 12 · the fallback response, verbatim (master:3950-3952)', () => {
  it('carries exactly the four fields the spec writes', () => {
    const block = models.slice(models.indexOf('class LowConfidenceResponse'));
    expect(block).toMatch(/status:\s*str\s*=\s*"LOW_CONFIDENCE"/);
    expect(block).toMatch(/summary:\s*None\s*=\s*None/);
    expect(block).toMatch(/message:\s*str\s*=\s*"Insufficient data for reliable summary"/);
    expect(block).toMatch(/raw_data_available:\s*bool\s*=\s*True/);
  });

  it('never surfaces a raw LLM error (master:4044)', () => {
    // "Fallback response must be graceful — never surface raw LLM errors to user." A malformed
    // completion becomes the fallback; the exception is logged, not returned.
    expect(pipeline).toMatch(/except \(json\.JSONDecodeError, AttributeError\)/);
    expect(pipeline).toMatch(/LowConfidenceResponse\(\)/);
  });
});

describe('Phase 12 · confidence comes from the one structured call (master:3956-3965)', () => {
  it('is parsed from the LLM JSON, not asked for separately', () => {
    // "do NOT ask LLM to estimate confidence in a separate call (latency cost)". One completion per
    // report is the invariant; a second call would also let the two answers disagree.
    const completes = [...pipeline.matchAll(/complete_and_meter\(|\.complete\(/g)];
    expect(completes.length).toBe(1);
    expect(pipeline).toMatch(/output_data\.get\("confidence"/);
  });

  it('the prompt asks for confidence inside the JSON schema', () => {
    const templates = fs
      .readdirSync(path.join(repoRoot, 'ai/prompts'))
      .filter((f) => f.startsWith('report-') && f.endsWith('.j2'));
    expect(templates.length).toBe(4);
    for (const file of templates) {
      expect(read(`ai/prompts/${file}`)).toMatch(/"confidence"/);
    }
  });
});

describe('Phase 12 · the four capabilities (master:3967-3991)', () => {
  const expected: Array<[string, string, string[]]> = [
    ['SITE_SUMMARY', 'report-daily-summary-v1', ['summary', 'key_issues', 'manpower_trend']],
    [
      'PROCUREMENT_SUMMARY',
      'report-procurement-status-v1',
      ['summary', 'overdue_count', 'risk_items'],
    ],
    [
      'EXECUTIVE_SUMMARY',
      'report-executive-v1',
      ['executive_summary', 'risk_flags', 'recommendations'],
    ],
    ['DELAY_RISK', 'report-delay-risk-v1', ['delay_risk_level', 'risk_factors', 'disclaimer']],
  ];

  it.each(expected)('%s maps to %s', (type, template) => {
    expect(models).toMatch(new RegExp(`"${type}":\\s*\\([A-Za-z]+,\\s*"${template}"`));
    expect(exists(`ai/prompts/${template}.j2`)).toBe(true);
  });

  it.each(expected)('%s declares the output fields the spec names', (_type, _t, fields) => {
    for (const field of fields) expect(models).toMatch(new RegExp(`\\b${field}\\s*:`));
  });

  it('every report type carries a confidence field (master:4043)', () => {
    // "Confidence score must accompany every report" — including DELAY_RISK, whose output is a band
    // rather than prose.
    for (const cls of [
      'SiteSummaryOutput',
      'ProcurementSummaryOutput',
      'ExecutiveSummaryOutput',
      'DelayRiskOutput',
    ]) {
      const block = models.slice(
        models.indexOf(`class ${cls}`),
        models.indexOf(`class ${cls}`) + 400,
      );
      expect(block).toMatch(/confidence:\s*float/);
    }
  });
});

describe('Phase 12 · delay risk bands (master:3991)', () => {
  const template = read('ai/prompts/report-delay-risk-v1.j2');

  it('constrains the level to the four the spec names', () => {
    expect(models).toMatch(
      /delay_risk_level:\s*Literal\["LOW",\s*"MEDIUM",\s*"HIGH",\s*"CRITICAL"\]/,
    );
  });

  it('states every band boundary exactly as the spec does', () => {
    // The bands live in the prompt because master:3865 forbids prompts in source — which makes this
    // template the implementation. A typo in one boundary is a silent behaviour change, invisible to
    // every other test in the repository.
    expect(template).toMatch(/LOW\s*=\s*1[–-]2 days/);
    expect(template).toMatch(/MEDIUM\s*=\s*3[–-]6 days/);
    expect(template).toMatch(/HIGH\s*=\s*7[–-]13 days/);
    expect(template).toMatch(/CRITICAL\s*=\s*14\+ days/);
  });

  it('leaves no gap or overlap between the bands', () => {
    // Read the numbers back out and check they tile 1..∞ — a band written 3–7 beside 7–13 would
    // still "state the boundaries" while making 7 ambiguous.
    const bounds = [
      /LOW\s*=\s*(\d+)[–-](\d+)/,
      /MEDIUM\s*=\s*(\d+)[–-](\d+)/,
      /HIGH\s*=\s*(\d+)[–-](\d+)/,
    ]
      .map((re) => re.exec(template)!)
      .map((m) => [Number(m[1]), Number(m[2])] as [number, number]);
    const critical = Number(/CRITICAL\s*=\s*(\d+)\+/.exec(template)![1]);
    expect(bounds[0][0]).toBe(1);
    for (let i = 1; i < bounds.length; i += 1) {
      expect(bounds[i][0]).toBe(bounds[i - 1][1] + 1);
    }
    expect(critical).toBe(bounds[bounds.length - 1][1] + 1);
  });

  it('requires the disclaimer verbatim (master:3990)', () => {
    const disclaimer = 'AI-generated estimate — verify with project schedule';
    expect(template).toContain(disclaimer);
    // And it is a default on the model, so a completion that omits it still carries one.
    expect(models).toContain(disclaimer);
  });

  it('the schedule baseline reaches the context the bands are judged on', () => {
    // The bands are defined on "projected delay in days". Until 2026-08-23 the context carried no
    // dates at all — see risk/context.py.
    const ctx = read(`${gateway}/risk/context.py`);
    expect(ctx).toMatch(/estimated_completion_date/);
    expect(ctx).toMatch(/COALESCE\(estimated_completion_date, end_date\)/);
  });
});

describe('Phase 12 · orchestration is a plain sequential pipeline (master:4000-4010, 4028)', () => {
  it('runs the six steps in order', () => {
    const steps = ['token budget', 'render prompt', 'hallucination guard', 'persist', 'return'];
    let cursor = -1;
    for (const step of steps) {
      const at = pipeline.toLowerCase().indexOf(step.toLowerCase(), cursor + 1);
      expect(at).toBeGreaterThan(cursor);
      cursor = at;
    }
  });

  it('uses no agent framework (master:4001, 4028)', () => {
    // "plain Python sequential pipeline (no Agent Orchestrator)" and "no LangGraph in Phase 12".
    // Layer-C orchestration is LAYER-C-001, provisionally Temporal, and not this phase's decision.
    const sources: string[] = [];
    const walk = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!['.venv', '__pycache__', 'tests', 'build'].includes(e.name)) walk(full);
        } else if (e.name.endsWith('.py')) sources.push(fs.readFileSync(full, 'utf8'));
      }
    };
    walk(path.join(repoRoot, gateway));
    expect(sources.join('\n')).not.toMatch(/langgraph|LangGraph/);
  });

  it('the guard cannot be skipped (master:4042)', () => {
    // "Hallucination guard is mandatory — never skip". There is one generate path, and the guard sits
    // on it unconditionally: no flag, no env var, no caller-supplied bypass.
    expect(pipeline).toMatch(/_GUARD\.validate\(/);
    expect(pipeline).not.toMatch(/skip_guard|bypass_guard|if\s+\w*guard\w*_enabled/i);
  });

  it('every endpoint goes through that one path', () => {
    // Four report endpoints, one `_run_report`. A second, guard-free path is how "mandatory" quietly
    // stops being mandatory.
    const handlers = [...main.matchAll(/@app\.post\("\/api\/v1\/ai\/reports\/[a-z-]+"/g)];
    expect(handlers.length).toBe(4);
    const runCalls = [...main.matchAll(/_run_report\(/g)];
    expect(runCalls.length).toBeGreaterThanOrEqual(4);
  });
});

describe('Phase 12 · token budget (master:4037)', () => {
  const budget = read(`${gateway}/reports/token_budget.py`);

  it('caps input context at 4000 tokens', () => {
    expect(budget).toMatch(/MAX_INPUT_TOKENS\s*=\s*4000/);
  });

  it('caps generated output at 1000 tokens', () => {
    expect(budget).toMatch(/MAX_OUTPUT_TOKENS\s*=\s*1000/);
  });

  it('the pipeline trims the context rather than only measuring it', () => {
    // A budget that is checked and then ignored is not a budget: an over-long context reaches the
    // model and the request fails at the provider, after the tokens are already spent.
    expect(pipeline).toMatch(/_BUDGET\.trim_context\(/);
  });
});

describe('Phase 12 · the endpoints (master:3993-3998)', () => {
  it.each(['site-summary', 'procurement-summary', 'executive-summary', 'delay-risk'])(
    'POST /api/v1/ai/reports/%s exists',
    (route) => {
      expect(main).toContain(`@app.post("/api/v1/ai/reports/${route}"`);
    },
  );

  it('GET /api/v1/ai/reports/history exists', () => {
    expect(main).toContain('@app.get("/api/v1/ai/reports/history"');
  });
});

describe('Phase 12 · advisory only (master:4041)', () => {
  it('the report pipeline triggers no action in another service', () => {
    // "All AI outputs are advisory — no autonomous actions to other services." The delay-risk path
    // DOES emit a risk-prediction event, which is a notification, not an action: it creates an
    // AI_SUGGESTED risk for a human to accept. Nothing here approves, pays, or transitions state.
    expect(pipeline).not.toMatch(/\/api\/v1\/(finance|procurement|projects)\//);
    expect(main).not.toMatch(/\/(approve|pay|cancel)\b.*await\s+http/i);
  });
});

describe('Phase 12 · CrossEncoderReranking stays a stub (master:4046-4053)', () => {
  const rerank = read(`${gateway}/providers/cross_encoder_reranking.py`);

  it('names the resolved model', () => {
    expect(rerank).toMatch(/cross-encoder\/ms-marco-MiniLM-L-6-v2/);
  });

  it('is not switched on', () => {
    // "generate stub, do NOT implement yet"; activation is gated on RAG p95 relevance < 0.7 over a
    // 7-day window, which is a measurement this phase does not have.
    expect(read(`${gateway}/ai/chains/rag.yaml`)).toMatch(/enabled:\s*false/);
  });
});
