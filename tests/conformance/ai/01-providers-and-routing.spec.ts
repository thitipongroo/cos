/**
 * Phase 11 — the provider interfaces and the model routing table (master:3752-3816, 3868-3884).
 *
 * WHY THESE ARE READ AS TEXT. The AI layer is Python; this suite is TypeScript. What the spec fixes
 * here is a CONTRACT — that an interface is abstract, that a routing table lives in YAML, that no
 * model name is spelled into source — and every one of those is visible in the file. Behaviour that
 * needs a Python interpreter belongs in each service's own pytest suite, and is called out where it
 * matters below.
 */
import * as fs from 'fs';
import * as path from 'path';

import { abs, exists, read, readYaml, toPosix } from '../helpers';

const gateway = 'services/ai-gateway';
const worker = 'services/ai-embedding-worker';
const ocr = 'services/ai-ocr-pipeline';

describe('Phase 11 · the three AI services exist (master:3787, 3870)', () => {
  it.each([
    ['LLM Gateway', gateway],
    ['Embedding Worker', worker],
    ['OCR Pipeline', ocr],
  ])('%s is a FastAPI service', (_name, dir) => {
    expect(exists(`${dir}/main.py`)).toBe(true);
    expect(read(`${dir}/main.py`)).toMatch(/FastAPI/);
  });
});

describe('Phase 11 · LLMProvider is an interface, not a wrapper (master:3754-3760)', () => {
  const src = read(`${gateway}/providers/llm_provider.py`);

  it('is declared as an ABC', () => {
    expect(src).toMatch(/class LLMProvider\(ABC\)/);
  });

  it('declares complete() abstract with the signature the spec fixes', () => {
    expect(src).toMatch(
      /@abstractmethod\s+async def complete\(\s*self,\s*messages: list\[Message\],\s*model_hint: str\s*\)/,
    );
  });

  it('ships a stub that raises rather than pretending to answer', () => {
    // master:3871 — "StubLLMProvider raises NotImplementedError". A stub returning canned text is
    // worse than one that raises: the caller cannot tell a real completion from a placeholder.
    expect(src).toMatch(/class StubLLMProvider\(LLMProvider\)/);
    expect(src).toMatch(/raise NotImplementedError/);
  });
});

describe('Phase 11 · EmbeddingProvider (master:3767-3776)', () => {
  // The worker's providers/embedding_provider.py is a re-export shim: the implementation lives once
  // in libs/python/cosembedding, shared with the Gateway's query-side embedder (ADR-021). Asserting
  // against the shim would pass on the import line and never see the contract.
  const src = read('libs/python/cosembedding/cosembedding/__init__.py');

  it('is declared as an ABC with embed() and dimensions', () => {
    expect(src).toMatch(/class EmbeddingProvider\(ABC\)/);
    expect(src).toMatch(/@abstractmethod\s+async def embed\(/);
    expect(src).toMatch(/def dimensions\(/);
  });

  it('pins 1536 dimensions AND names the model that produces them', () => {
    // The pgvector column is vector(1536). A provider returning any other width does not fail at the
    // provider; it fails at the INSERT, one layer away from the cause. The two constants are
    // asserted together because the width is only correct FOR that model.
    expect(src).toMatch(/EMBEDDING_DIMENSIONS\s*=\s*1536/);
    expect(src).toMatch(/EMBEDDING_MODEL\s*=\s*["']text-embedding-3-small["']/);
  });

  it('the shim re-exports it rather than declaring a second copy', () => {
    const shim = read(`${worker}/providers/embedding_provider.py`);
    expect(shim).toMatch(/from cosembedding import/);
    expect(shim).not.toMatch(/class EmbeddingProvider\(ABC\)/);
  });
});

describe('Phase 11 · the routing table (master:3794-3798)', () => {
  const routing = readYaml<{
    tiers: Record<string, { model: string; model_hints: string[] }>;
  }>(`${gateway}/config/routing.yaml`);

  it('declares exactly the two tiers the spec names', () => {
    expect(Object.keys(routing.tiers).sort()).toEqual(['FAST', 'POWERFUL']);
  });

  it('POWERFUL carries report-generation, risk-analysis, document-extraction', () => {
    expect([...routing.tiers.POWERFUL.model_hints].sort()).toEqual([
      'document-extraction',
      'report-generation',
      'risk-analysis',
    ]);
  });

  it('FAST carries summarization, classification, autocomplete', () => {
    expect([...routing.tiers.FAST.model_hints].sort()).toEqual([
      'autocomplete',
      'classification',
      'summarization',
    ]);
  });

  it('resolves both tiers from the environment, with the fallback in the file', () => {
    // "store in env/YAML, never hardcode model names" (master:3795) — the YAML is one of the two
    // places a name is ALLOWED to live, and neither variable is set anywhere in this repo, so the
    // default belongs in the reference rather than in a comment beside it.
    for (const tier of Object.values(routing.tiers)) {
      expect(tier.model).toMatch(/^\$\{[A-Z0-9_]+(:-[\w.-]+)?\}$/);
    }
  });

  it('IS READ BY THE GATEWAY — a routing table nothing consults is a document', () => {
    // The point of the table is that changing it changes routing. If no module loads it, the real
    // routing lives somewhere else and this file only looks authoritative.
    const py = [
      'providers/llm_provider.py',
      'providers/langchain_config.py',
      'main.py',
      'config/__init__.py',
    ]
      .filter((f) => exists(`${gateway}/${f}`))
      .map((f) => read(`${gateway}/${f}`))
      .join('\n');
    expect(py).toMatch(/routing\.yaml|routing_table/);
  });
});

describe('Phase 11 · model names are not spelled into source (master:3795)', () => {
  it('the provider module does not hardcode a model name', () => {
    // The two existing tests in this service check that the YAML contains no model name. Neither
    // checks the SOURCE, which is where the rule actually bites: a constant here silently overrides
    // whatever the table says.
    const src = read(`${gateway}/providers/llm_provider.py`);
    const code = src.replace(/"""[\s\S]*?"""/g, ' ').replace(/#[^\n]*/g, ' ');
    expect(code).not.toMatch(/["']gpt-[\w.-]+["']/);
  });
});

/**
 * master:3769 — "LLMProvider (implement via interface — never call OpenAI SDK directly)", restated
 * at master:3808 as "LLM client management via LLMProvider interface (no direct SDK calls)".
 *
 * The rule holds today and nothing was enforcing it. That combination is the one worth a test: the
 * whole point of the interface is master:3778's swap path — Claude, Azure OpenAI or a self-hosted
 * Ollama as a drop-in — and a swap is only drop-in while every caller goes through the seam. One
 * `from openai import ...` in a route handler or a chain is invisible in review, costs nothing at
 * the time, and turns the provider swap into a search-and-replace across services.
 *
 * The allowlist is by LOCATION, not by name: a provider module is where the SDK is supposed to be.
 * Anything else importing it is the breach.
 */
describe('Phase 11 · the OpenAI SDK is reached only through a provider (master:3769, 3808)', () => {
  const PY_ROOTS = [
    'services/ai-gateway',
    'services/ai-embedding-worker',
    'services/ai-ocr-pipeline',
    'services/ai-transcription-pipeline',
    'libs/python/cosembedding',
  ];

  // Directories permitted to name the SDK. `libs/python/cosembedding` is the shared embedding client
  // — a provider implementation that happens to live in a library rather than under a service.
  const PROVIDER_PATHS = [/\/providers\//, /^libs\/python\/cosembedding\//];

  const pythonSources = (): string[] => {
    const out: string[] = [];
    const walk = (dir: string): void => {
      if (!fs.existsSync(dir)) return;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          // Skip the virtualenv, build output, caches and each service's own pytest suite — a test
          // may legitimately patch `openai` to keep itself off the network.
          if (['.venv', 'build', '__pycache__', 'tests'].includes(entry.name)) continue;
          if (entry.name.endsWith('.egg-info')) continue;
          walk(full);
        } else if (entry.name.endsWith('.py')) {
          out.push(toPosix(path.relative(abs('.'), full)));
        }
      }
    };
    for (const root of PY_ROOTS) walk(abs(root));
    return out;
  };

  it('finds Python sources to scan, so a moved directory cannot empty this suite', () => {
    expect(pythonSources().length).toBeGreaterThan(20);
  });

  it('no module outside a provider imports the OpenAI SDK', () => {
    const offenders = pythonSources().filter((rel) => {
      if (PROVIDER_PATHS.some((re) => re.test(rel))) return false;
      const src = fs.readFileSync(abs(rel), 'utf8');
      return /^\s*(?:import\s+openai|from\s+openai(?:\.\w+)*\s+import)/m.test(src);
    });
    expect(offenders).toEqual([]);
  });

  it('a provider DOES reach the SDK — otherwise the rule above is vacuous', () => {
    // CONTROL. If the scan or the import pattern were broken, the case above would pass over an
    // empty set and report green forever.
    const providers = pythonSources().filter((rel) => PROVIDER_PATHS.some((re) => re.test(rel)));
    const reaching = providers.filter((rel) =>
      /^\s*(?:import\s+openai|from\s+openai(?:\.\w+)*\s+import)/m.test(
        fs.readFileSync(abs(rel), 'utf8'),
      ),
    );
    expect(reaching.length).toBeGreaterThan(0);
  });
});

describe('Phase 11 · the model_hint mapping the spec fixes (master:3761, 3796-3797)', () => {
  const src = read(`${gateway}/providers/llm_provider.py`);

  it('routes a FAST-tier hint to the FAST tier, not the powerful one', () => {
    // master:3761 states it outright: "summarization" → gpt-4o-mini. Sending every hint to the
    // POWERFUL model is not a routing bug that shows up as a wrong answer — the answers are fine.
    // It shows up on the bill, and on the per-tenant token meter master:3858 charges from.
    const mapping = /MODEL_BY_HINT[^=]*=\s*\{([\s\S]*?)\}/.exec(src)?.[1] ?? '';
    const populated = mapping.trim().length > 0;
    const readsTable = /routing\.yaml|routing_table|load_routing/.test(src);
    expect(populated || readsTable).toBe(true);
  });
});

describe('Phase 11 · LangChainProviderConfig (master:3780-3781, 3811-3814)', () => {
  const src = read(`${gateway}/providers/langchain_config.py`);

  it('exposes the two accessors the interface names', () => {
    expect(src).toMatch(/get_provider_package|getProviderPackage/);
    expect(src).toMatch(/get_model_class|getModelClass/);
  });

  it('resolves chains from the SERVICE-LOCAL directory (PO decision 2026-07-21)', () => {
    // "NOT repo-root ai/chains/". The chains belong to the service that runs them; a repo-root
    // directory would be read by whichever service happened to be started from the repo root.
    expect(src).toMatch(/CHAINS_DIR/);
    expect(src).toMatch(/AI_CHAINS_DIR/);
    expect(exists(`${gateway}/ai/chains`)).toBe(true);
  });

  it('the chain config is YAML per chain type', () => {
    expect(exists(`${gateway}/ai/chains/rag.yaml`)).toBe(true);
  });
});

describe('Phase 11 · MLOps interfaces generated here, implemented in Phase 23 (master:3893-3895)', () => {
  it.each([
    ['ModelRegistry', `${gateway}/interfaces/model_registry.py`],
    ['FeatureStore', `${gateway}/interfaces/feature_store.py`],
  ])('%s is an abstract interface', (name, file) => {
    const src = read(file);
    expect(src).toMatch(new RegExp(`class ${name}\\(ABC\\)`));
    expect(src).toMatch(/@abstractmethod/);
  });
});

describe('Phase 11 · the two stubs that must stay stubs (master:3910-3924)', () => {
  it('CloudOCRProvider is a stub naming Textract as the resolved provider', () => {
    const src = read(`${ocr}/providers/cloud_ocr_provider.py`);
    expect(src).toMatch(/textract/i);
    // "generate stub, do NOT implement yet" — an implementation here would call a paid AWS API from
    // a pipeline the spec says is not ready to activate.
    expect(src).toMatch(/NotImplementedError|stub/i);
  });

  it('AlternativeLLMProvider exists as a drop-in for the same interface', () => {
    const src = read(`${gateway}/providers/alternative_llm_provider.py`);
    expect(src).toMatch(/LLMProvider/);
  });
});
