// The project's standard AI-card foot (spec §32.7).
//
// Written on 2026-09-09, when `bodyHasAction` was added. The component had been covered only through
// the nine screens that mount it, which meant the rules it exists to enforce — a null confidence
// draws no CONF half, the chevron goes when the body already has one — were asserted nowhere in one
// place, and each screen's spec could only see its own case.

import React from 'react';
import { render } from '@testing-library/react-native';
import { AiCardFooter } from '../AiCardFooter';
import { paletteFor } from '../../theme/palette';

const p = paletteFor('dark');

// AWAITED at every call site, like every other spec in this suite: `render` here returns a
// thenable, and destructuring it without awaiting yields an object with no queries on it.
async function renderFoot(over: Partial<React.ComponentProps<typeof AiCardFooter>> = {}) {
  return render(
    <AiCardFooter
      testID="foot"
      percent={94}
      source="THE SUKHUMVIT 45 RESIDENCES"
      confLabel="CONF"
      sourceLabel="SOURCE"
      palette={p}
      {...over}
    />,
  );
}

/** The chevron is hidden from the accessibility tree, so it is found by its rendered glyph name. */
function chevrons(json: unknown): number {
  return JSON.stringify(json).split('"chevron-right"').length - 1;
}

describe('AiCardFooter', () => {
  it('prints the confidence before the source', async () => {
    const { getByTestId } = await renderFoot();

    expect(getByTestId('foot')).toHaveTextContent(/CONF: 94%/);
    expect(getByTestId('foot')).toHaveTextContent(/SOURCE: THE SUKHUMVIT 45 RESIDENCES/);
  });

  it('draws no CONF half at all when there is no model behind the card', async () => {
    // Never "CONF: —", never a zero: a deterministic card has no confidence to report, and printing
    // one would claim a model that never ran (ADR-099, third amendment).
    const { getByTestId } = await renderFoot({ percent: null });

    expect(getByTestId('foot')).not.toHaveTextContent(/CONF/);
    expect(getByTestId('foot')).toHaveTextContent(/SOURCE/);
  });

  it('draws the trailing chevron by default', async () => {
    const { toJSON } = await renderFoot();

    expect(chevrons(toJSON())).toBe(1);
  });

  it('drops the chevron when the body already offers one', async () => {
    // PO decision 2026-09-09 — one card, one way onward. A body with a filled action has already
    // said what to do next, and a second arrow in the foot competes with it.
    const { toJSON } = await renderFoot({ bodyHasAction: true });

    expect(chevrons(toJSON())).toBe(0);
  });

  it('keeps the rest of the row when the chevron goes', async () => {
    // The flag removes ONE glyph. Losing the source with it would be the expensive version of this
    // bug, because the source is the half that decides how much of the card a reader believes.
    const { getByTestId } = await renderFoot({ bodyHasAction: true });

    expect(getByTestId('foot')).toHaveTextContent(/CONF: 94%/);
    expect(getByTestId('foot')).toHaveTextContent(/SOURCE: THE SUKHUMVIT 45 RESIDENCES/);
  });

  it('is a plain view without onPress, and a button with it', async () => {
    // `bodyHasAction` and `onPress` are independent: a card can have a body button AND a pressable
    // foot, which is why the component does not infer one from the other.
    const { queryByRole } = await renderFoot();
    expect(queryByRole('button')).toBeNull();

    const pressable = await renderFoot({ onPress: jest.fn(), bodyHasAction: true });
    expect(pressable.queryByRole('button')).not.toBeNull();
    expect(chevrons(pressable.toJSON())).toBe(0);
  });
});
