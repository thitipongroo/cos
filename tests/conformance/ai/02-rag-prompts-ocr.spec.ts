/**
 * Phase 11 — RAG retrieval, chunking, prompt templates, the caching/logging middleware, and the OCR
 * pipeline (master:3799-3835, 3862-3884). Plus the one mode that must NOT be built yet.
 */
import * as fs from 'fs';
import * as path from 'path';
import { exists, read, readYaml, repoRoot } from '../helpers';

const gateway = 'services/ai-gateway';
const worker = 'services/ai-embedding-worker';
const ocr = 'services/ai-ocr-pipeline';

interface RagChain {
  retrieval: {
    fusion: { method: string; rank_constant: number };
    final_top_k: number;
    max_context_tokens: number;
    vector: { backend: string };
    keyword: { backend: string };
  };
  chunking: {
    documents: { strategy: string; chunk_size: number; chunk_overlap: number };
    site_reports: { strategy: string };
  };
  rerank: { enabled: boolean; model: string; trigger: { threshold: number } };
}

const chain = readYaml<RagChain>(`${gateway}/ai/chains/rag.yaml`);

describe('Phase 11 · hybrid retrieval fused by RRF (master:3805)', () => {
  it('searches BOTH a keyword and a vector backend', () => {
    // "hybrid search (keyword via OpenSearch + vector via pgvector)". Either one alone is not
    // hybrid: vectors miss an exact part number, keywords miss a paraphrase.
    expect(chain.retrieval.keyword.backend).toBe('opensearch');
    expect(chain.retrieval.vector.backend).toBe('pgvector');
  });

  it('fuses them with Reciprocal Rank Fusion, not by comparing raw scores', () => {
    // RRF combines by RANK POSITION. BM25 scores and cosine distances are not on the same scale, so
    // adding or averaging them lets whichever backend happens to produce larger numbers dominate.
    expect(chain.retrieval.fusion.method).toBe('rrf');
    expect(read(`${gateway}/rag/retrieval.py`)).toMatch(/def reciprocal_rank_fusion/);
  });

  it('assembles top-k = 5 chunks within 4000 context tokens', () => {
    expect(chain.retrieval.final_top_k).toBe(5);
    expect(chain.retrieval.max_context_tokens).toBe(4000);
  });

  it('the retrieval service carries the same two limits as its defaults', () => {
    // The YAML is the declared source; these defaults are what runs when a caller passes nothing.
    // They must agree, or the configured value is a decoration.
    const src = read(`${gateway}/rag/retrieval.py`);
    expect(src).toMatch(/_DEFAULT_MAX_CONTEXT_TOKENS\s*=\s*4000/);
    expect(src).toMatch(/_DEFAULT_TOP_K\s*=\s*5/);
  });

  it('feeds more candidates INTO the fusion than it returns', () => {
    // Fusing only five would make the fusion pointless — there would be nothing for the second
    // backend to promote.
    const cfg = readYaml<
      RagChain & { retrieval: { vector: { top_k: number }; keyword: { top_k: number } } }
    >(`${gateway}/ai/chains/rag.yaml`);
    expect(cfg.retrieval.vector.top_k).toBeGreaterThan(chain.retrieval.final_top_k);
    expect(cfg.retrieval.keyword.top_k).toBeGreaterThan(chain.retrieval.final_top_k);
  });
});

describe('Phase 11 · the reranker is a conditional stage (master:3806)', () => {
  it('names the cross-encoder the spec names', () => {
    expect(chain.rerank.model).toBe('cross-encoder/ms-marco-MiniLM-L-6-v2');
  });

  it('is OFF until the relevance trigger fires', () => {
    // "activate when RAG p95 relevance < 0.7" — it is a remedy with a latency cost, not a default.
    expect(chain.rerank.enabled).toBe(false);
    expect(chain.rerank.trigger.threshold).toBe(0.7);
  });

  it('the implementation exists so activating it is a config change', () => {
    expect(exists(`${gateway}/providers/cross_encoder_reranking.py`)).toBe(true);
  });
});

describe('Phase 11 · chunking strategy (master:3808-3810, 3877)', () => {
  it('documents split at 500 with 100 overlap', () => {
    expect(chain.chunking.documents.strategy).toBe('recursive_character');
    expect(chain.chunking.documents.chunk_size).toBe(500);
    expect(chain.chunking.documents.chunk_overlap).toBe(100);
  });

  it('a site report is ONE chunk', () => {
    // "treat each report as one chunk (typically <500 tokens)". Splitting a daily report would let
    // the morning's weather and the afternoon's blocker be retrieved apart from each other.
    expect(chain.chunking.site_reports.strategy).toBe('single_chunk');
  });

  it('the chunking utility carries the same numbers', () => {
    const src = read(`${worker}/utils/chunking.py`);
    expect(src).toMatch(/chunk_size: int = 500/);
    expect(src).toMatch(/chunk_overlap: int = 100/);
    // And honours the site_report special case rather than only documenting it.
    expect(src).toMatch(/source_type == "site_report"/);
  });
});

describe('Phase 11 · prompt templates (master:3862-3866, 3880)', () => {
  const promptsDir = path.join(repoRoot, 'ai/prompts');
  const templates = fs.readdirSync(promptsDir).filter((f) => f.endsWith('.j2'));

  it('there are Jinja2 templates on disk', () => {
    expect(templates.length).toBeGreaterThan(0);
  });

  it.each(templates)('%s follows {use-case}-v{version}.j2', (file) => {
    // "Naming: {phase}-{use-case}-v{version}.j2". A version in the filename is what lets a prompt
    // change without silently rewriting the behaviour of every caller of the old one.
    expect(file).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*-v\d+\.j2$/);
  });

  it('the loader renders from files, with typed variables', () => {
    const src = read(`${gateway}/templates/loader.py`);
    expect(src).toMatch(/FileSystemLoader/);
    // "Template variables: always typed via Pydantic model" (master:3866).
    expect(src).toMatch(/BaseModel/);
  });

  it('no prompt is written into Python source (master:3865)', () => {
    // "No hardcoded prompts in source code — all via template files". Scanned as an absence: a
    // prompt inlined next to the call site is invisible to review and unversioned.
    const suspects: string[] = [];
    const walk = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!['.venv', '__pycache__', 'tests', 'build'].includes(e.name)) walk(full);
        } else if (e.name.endsWith('.py')) {
          const body = fs.readFileSync(full, 'utf8');
          // A triple-quoted string that reads like an instruction to a model.
          for (const m of body.matchAll(/"""([\s\S]{80,}?)"""/g)) {
            const text = m[1]!;
            if (/^\s*(You are|Act as|Your task is|Summarise|Summarize)\b/i.test(text)) {
              suspects.push(`${path.relative(repoRoot, full)}: ${text.slice(0, 60)}`);
            }
          }
        }
      }
    };
    walk(path.join(repoRoot, gateway));
    expect(suspects).toEqual([]);
  });
});

describe('Phase 11 · response cache and token logging (master:3799-3801, 3879)', () => {
  it('the cache TTL is configurable per template', () => {
    const src = read(`${gateway}/cache/redis_cache.py`);
    expect(src).toMatch(/default_ttl_seconds/);
    // Per-call override — "TTL configurable per template" is not one global number.
    expect(src).toMatch(/ttl_seconds: int \| None/);
  });

  it('the cache key includes the variables, not only the template name', () => {
    // Two renders of the same template with different variables are different prompts; keying on
    // the name alone would serve one tenant's answer to another's question.
    expect(read(`${gateway}/cache/redis_cache.py`)).toMatch(
      /_make_key\(\s*self,\s*template_name[^)]*variables/,
    );
  });

  it('every LLM call is logged to ai_usage_logs', () => {
    const logger = read(`${gateway}/middleware/token_logger.py`);
    expect(logger).toMatch(/INSERT INTO ai\.ai_usage_logs/);
    // It wraps the provider call rather than being an optional extra step at each call site.
    expect(logger).toMatch(/await provider\.complete\(/);
  });

  it('logs the model actually used, as a string (master:3879)', () => {
    expect(read(`${gateway}/middleware/token_logger.py`)).toMatch(/model_used/);
  });
});

describe('Phase 11 · OCR pipeline (master:3828-3835, 3878)', () => {
  const src = read(`${ocr}/ocr_pipeline.py`);

  it('runs pdf2image → pytesseract, with no provider decision required', () => {
    expect(src).toMatch(/import pytesseract/);
    expect(src).toMatch(/from pdf2image import/);
  });

  it('handles both PDFs and images', () => {
    expect(src).toMatch(/def extract_text_from_pdf/);
    expect(src).toMatch(/def extract_text_from_image/);
  });

  it('returns a confidence score with the text', () => {
    // "Output: { file_id, extracted_text, confidence_score }". Text without a confidence cannot be
    // triaged — a 40%-confident invoice total and a 99%-confident one look identical downstream.
    expect(src).toMatch(/confidence_score/);
  });

  it('exposes POST /api/v1/ocr/process', () => {
    expect(read(`${ocr}/main.py`)).toMatch(/@app\.post\("\/api\/v1\/ocr\/process"/);
  });
});

describe('Phase 11 · the endpoints the spec fixes (master:3815-3816, 3826, 3834)', () => {
  it.each([
    [`${gateway}/main.py`, '/api/v1/ai/completions'],
    [`${gateway}/main.py`, '/api/v1/rag/query'],
    [`${worker}/main.py`, '/api/v1/embeddings/generate'],
    [`${ocr}/main.py`, '/api/v1/ocr/process'],
  ])('%s exposes %s', (file, route) => {
    expect(read(file)).toContain(route);
  });
});

describe('Phase 11 · Mode C is specified but NOT built here (master:3897-3908)', () => {
  const pythonSources = ((): string => {
    const out: string[] = [];
    const walk = (dir: string): void => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
          if (!['.venv', '__pycache__', 'build', 'tests'].includes(e.name)) walk(full);
        } else if (e.name.endsWith('.py')) out.push(fs.readFileSync(full, 'utf8'));
      }
    };
    for (const d of [gateway, worker, ocr]) walk(path.join(repoRoot, d));
    return out.join('\n');
  })();

  it('no autonomous executor is wired into the AI services', () => {
    // "Autonomous mode is SPECIFIED in source but NOT implemented in Phase 11–12." Asserted as an
    // absence, because the danger is not that it is missing — it is that it appears early and
    // reaches one of the actions master:3905 prohibits outright.
    expect(pythonSources).not.toMatch(/class\s+\w*Autonomous\w*Executor/);
    expect(pythonSources).not.toMatch(/def\s+execute_autonomous/);
  });

  it('the AI services trigger no financial action, state transition or deletion', () => {
    // The HIGH-RISK PROHIBITION (master:3905-3906), read as: the AI layer holds no route into the
    // domain services that perform those writes.
    expect(pythonSources).not.toMatch(
      /\/api\/v1\/(finance|procurement)\/[\w/{}.-]*\/(approve|pay)/,
    );
  });
});

/**
 * What the embedding worker actually consumes, and what it does not.
 *
 * master:3840 asked for two consumers — files and site reports — and named both events wrongly:
 * `file.uploaded` is not a catalogue name, and `site.report.submitted.v1`, which does exist, carries
 * no text to embed. The line was corrected on 2026-08-29; these cases stop it drifting back and, more
 * usefully, keep the UNBUILT half visible.
 *
 * The report consumer is deliberately absent while the embedding path is a stub — see the amended
 * master:3840 for the full reasoning. An absent thing is exactly what nothing notices, so it is
 * asserted rather than remembered: when §22 wires the real provider and the second consumer, these
 * cases fail and have to be rewritten to describe what is then true.
 */
describe('Phase 11 · the embedding corpus — what is wired, and what is not yet', () => {
  const consumer = read(`${worker}/consumer.py`);
  const workerMain = read(`${worker}/main.py`);

  it('subscribes to the file event by its catalogue name', () => {
    // `file.uploaded` from the old spec line matches no topic. The regex is what runs.
    expect(consumer).toMatch(/file\\\.document\\\.uploaded\\\.v1/);
  });

  it('consumes no site-report event yet', () => {
    // The gap master:3840 describes. It shrinks by deletion, not by editing a number.
    //
    // The dots are OPTIONALLY backslash-escaped because the pattern lives in a Python raw string
    // (`r"^[^.]+\.file\.document\.uploaded\.v1$"`). The first version of this case wrote
    // /site\.report\./ and did not fire when site.report.created was actually added to the pattern:
    // the source says `site\.report`, and a regex demanding a dot straight after "site" met a
    // backslash. Another case in this describe caught the mutation, which is the only reason it was
    // noticed — the case NAMED for the gap was blind to it.
    expect(consumer).not.toMatch(/site\\?\.report/);
  });

  it('still runs the stub embedder, so no real vector exists anywhere', () => {
    // The reason the missing consumer is not urgent, and the thing most likely to be forgotten when
    // someone reads "RAG" in the architecture docs and assumes a populated index.
    expect(workerMain).toMatch(/StubEmbeddingProvider\(\)/);
  });

  it('site.report.created carries the prose and site.report.submitted does not', () => {
    // The cross-source fact that decides WHICH event a future consumer must take. Both schemas
    // exist on purpose (spec §32:510); only one has anything to embed.
    const avsc = (name: string): string => read(`packages/@cos/kafka/src/avro/${name}.avsc`);
    expect(avsc('site.report.created.v1')).toContain('summary');
    expect(avsc('site.report.submitted.v1')).not.toContain('summary');
  });

  it('the mobile daily report sends no summary, so web is the only source of that prose', () => {
    // master:3434-3438. Without this, "wire the report consumer" reads like it would index every
    // daily report on every site.
    expect(read('apps/mobile/src/app/(app)/report.tsx')).toMatch(/summary:\s*null/);
  });
});
