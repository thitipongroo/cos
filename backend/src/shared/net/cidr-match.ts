// Minimal IPv4/IPv6 CIDR matching — no new dependency for what is a few lines of bit arithmetic.
//
// Used by CloudflareWafMiddleware to check the TCP peer address against the trusted edge ranges.
// Both families matter: Cloudflare publishes IPv4 and IPv6 ranges and an origin routinely accepts
// connections over either. Node reports an IPv4 peer on a dual-stack listener as the IPv4-mapped
// form `::ffff:1.2.3.4`, so that shape is normalised back to IPv4 rather than compared as v6.
//
// Everything is normalised to (value: bigint, bits: 32 | 128). A malformed address or prefix returns
// null and never matches — this code gates access, so "unparseable" must mean "denied", not "allowed".

interface ParsedIp {
  value: bigint;
  bits: 32 | 128;
}

const IPV4_MAPPED_PREFIX = /^::ffff:/i;

function parseIpv4(ip: string): bigint | null {
  const parts = ip.split('.');
  if (parts.length !== 4) return null;
  let value = 0n;
  for (const part of parts) {
    // Reject '', '1e2', '+1', and leading zeros ('010' is octal in some parsers — ambiguity here is
    // a bypass primitive, so only canonical decimal is accepted).
    if (!/^(0|[1-9]\d{0,2})$/.test(part)) return null;
    const octet = Number(part);
    if (octet > 255) return null;
    value = (value << 8n) | BigInt(octet);
  }
  return value;
}

function parseIpv6(ip: string): bigint | null {
  // At most one '::' may appear.
  const halves = ip.split('::');
  if (halves.length > 2) return null;

  const expand = (segment: string): string[] => (segment === '' ? [] : segment.split(':'));
  let head = expand(halves[0] ?? '');
  let tail = halves.length === 2 ? expand(halves[1] ?? '') : [];

  // A trailing dotted-quad ('::ffff:1.2.3.4', '64:ff9b::1.2.3.4') occupies the last two groups.
  const groups = halves.length === 2 ? tail : head;
  const last = groups[groups.length - 1];
  if (last !== undefined && last.includes('.')) {
    const v4 = parseIpv4(last);
    if (v4 === null) return null;
    const hi = (v4 >> 16n) & 0xffffn;
    const lo = v4 & 0xffffn;
    const replaced = [...groups.slice(0, -1), hi.toString(16), lo.toString(16)];
    if (halves.length === 2) tail = replaced;
    else head = replaced;
  }

  const total = head.length + tail.length;
  if (total > 8) return null;
  // Without '::' the address must be fully specified.
  if (halves.length === 1 && total !== 8) return null;
  const middle = new Array<string>(8 - total).fill('0');

  let value = 0n;
  for (const group of [...head, ...middle, ...tail]) {
    if (!/^[0-9a-f]{1,4}$/i.test(group)) return null;
    value = (value << 16n) | BigInt(parseInt(group, 16));
  }
  return value;
}

/** Parse an IPv4 or IPv6 address. Returns null when it is not a canonical address. */
export function parseIp(ip: string): ParsedIp | null {
  const trimmed = ip.trim();
  if (trimmed === '') return null;

  // `::ffff:1.2.3.4` is an IPv4 peer surfaced through a dual-stack socket — compare it as IPv4 so it
  // matches an IPv4 CIDR in the allowlist.
  if (IPV4_MAPPED_PREFIX.test(trimmed)) {
    const v4 = parseIpv4(trimmed.replace(IPV4_MAPPED_PREFIX, ''));
    if (v4 !== null) return { value: v4, bits: 32 };
  }

  if (trimmed.includes(':')) {
    const v6 = parseIpv6(trimmed);
    return v6 === null ? null : { value: v6, bits: 128 };
  }

  const v4 = parseIpv4(trimmed);
  return v4 === null ? null : { value: v4, bits: 32 };
}

/** True when `ip` falls inside `cidr`. Any parse failure — either side — is a non-match. */
export function ipInCidr(ip: string, cidr: string): boolean {
  const slash = cidr.lastIndexOf('/');
  if (slash === -1) return false;

  const network = parseIp(cidr.slice(0, slash));
  const parsedIp = parseIp(ip);
  if (!network || !parsedIp) return false;
  // An IPv4 address is never inside an IPv6 range (and vice versa).
  if (network.bits !== parsedIp.bits) return false;

  const prefixText = cidr.slice(slash + 1);
  if (!/^\d{1,3}$/.test(prefixText)) return false;
  const prefix = Number(prefixText);
  if (prefix > network.bits) return false;

  // Host bits masked off on both sides, so a sloppy '10.0.0.5/8' still behaves as '10.0.0.0/8'.
  const hostBits = BigInt(network.bits - prefix);
  return network.value >> hostBits === parsedIp.value >> hostBits;
}

/** True when `ip` falls inside any of `cidrs`. An empty list matches nothing. */
export function ipInAnyCidr(ip: string, cidrs: readonly string[]): boolean {
  return cidrs.some((cidr) => ipInCidr(ip, cidr));
}

/** Parse a comma-separated CIDR list from configuration, dropping blank entries. */
export function parseCidrList(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter((entry) => entry !== '');
}
