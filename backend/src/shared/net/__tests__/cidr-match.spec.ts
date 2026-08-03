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
