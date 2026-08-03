// Fastify `trustProxy` resolution (security review F3).
//
// WHY THIS EXISTS
// ---------------
// Without `trustProxy`, Fastify reports `request.ip` as the TCP peer — which behind Cloudflare/an ALB
// is the EDGE, not the caller. @nestjs/throttler's default tracker keys on `request.ip`, so every user
// arriving through the same edge address shared ONE rate-limit bucket: the `@Throttle({limit: 10})`
// brute-force guard on /auth stopped being per-IP, and a single attacker could exhaust the bucket for
// everyone behind that edge. The same address is what `@Ip()` and `platform.audit_logs.ip_address`
// record, so those were logging the edge too.
//
// WHY IT IS NOT SIMPLY `true`
// ---------------------------
// `trustProxy: true` trusts `X-Forwarded-For` from ANY peer, and that header is caller-supplied — an
// attacker reaching the origin directly would then choose their own rate-limit bucket per request,
// which is strictly worse than the shared-bucket bug. Trust is therefore granted only to peers inside
// TRUSTED_PROXY_CIDRS — the SAME allowlist CloudflareWafMiddleware already checks the peer against, so
// there is one place to configure the edge ranges rather than two that can drift.
//
// This also implements the QM-4 mandate "use CF-Connecting-IP as real IP": Cloudflare sets
// `X-Forwarded-For` alongside `CF-Connecting-IP`, and Fastify derives `request.ip` from the former once
// the peer is trusted.
//
// DEFAULT IS OFF. An unset/empty TRUSTED_PROXY_CIDRS returns `false`, preserving today's behaviour
// exactly — this must never fail open, and an operator who has not yet supplied the edge ranges gets
// the old shared-bucket behaviour rather than a spoofable one.

import { ipInAnyCidr, parseCidrList } from './cidr-match';

/**
 * The value to pass as FastifyAdapter's `trustProxy`.
 *
 * Returns `false` when no trusted ranges are configured, otherwise a predicate Fastify calls per hop
 * while walking `X-Forwarded-For` right-to-left. Returning `true` means "this address is one of OUR
 * proxies, keep walking left"; the first address that is not trusted becomes `request.ip`.
 */
export function resolveTrustProxy(
  rawCidrs: string | undefined = process.env['TRUSTED_PROXY_CIDRS'],
): false | ((address: string) => boolean) {
  const cidrs = parseCidrList(rawCidrs);
  if (cidrs.length === 0) return false;
  return (address: string): boolean => ipInAnyCidr(address, cidrs);
}
