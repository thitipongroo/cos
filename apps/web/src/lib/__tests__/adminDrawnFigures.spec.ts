import en from '../../i18n/en.json';
import th from '../../i18n/th.json';
import { DRAWN_COPY_KEYS, drawnFor, forTenant } from '../adminDrawnFigures';

describe('forTenant (D19)', () => {
  it('puts the open tenant code in every {code} of a drawn template', () => {
    expect(forTenant('secret/data/production/tenants/{code}', 'thai_rail_infra')).toBe(
      'secret/data/production/tenants/thai_rail_infra',
    );
    expect(forTenant('{code}-a / {code}-b', 'x')).toBe('x-a / x-b');
  });
  it('leaves a template without {code} as drawn', () => {
    expect(forTenant('99.98% ok', 'x')).toBe('99.98% ok');
  });
});

describe('drawnFor', () => {
  it('repeats the drawn examples over the real rows in order', () => {
    const drawn = ['a', 'b', 'c'];
    expect([0, 1, 2, 3, 4].map((i) => drawnFor(drawn, i))).toEqual(['a', 'b', 'c', 'a', 'b']);
  });
  it('is undefined with no examples and wraps a negative index', () => {
    expect(drawnFor([], 0)).toBeUndefined();
    expect(drawnFor(['a', 'b'], -1)).toBe('b');
  });
});

describe('DRAWN_COPY_KEYS', () => {
  const lookup = (dict: unknown, key: string): unknown =>
    key
      .split('.')
      .reduce<unknown>((node, part) => (node as Record<string, unknown> | undefined)?.[part], dict);
  it.each(DRAWN_COPY_KEYS)('%s exists in en and th', (key) => {
    expect(lookup(en, key)).toBeDefined();
    expect(lookup(th, key)).toBeDefined();
  });
});
