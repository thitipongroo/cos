// The deep-link query path, held to what fix/mobile-audit (2026-11-12) relied on.
//
// apps/mobile overrides decode-uri-component to 0.5.1 under query-string 7.1.3 (GHSA-qr28-fpjm-wq7f;
// register docs/registers/dependency-advisories-2026-11.md). 0.5.1 is ESM-only, so query-string's
// `parse` — which decodes through it — throws, as on the root (branch 1c). That is acceptable only
// because nothing the app runs calls it:
//  - deep links go through expo-router's own getStateFromPath (build/fork), which reads the query with
//    URLSearchParams; react-navigation's, which calls queryString.parse, is only the fallback when a
//    linking config passes none. expo-router's getLinkingConfig passes one (getLinkingConfig.js →
//    link/linking → fork/getStateFromPath, read in expo-router 56.2.22); that wiring is not tested
//    here — the first test pins the function it points to;
//  - building a path back (getPathFromState) uses queryString.stringify, which never decodes.
// If expo-router starts parsing queries with query-string in that function, or the override stops
// applying, a test here fails first. Only jest.render.config.ts transforms decode-uri-component, so
// a unit-config spec that imports query-string would not load.

import queryString from 'query-string';
// Internal module paths: the point is to pin the exact code the linking config calls.
import { getStateFromPath } from 'expo-router/build/fork/getStateFromPath';

type Route = { name: string; params?: Record<string, unknown>; state?: { routes: Route[] } };

function leaf(route: Route): Route {
  return route.state ? leaf(route.state.routes[route.state.routes.length - 1]!) : route;
}

describe('deep-link query parsing', () => {
  it('decodes the query of a deep link without query-string', () => {
    const state = getStateFromPath('/search?q=a%20b%C3%A9&tag=x&tag=y', {
      screens: { search: 'search' },
    }) as unknown as { routes: Route[] };

    const route = leaf(state.routes[0]!);
    expect(route.name).toBe('search');
    expect(route.params).toMatchObject({ q: 'a bé' });
  });

  it("query-string's stringify, which getPathFromState uses, still works", () => {
    expect(queryString.stringify({ q: 'a b', n: 1 }, { sort: false })).toBe('q=a%20b&n=1');
  });

  // Documents the cost of the override; if this starts passing, the override no longer applies.
  it("query-string's parse throws with the overridden decode-uri-component", () => {
    expect(() => queryString.parse('q=a%20b')).toThrow(TypeError);
  });
});
