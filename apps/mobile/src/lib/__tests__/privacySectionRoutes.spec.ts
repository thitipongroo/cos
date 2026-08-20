// Every policy section has a screen behind it — the third of the registry guards, alongside
// routeRegistry.spec.ts and authStackRegistry.spec.ts, and the same technique: read the two files
// and compare them, rather than import a component to check a list that is plain text.
//
// WHY A GUARD AND NOT A TYPE. `(auth)/privacy-policy.tsx` maps section id → route explicitly rather
// than interpolating `/(auth)/privacy-${id}`, and its header says why: the ids are the policy's own
// vocabulary (`compliance`, `security`, `rights`) while the routes are named for what the mockup
// calls the screens (`pdpa-gdpr`, `technical-security`, `user-rights`), so three of the five would
// be broken routes under interpolation. The header also says a renamed section is a type error.
//
// THAT IS ONLY HALF TRUE, AND THIS FILE IS THE OTHER HALF. The lookup is
// `SECTION_ROUTE[id as keyof typeof SECTION_ROUTE]`, so RENAMING a section makes the map's key
// unreachable — caught — but ADDING a sixth section does not: the cast admits any string, the lookup
// returns undefined, the `route !== undefined` guard swallows it, and the new row is a card that
// looks exactly like the five above it and does nothing when pressed. On a PDPA notice, the section
// that silently leads nowhere is as likely to be `rights` as any other.
//
// The guard branch that swallows it is unreachable today precisely because these two lists agree.
// Nothing was keeping them that way until this file.

import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const SRC = join(__dirname, '..', '..');

const documentSource = readFileSync(join(SRC, 'components', 'PrivacyPolicyDocument.tsx'), 'utf8');
const preAuthSource = readFileSync(join(SRC, 'app', '(auth)', 'privacy-policy.tsx'), 'utf8');

/** The section ids the document renders, in the order it draws them. */
function documentSections(): string[] {
  const block = /const SECTIONS: readonly PolicySection\[\] = \[([\s\S]*?)\n\];/.exec(
    documentSource,
  );
  return block === null ? [] : [...block[1]!.matchAll(/^\s{4}id: '([^']+)'/gm)].map((m) => m[1]!);
}

/** The ids the pre-auth screen knows a route for. */
function mappedSections(): string[] {
  const block = /const SECTION_ROUTE = \{([\s\S]*?)\n\} as const;/.exec(preAuthSource);
  return block === null ? [] : [...block[1]!.matchAll(/^\s{2}(\w+):/gm)].map((m) => m[1]!);
}

/** The routes it maps them to. */
function mappedRoutes(): string[] {
  const block = /const SECTION_ROUTE = \{([\s\S]*?)\n\} as const;/.exec(preAuthSource);
  return block === null ? [] : [...block[1]!.matchAll(/: '([^']+)'/g)].map((m) => m[1]!);
}

describe('every policy section has a screen behind it', () => {
  it('finds both lists, so an empty read cannot pass silently', () => {
    expect(documentSections().length).toBeGreaterThan(0);
    expect(mappedSections().length).toBeGreaterThan(0);
  });

  // THE ONE THE TYPE SYSTEM CANNOT SEE. A sixth section draws a card that looks like the five above
  // it and does nothing when pressed, because the cast admits the id and the lookup returns
  // undefined.
  it('maps every section the document renders', () => {
    const unmapped = documentSections().filter((id) => !mappedSections().includes(id));

    expect(unmapped).toEqual([]);
  });

  // And the other way: a key for a section that no longer exists is a route nobody can reach and a
  // line the next reader believes.
  it('maps no section the document does not render', () => {
    const sections = documentSections();
    const orphaned = mappedSections().filter((id) => !sections.includes(id));

    expect(orphaned).toEqual([]);
  });

  // The routes are DELIBERATELY not the ids — that is the whole reason the map exists rather than a
  // template. If they ever all match, someone has renamed the screens and the map has become the
  // interpolation it was written to avoid.
  it('keeps naming the screens for what the mockup calls them', () => {
    const interpolatable = mappedSections().every((id) =>
      mappedRoutes().includes(`/(auth)/privacy-${id}`),
    );

    expect(interpolatable).toBe(false);
  });

  // Each route exists as a file in the group. authStackRegistry.spec.ts already checks that every
  // (auth) file is declared on the stack; this checks the other direction for these five — a mapped
  // route with no file is a push to nowhere.
  it('maps only routes that exist as screens', () => {
    const missing = mappedRoutes().filter(
      (route) => !existsSync(join(SRC, 'app', '(auth)', `${route.replace('/(auth)/', '')}.tsx`)),
    );

    expect(missing).toEqual([]);
  });
});
