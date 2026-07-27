// LLM Gateway (§22.5 GW-001) — the single entrypoint every AI feature must call instead of a provider
// SDK directly, so token metering (§26), the per-tenant cost cap (§22.10 COST-001), and provider
// routing all live in one place.
//
// State of this build (ห้ามเดา — no fabricated calls):
//   - Metering + hard-cap enforcement are REAL and wired: complete() rejects at the 100 % cap and
//     records input/output tokens per tenant via AiUsageService.
//   - The provider adapter is a SEAM, not a live call. No provider is registered by default, so
//     complete() throws ServiceUnavailable until one is wired. Wiring the real OpenAI/Whisper adapter
//     (default models gpt-4o / gpt-4o-mini per §26) needs OPENAI_API_KEY (a secret) AND the LLM01
//     prompt-injection / LLM10 unbounded-consumption controls the §22 checklist requires before AI GA
//     — a deliberate follow-up, not something to stub with a fake response here.
//
// TODO(ai-ga): register OpenAiProvider (openai SDK) + Prometheus `llm_tokens_consumed_total` counter
// (§31); prom-client is not yet a dependency of this service.

import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { AiUsageService } from './ai-usage.service';

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface LlmCompletionRequest {
  model: string;
  messages: LlmMessage[];
}

export interface LlmCompletionResult {
  text: string;
  usage: { inputTokens: number; outputTokens: number };
}

/** A provider adapter (OpenAI, Anthropic, …). The gateway owns metering/caps; the provider only calls. */
export interface LlmProvider {
  chatCompletion(req: LlmCompletionRequest): Promise<LlmCompletionResult>;
}

@Injectable()
export class LlmGatewayService {
  /** Registered provider adapter; null until a real one is wired (see file header). */
  private provider: LlmProvider | null = null;

  constructor(private readonly usage: AiUsageService) {}

  /** Wire a provider adapter (called from module setup once OPENAI_API_KEY + security review land). */
  registerProvider(provider: LlmProvider): void {
    this.provider = provider;
  }

  /**
   * The single metered entrypoint. Enforces the hard cap BEFORE the call (COST-001), runs the provider,
   * then records the tokens it reports (§26 metering). Throws if no provider is wired yet.
   */
  async complete(req: LlmCompletionRequest): Promise<LlmCompletionResult> {
    if (await this.usage.isOverHardCap()) {
      throw new ServiceUnavailableException(
        'AI monthly token quota exhausted for this tenant (COST-001 hard cap). Contact your admin.',
      );
    }
    if (!this.provider) {
      throw new ServiceUnavailableException(
        'LLM provider not configured — OPENAI_API_KEY + provider adapter pending (see LlmGatewayService).',
      );
    }
    const result = await this.provider.chatCompletion(req);
    await this.usage.recordUsage(req.model, result.usage.inputTokens, result.usage.outputTokens);
    return result;
  }
}
