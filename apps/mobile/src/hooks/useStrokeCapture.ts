// useStrokeCapture — the pan-gesture half of a drawing surface.
//
// PhotoAnnotation and SignaturePad had the same twenty-odd lines: begin a stroke, collect normalised
// points while the finger moves, and commit at pointer-up — bumping a counter at each step so the
// in-flight stroke redraws. They differ only in what they do with the finished stroke (one calls its
// caller's onChange, the other appends to its own state) and in the colour they draw it, which is
// why the commit is a callback rather than something this hook decides.
//
// The rule this owns, and the reason it is worth having one copy of: A TAP IS NOT A STROKE. Two
// points are the minimum that draws a line, and committing a single point would mark a signature pad
// "signed" on an accidental touch — on a safety checklist, an attestation nobody made.

import { useMemo, useRef, useState } from 'react';
import { Gesture } from 'react-native-gesture-handler';
import type { PanGesture } from 'react-native-gesture-handler';
import { Skia } from '@shopify/react-native-skia';
import type { SkPath } from '@shopify/react-native-skia';

export interface StrokePoint {
  x: number;
  y: number;
}

/** The minimum number of points that makes a line rather than a tap. */
export const MIN_STROKE_POINTS = 2;

export interface StrokeCapture {
  /** Attach to a <GestureDetector>. */
  pan: PanGesture;
  /** Changes on every gesture event — hang the live stroke's `key` off it so it redraws. */
  liveKey: number;
  /** The in-flight stroke's normalised points. Read during render; never written by the caller. */
  drawing: React.RefObject<StrokePoint[]>;
}

export function useStrokeCapture({
  norm,
  onCommit,
  testId,
}: {
  /** Screen coordinates → the 0..1 space strokes are stored in. */
  norm: (x: number, y: number) => StrokePoint;
  /** Called once per finished stroke, with at least MIN_STROKE_POINTS points. */
  onCommit: (points: StrokePoint[]) => void;
  /**
   * Names the gesture for react-native-gesture-handler's fireGestureHandler. A drawing surface has
   * no other handle a test can reach, so this is not optional decoration.
   */
  testId: string;
}): StrokeCapture {
  const drawing = useRef<StrokePoint[]>([]);
  const [liveKey, setLiveKey] = useState(0);

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .withTestId(testId)
        .runOnJS(true)
        .onBegin((e) => {
          drawing.current = [norm(e.x, e.y)];
          setLiveKey((k) => k + 1);
        })
        .onUpdate((e) => {
          drawing.current.push(norm(e.x, e.y));
          setLiveKey((k) => k + 1);
        })
        .onEnd(() => {
          const points = drawing.current;
          drawing.current = [];
          if (points.length < MIN_STROKE_POINTS) {
            setLiveKey((k) => k + 1);
            return;
          }
          // Committed at a pointer-up boundary, which is what makes one undo step equal one stroke.
          onCommit(points);
          setLiveKey((k) => k + 1);
        }),
    [norm, onCommit, testId],
  );

  return { pan, liveKey, drawing };
}

/**
 * Scale a normalised path into the pixel space it is being drawn in.
 *
 * Strokes are STORED normalised — every coordinate in 0..1 — so a signature captured on a phone
 * replays correctly on a tablet, and so the stored string does not change when a layout does. This
 * is the other end of that: multiply back up by the surface's measured width and height.
 *
 * An unparseable string yields an EMPTY path rather than throwing. The caller is a render pass; a
 * corrupt stroke should cost that one stroke, not the screen.
 */
export function denormalisePath(d: string, w: number, h: number): SkPath {
  const path = Skia.Path.MakeFromSVGString(d);
  if (!path) return Skia.Path.Make();
  const m = Skia.Matrix();
  m.scale(w, h);
  path.transform(m);
  return path;
}
