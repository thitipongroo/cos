// Unit tests for the CIDR matcher. This code gates origin access, so the important cases are the
// NEGATIVE ones: anything unparseable, ambiguous or cross-family must fail closed.

import { ipInCidr, ipInAnyCidr, parseCidrList, parseIp } from '../cidr-match';

describe('ipInCidr — IPv4', () => {
  it.each([
    ['173.245.48.10', '173.245.48.0/20', true],
    ['173.245.63.255', '173.245.48.0/20', true],
    ['173.245.64.0', '173.245.48.0/20', false],
    ['173.245.47.255', '173.245.48.0/20', false],
    ['10.1.2.3', '10.0.0.0/8', true],
    ['11.1.2.3', '10.0.0.0/8', false],
    ['1.2.3.4', '0.0.0.0/0', true],
    ['1.2.3.4', '1.2.3.4/32', true],
    ['1.2.3.5', '1.2.3.4/32', false],
  ])('%s in %s → %s', (ip, cidr, expected) => {
    expect(ipInCidr(ip, cidr)).toBe(expected);
  });

  it('masks host bits off the network side (10.0.0.5/8 behaves as 10.0.0.0/8)', () => {
    expect(ipInCidr('10.9.9.9', '10.0.0.5/8')).toBe(true);
  });
});

describe('ipInCidr — IPv6', () => {
  it.each([
    ['2400:cb00::1', '2400:cb00::/32', true],
    ['2400:cb01::1', '2400:cb00::/32', false],
    ['2606:4700:4700::1111', '2606:4700::/32', true],
    ['::1', '::1/128', true],
    ['2400:cb00:0000:0000:0000:0000:0000:0001', '2400:cb00::/32', true],
  ])('%s in %s → %s', (ip, cidr, expected) => {
    expect(ipInCidr(ip, cidr)).toBe(expected);
  });

  // Node reports an IPv4 peer on a dual-stack listener in this form; it must match IPv4 ranges.
  it('treats an IPv4-mapped address as IPv4', () => {
    expect(parseIp('::ffff:173.245.48.10')?.bits).toBe(32);
    expect(ipInCidr('::ffff:173.245.48.10', '173.245.48.0/20')).toBe(true);
    expect(ipInCidr('::ffff:8.8.8.8', '173.245.48.0/20')).toBe(false);
  });

  it('never matches across address families', () => {
    expect(ipInCidr('1.2.3.4', '::/0')).toBe(false);
    expect(ipInCidr('2400:cb00::1', '0.0.0.0/0')).toBe(false);
  });

  // A trailing dotted-quad occupies the LAST TWO 16-bit groups. The `::ffff:` fast path in parseIp
  // short-circuits the common dual-stack shape before parseIpv6 ever sees it, so this embedded-IPv4
  // branch was reachable only through the forms below — and was entirely uncovered.
  describe('embedded IPv4 in an IPv6 address', () => {
    it('expands a dotted quad after :: (NAT64 well-known prefix)', () => {
      // 64:ff9b::192.0.2.33 — RFC 6052. The quad becomes c000:0221, so it sits inside 64:ff9b::/96.
      expect(parseIp('64:ff9b::192.0.2.33')?.bits).toBe(128);
      expect(ipInCidr('64:ff9b::192.0.2.33', '64:ff9b::/96')).toBe(true);
      expect(ipInCidr('64:ff9b::192.0.2.33', '2400:cb00::/32')).toBe(false);
    });

    it('expands a dotted quad with no :: at all (fully written form)', () => {
      // The same address as ::ffff:1.2.3.4 but spelled out, so parseIp's mapped fast path does not
      // fire and parseIpv6 must replace the last group in `head` rather than `tail`.
      expect(parseIp('0:0:0:0:0:ffff:1.2.3.4')?.bits).toBe(128);
      expect(ipInCidr('0:0:0:0:0:ffff:1.2.3.4', '::ffff:0:0/96')).toBe(true);
    });

    it('rejects an address with more than 8 groups', () => {
      // 9 groups — over-long addresses must fail closed rather than being truncated to the first 8.
      expect(parseIp('1:2:3:4:5:6:7:8:9')).toBeNull();
      expect(ipInCidr('1:2:3:4:5:6:7:8:9', '::/0')).toBe(false);
      // Also over-long once the embedded quad expands into two groups.
      expect(parseIp('1:2:3:4:5:6:7:8:1.2.3.4')).toBeNull();
    });

    it('fails closed when the embedded quad is not a valid IPv4 address', () => {
      // 999 is out of range — must be a non-match, never a partial parse (this code gates access).
      expect(parseIp('64:ff9b::192.0.2.999')).toBeNull();
      expect(ipInCidr('64:ff9b::192.0.2.999', '64:ff9b::/96')).toBe(false);
      expect(parseIp('0:0:0:0:0:ffff:1.2.3.256')).toBeNull();
    });
  });
});

describe('ipInCidr — fails closed', () => {
  it.each([
    ['not-an-ip', '10.0.0.0/8'],
    ['', '10.0.0.0/8'],
    ['10.0.0.1', 'not-a-cidr'],
    ['10.0.0.1', '10.0.0.0'], // no prefix
    ['10.0.0.1', '10.0.0.0/33'], // prefix wider than the family
    ['10.0.0.1', '10.0.0.0/abc'],
    ['999.1.1.1', '0.0.0.0/0'],
    ['1.2.3', '0.0.0.0/0'],
    ['1.2.3.4.5', '0.0.0.0/0'],
    ['2400::cb00::1', '::/0'], // two '::' groups
    ['2400:cb00:1', '::/0'], // short, no '::'
    ['2400:cb00::gggg', '::/0'],
  ])('rejects %s against %s', (ip, cidr) => {
    expect(ipInCidr(ip, cidr)).toBe(false);
  });

  // '010' is octal under some parsers; accepting it would let 010.0.0.1 masquerade as 8.0.0.1.
  it('rejects non-canonical decimal octets', () => {
    expect(parseIp('010.0.0.1')).toBeNull();
    expect(parseIp('1e2.0.0.1')).toBeNull();
    expect(parseIp('+1.0.0.1')).toBeNull();
  });
});

describe('ipInAnyCidr / parseCidrList', () => {
  it('matches when any range contains the address', () => {
    const ranges = ['173.245.48.0/20', '2400:cb00::/32'];
    expect(ipInAnyCidr('173.245.48.1', ranges)).toBe(true);
    expect(ipInAnyCidr('2400:cb00::5', ranges)).toBe(true);
    expect(ipInAnyCidr('8.8.8.8', ranges)).toBe(false);
  });

  it('an empty allowlist matches nothing', () => {
    expect(ipInAnyCidr('1.2.3.4', [])).toBe(false);
  });

  it('parses and trims a comma-separated list, dropping blanks', () => {
    expect(parseCidrList(' 10.0.0.0/8 , ,2400:cb00::/32,')).toEqual([
      '10.0.0.0/8',
      '2400:cb00::/32',
    ]);
    expect(parseCidrList(undefined)).toEqual([]);
    expect(parseCidrList('')).toEqual([]);
  });
});
