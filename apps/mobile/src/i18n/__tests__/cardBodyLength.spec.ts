// Card detail text stays at two or three rendered lines (PO decision 2026-08-06).
//
// WHY A CHARACTER BUDGET RATHER THAN A LINE COUNT. Nothing here can render text, so the real
// measure — how many lines a string occupies inside a card — is unavailable to a unit test. What is
// available is the input to it. Measured off `01-identity.png` at 1080px: a NavCard body, which
// sits between a 44px icon tile and a chevron, fits 42–48 characters per line, so three lines is
// roughly 140 characters. The budget is the proxy; the mockups are the reason.
//
// The mockups run one to two lines per card (`01_data_collection/**`). The screens had drifted to
// four and five — `transparency.portal.retentionBody` was 306 characters — which is also what left
// the card icons looking stranded at the top of a tall block.
//
// Scope is `*Body` / `*.body` / `*.desc`: the explanatory paragraph under a card title. Titles,
// labels, error text and policy prose are not cards and are not measured.
//
// THIS IS THE EDITORIAL RULE, NOT THE GUARANTEE. `CARD_BODY_LINES` in TransparencyKit clamps the
// render to three lines with an ellipsis, which holds under Thai, a larger system font and a narrow
// handset — none of which a character count can see. The budget exists so that clamp never has to
// fire: an ellipsis on a transparency screen hides the thing the reader opened it for.

import en from '../en.json';
import th from '../th.json';

/** Three lines at the 42–48 characters per line a card body actually gets. */
const MAX = 140;

type Tree = { [key: string]: string | Tree };

function flatten(tree: Tree, prefix = ''): Array<[string, string]> {
  const out: Array<[string, string]> = [];
  for (const [key, value] of Object.entries(tree)) {
    const path = prefix === '' ? key : `${prefix}.${key}`;
    if (typeof value === 'string') out.push([path, value]);
    else out.push(...flatten(value, path));
  }
  return out;
}

function cardBodies(bundle: Tree): Array<[string, string]> {
  return flatten(bundle).filter(([path]) => {
    const lower = path.toLowerCase();
    return lower.endsWith('body') || lower.endsWith('.desc');
  });
}

describe.each([
  ['en', en as unknown as Tree],
  ['th', th as unknown as Tree],
])('card body length (%s)', (_locale, bundle) => {
  const bodies = cardBodies(bundle);

  it('finds the card bodies it is meant to be guarding', () => {
    // Guards the guard: a renamed key convention would make the assertion below pass on an empty
    // list, and the budget would quietly stop being enforced.
    expect(bodies.length).toBeGreaterThan(100);
  });

  it('keeps every card body inside three rendered lines', () => {
    const over = bodies
      .filter(([, text]) => text.length > MAX)
      .map(([path, text]) => `${path} (${text.length})`);
    expect(over).toEqual([]);
  });
});
