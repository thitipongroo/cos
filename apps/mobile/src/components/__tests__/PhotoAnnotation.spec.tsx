// Behaviour of the photo annotator, pinned before its stroke capture is shared with SignaturePad.
//
// Same rule as the pad — a tap is not a stroke — plus the two controls that only exist here: undo
// removes the LAST stroke (one undo step per stroke, which is why a stroke is committed at
// pointer-up rather than per move) and clear removes all of them.

import { render, fireEvent, act } from '@testing-library/react-native';
import { fireGestureHandler, getByGestureTestId } from 'react-native-gesture-handler/jest-utils';
import type { PanGesture } from 'react-native-gesture-handler';
import { I18nProvider } from '../../i18n';
import { PhotoAnnotation, type AnnotationStroke } from '../PhotoAnnotation';

function renderAnnotator(initialStrokes: AnnotationStroke[] = []) {
  const onSave = jest.fn();
  const utils = render(
    <I18nProvider>
      <PhotoAnnotation
        photoUri="file:///photos/defect.jpg"
        initialStrokes={initialStrokes}
        onSave={onSave}
      />
    </I18nProvider>,
  );
  return { onSave, utils };
}

/**
 * fireGestureHandler is synchronous and this component commits the finished stroke to STATE (unlike
 * the signature pad, which calls its onChange straight through). Without act the update is still
 * pending when the next press reads it, and the save handler sees the previous stroke list.
 */
async function drag(points: { x: number; y: number }[]) {
  await act(async () => {
    fireGestureHandler<PanGesture>(getByGestureTestId('photo-annotation-pan'), points);
  });
}

const STROKE_A: AnnotationStroke = { d: 'M0,0 L1,1', color: '#FF3B30', width: 0.006 };
const STROKE_B: AnnotationStroke = { d: 'M1,1 L2,2', color: '#FF3B30', width: 0.006 };

describe('PhotoAnnotation', () => {
  it('renders the annotator and its three controls', async () => {
    const { utils } = renderAnnotator();
    const { getByTestId } = await utils;

    expect(getByTestId('photo-annotation')).toBeTruthy();
    expect(getByTestId('annotate-undo')).toBeTruthy();
    expect(getByTestId('annotate-clear')).toBeTruthy();
    expect(getByTestId('annotate-save')).toBeTruthy();
  });

  it('keeps a drag of more than one point as a stroke', async () => {
    const { onSave, utils } = renderAnnotator();
    const { getByTestId } = await utils;

    await drag([
      { x: 10, y: 10 },
      { x: 50, y: 80 },
      { x: 120, y: 140 },
    ]);
    await fireEvent.press(getByTestId('annotate-save'));

    const saved = onSave.mock.calls[0][0] as AnnotationStroke[];
    expect(saved).toHaveLength(1);
    expect(saved[0].d).toMatch(/^M/);
  });

  it('keeps nothing for a tap — one point is not a stroke', async () => {
    const { onSave, utils } = renderAnnotator();
    const { getByTestId } = await utils;

    await drag([{ x: 10, y: 10 }]);
    await fireEvent.press(getByTestId('annotate-save'));

    expect(onSave.mock.calls[0][0]).toEqual([]);
  });

  it('starts from the strokes it was given', async () => {
    const { onSave, utils } = renderAnnotator([STROKE_A, STROKE_B]);
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('annotate-save'));

    expect(onSave.mock.calls[0][0]).toEqual([STROKE_A, STROKE_B]);
  });

  it('undoes the last stroke only', async () => {
    const { onSave, utils } = renderAnnotator([STROKE_A, STROKE_B]);
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('annotate-undo'));
    await fireEvent.press(getByTestId('annotate-save'));

    expect(onSave.mock.calls[0][0]).toEqual([STROKE_A]);
  });

  it('clears every stroke', async () => {
    const { onSave, utils } = renderAnnotator([STROKE_A, STROKE_B]);
    const { getByTestId } = await utils;

    await fireEvent.press(getByTestId('annotate-clear'));
    await fireEvent.press(getByTestId('annotate-save'));

    expect(onSave.mock.calls[0][0]).toEqual([]);
  });
});
