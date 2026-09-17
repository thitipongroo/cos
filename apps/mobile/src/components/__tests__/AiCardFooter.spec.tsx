// The project's standard AI-card foot (spec §32.7).
//
// Written on 2026-09-09, when `bodyHasAction` was added; rewritten 2026-09-17 (R22, D38) when it was
// withdrawn. The rules asserted here: a null confidence draws no CONF half, and the chevron — the
// card's ONE way in — is always drawn and always presses.

import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
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
      onPress={jest.fn()}
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

  it('always draws exactly one chevron, with or without a confidence', async () => {
    // PO decision 2026-09-17 (D38): the footer chevron is every AI card's one way in.
    expect(chevrons((await renderFoot()).toJSON())).toBe(1);
    expect(chevrons((await renderFoot({ percent: null })).toJSON())).toBe(1);
  });

  it('is always a button, and pressing it runs the one way in', async () => {
    // `onPress` is required: before R22, 15 of 16 footers drew a chevron that opened nothing.
    const onPress = jest.fn();
    const { getByRole } = await renderFoot({ onPress });

    await fireEvent.press(getByRole('button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(getByRole('button')).toHaveTextContent(/SOURCE: THE SUKHUMVIT 45 RESIDENCES/);
  });
});
