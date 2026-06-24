import { decodeJwtPayload } from '../jwt';

function makeToken(payload: Record<string, unknown>): string {
  const b64 = Buffer.from(JSON.stringify(payload)).toString('base64url');
  return `header.${b64}.signature`;
}

describe('decodeJwtPayload', () => {
  it('decodes user_id / role / tenant_id claims from a token', () => {
    const token = makeToken({ user_id: 'u-1', role: 'SITE_WORKER', tenant_id: 't-1' });
    expect(decodeJwtPayload(token)).toMatchObject({
      user_id: 'u-1',
      role: 'SITE_WORKER',
      tenant_id: 't-1',
    });
  });

  it('returns {} for a malformed or empty token (never throws)', () => {
    expect(decodeJwtPayload('garbage')).toEqual({});
    expect(decodeJwtPayload('')).toEqual({});
    expect(decodeJwtPayload('only.two')).toEqual({});
  });
});
