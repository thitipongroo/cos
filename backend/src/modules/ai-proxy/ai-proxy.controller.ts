// `/api/v1/ai/*` and `/api/v1/rag/*` → the AI Gateway (TDD OQ-46).
//
// WHY THIS EXISTS
// ---------------
// Both apps call these paths — `apps/web/src/app/(app)/reports/page.tsx` posts to
// `/ai/reports/executive-summary`, `apps/mobile/src/api/ai.ts` posts to four of them — and the web
// page's own comment says "Kong routes /api/v1/ai → ai-gateway". It does not. That route exists only
// in `infrastructure/kubernetes/kong/kong-declarative.yml`, which no ArgoCD Application references;
// there are no `KongPlugin` CRDs, no chart carries an Ingress template, and the repository's only
// `kind: Ingress` names `ingressClassName: nginx`. The AI Gateway is `ClusterIP` with no Ingress of
// its own, so in the deployed topology the whole Phase 11/12 AI surface had no route at all.
//
// Product-owner decision 2026-08-22: route it through the backend rather than stand up the gateway.
// The backend already terminates auth, RBAC, rate limiting, audit and tracing for every other path;
// putting AI behind the same door means those apply to it too, and the clients change nothing —
// the gateway serves the same `/api/v1/ai/...` paths this controller receives.
//
// WHAT IT FORWARDS, AND WHAT IT DOES NOT
// --------------------------------------
// The caller's own bearer token goes through untouched. That is the point: the gateway verifies it
// independently (`auth.py` → RS256 via JWKS, tenant from the `tenant_id` claim), so the tenant is
// established twice from the same cryptographic fact and this proxy is never trusted to assert it.
// It deliberately does NOT send `x-tenant-id`, and the gateway would no longer accept one on its own
// in any case — the header-only path was removed in the same change.
//
// Not forwarded: hop-by-hop headers, `host` (it belongs to the backend's own vhost), and
// `content-length` (the body is re-serialised, so a copied length can only be wrong).
//
// Streaming is not supported and does not need to be: every gateway route declares a
// `response_model`, so all of them answer with one JSON document.

import { All, Controller, HttpException, HttpStatus, Req, UseGuards } from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { createLogger } from '@cos/logger';
import { JwtAuthGuard } from '../../shared/guards/jwt-auth.guard';

const logger = createLogger('ai-proxy');

/**
 * Only what the proxy reads. Structural rather than `FastifyRequest`, because `fastify` is not a
 * direct dependency of this package — the rest of the backend types `@Req()` as an Express `Request`
 * for the same reason, even though it runs on the Fastify adapter.
 */
interface ProxyRequest {
  method: string;
  /** Path AND query string, exactly as received. */
  url: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

/**
 * Generous, because these calls wait on a model. The gateway's own provider timeout is 30 s
 * (`config/routing.yaml` `defaults.timeout_seconds`) and it retries up to 3 times, so a ceiling
 * below ~100 s would cut off a request the gateway was still legitimately working on.
 */
const PROXY_TIMEOUT_MS = 120_000;

/** Headers that describe THIS hop and must not be copied to the next one. */
const HOP_BY_HOP = new Set([
  'host',
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
  'content-length',
]);

// `'ai/*'`, not `'ai/*path'`. The Fastify adapter's router (find-my-way) requires the wildcard to be
// the LAST character and throws "Wildcard must be the last character in the route" at app.init()
// otherwise — the named form is Express/path-to-regexp syntax. Caught by the route-matching cases in
// __tests__, which boot the real adapter for exactly this reason.
@ApiTags('AI')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller()
export class AiProxyController {
  private readonly baseUrl =
    process.env['AI_GATEWAY_URL'] ?? 'http://cos-ai-gateway.cos.svc.cluster.local:8000';

  @All('ai/*')
  @ApiOperation({ summary: 'AI Gateway — completions, intent, transcribe, reports, usage' })
  @ApiResponse({ status: 200, description: "The gateway's response, passed through unchanged" })
  @ApiResponse({ status: 502, description: 'COS-AI-502 — the gateway is unreachable' })
  @ApiResponse({ status: 504, description: 'COS-AI-504 — the gateway did not answer in time' })
  ai(@Req() req: ProxyRequest): Promise<unknown> {
    return this.forward(req);
  }

  @All('rag/*')
  @ApiOperation({ summary: 'AI Gateway — retrieval-augmented query' })
  @ApiResponse({ status: 200, description: "The gateway's response, passed through unchanged" })
  rag(@Req() req: ProxyRequest): Promise<unknown> {
    return this.forward(req);
  }

  private async forward(req: ProxyRequest): Promise<unknown> {
    // req.url carries the path AND the query string, and the gateway serves the same `/api/v1/...`
    // prefix this controller receives — so the path passes through unaltered rather than being
    // rebuilt from parts, which is where a proxy usually loses a query parameter.
    const url = `${this.baseUrl}${req.url}`;

    const headers: Record<string, string> = {};
    for (const [key, value] of Object.entries(req.headers)) {
      if (HOP_BY_HOP.has(key.toLowerCase())) continue;
      if (typeof value === 'string') headers[key] = value;
    }

    const hasBody = req.method !== 'GET' && req.method !== 'HEAD' && req.body !== undefined;
    if (hasBody) headers['content-type'] = 'application/json';

    let res: Response;
    try {
      res = await fetch(url, {
        method: req.method,
        headers,
        body: hasBody ? JSON.stringify(req.body) : undefined,
        signal: AbortSignal.timeout(PROXY_TIMEOUT_MS),
      });
    } catch (err) {
      const timedOut = (err as Error).name === 'TimeoutError';
      logger.error({ err: (err as Error).message, url: req.url, timedOut }, 'ai-proxy.failed');
      throw new HttpException(
        {
          error: {
            code: timedOut ? 'COS-AI-504' : 'COS-AI-502',
            message: timedOut ? 'AI Gateway timed out' : 'AI Gateway unreachable',
          },
        },
        timedOut ? HttpStatus.GATEWAY_TIMEOUT : HttpStatus.BAD_GATEWAY,
      );
    }

    const text = await res.text();
    let payload: unknown;
    try {
      payload = text === '' ? null : JSON.parse(text);
    } catch {
      // The gateway answers JSON on every route; anything else means it is not the gateway
      // answering — a sidecar, a proxy error page — and passing it through as a body would present
      // that as an AI result.
      logger.error({ status: res.status, url: req.url }, 'ai-proxy.non-json-response');
      throw new HttpException(
        { error: { code: 'COS-AI-502', message: 'AI Gateway returned a non-JSON response' } },
        HttpStatus.BAD_GATEWAY,
      );
    }

    if (!res.ok) {
      // Pass the gateway's status and body straight through: its 503 kill-switch (COS-FLAG-001), its
      // 401 and its 422 all mean something specific to the client, and collapsing them into a 502
      // would lose it.
      throw new HttpException(payload as Record<string, unknown>, res.status);
    }

    return payload;
  }
}
