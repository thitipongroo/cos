// Behaviour of the signature pad, pinned before its stroke capture is shared with PhotoAnnotation.
//
// The rule worth protecting is the one its own comment states: a TAP IS NOT A STROKE. Two points
// are the minimum that draws a line, and committing a single point would mark the pad "signed" on
// an accidental touch — on a safety checklist, that is an attestation nobody made.

import { render, fireEvent } from '@testing-library/react-native';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import type { PanGesture } from 'react-native-gesture-handler';
import { I18nProvider } from '../../i18n';
import { SignaturePad } from '../SignaturePad';
import type { AnnotationStroke } from '../PhotoAnnotation';

function renderPad(strokes: AnnotationStroke[] = []) {
  const onChange = jest.fn();
  const utils = render(
    <I18nProvider>
      <SignaturePad
        strokes={strokes}
        onChange={onChange}
        signerName="Somchai P."
        testID="signature-pad"
      />
    </I18nProvider>,
  );
  return { onChange, utils };
}

/** The pad measures itself on layout; without a size every point normalises to 0. */
async function layout(getByTestId: (id: string) => Parameters<typeof fireEvent>[0]) {
  await fireEvent(getByTestId('signature-pad-canvas'), 'layout', {
    nativeEvent: { layout: { width: 300, height: 160 } },
  });
}

describe('SignaturePad', () => {
  it('renders the pad and its clear control', async () => {
    const { utils } = renderPad();
    const { getByTestId } = await utils;

    expect(getByTestId('signature-pad')).toBeTruthy();
    expect(getByTestId('signature-clear')).toBeTruthy();
  });

  it('commits a stroke when the drag covers more than one point', async () => {
    const { onChange, utils } = renderPad();
    const { getByTestId } = await utils;
    await layout(getByTestId);

    fireGestureHandler<PanGesture>(getByGestureTestId('signature-pad-pan'), [
      { x: 10, y: 10 },
      { x: 40, y: 60 },
      { x: 90, y: 100 },
    ]);

    expect(onChange).toHaveBeenCalledTimes(1);
    const committed = onChange.mock.calls[0][0] as AnnotationStroke[];
    expect(committed).toHaveLength(1);
    expect(committed[0].d).toMatch(/^M/);
  });

  it('commits nothing for a tap — one point is not a stroke', async () => {
    const { onChange, utils } = renderPad();
    const { getByTestId } = await utils;
    await layout(getByTestId);

    fireGestureHandler<PanGesture>(getByGestureTestId('signature-pad-pan'), [{ x: 10, y: 10 }]);

    expect(onChange).not.toHaveBeenCalled();
  });

  it('appends to the strokes it was given rather than replacing them', async () => {
    const existing: AnnotationStroke[] = [{ d: 'M0,0 L1,1', color: '#fff', width: 0.006 }];
    const { onChange, utils } = renderPad(existing);
    const { getByTestId } = await utils;
    await layout(getByTestId);

    fireGestureHandler<PanGesture>(getByGestureTestId('signature-pad-pan'), [
      { x: 10, y: 10 },
      { x: 40, y: 60 },
    ]);

    const committed = onChange.mock.calls[0][0] as AnnotationStroke[];
    expect(committed).toHaveLength(2);
    expect(committed[0]).toEqual(existing[0]);
  });

  it('clears every stroke when the clear control is pressed', async () => {
    const { onChange, utils } = renderPad([{ d: 'M0,0 L1,1', color: '#fff', width: 0.006 }]);
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('signature-clear'));

    expect(onChange).toHaveBeenCalledWith([]);
  });
});
