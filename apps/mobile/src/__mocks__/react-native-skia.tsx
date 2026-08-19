// Jest mock for '@shopify/react-native-skia'.
//
// Skia publishes its own jestSetup, but it requires `global.CanvasKit`, which only its jestEnv
// testEnvironment installs — and that environment is built on the jest 29 line this project cannot
// run (see jest.render.config.ts). The surface actually used is small and entirely presentational:
// PhotoAnnotation and SignaturePad draw strokes with it and read nothing back.
//
// The canvas renders its children so a test can still assert on the non-Skia parts of those screens;
// the drawing primitives render nothing, because a stroke has no text or testID to assert on anyway.

import { View } from 'react-native';
import type { ReactNode } from 'react';

export function Canvas({ children, style }: { children?: ReactNode; style?: unknown }) {
  return (
    <View testID="skia-canvas" style={style as never}>
      {children}
    </View>
  );
}

export function Group({ children }: { children?: ReactNode }) {
  return <>{children}</>;
}

export function Path(_props: unknown) {
  return null;
}

export function Image(_props: unknown) {
  return null;
}

/** A chainable no-op path — callers only build and stringify these. */
function makePath() {
  const path = {
    moveTo: () => path,
    lineTo: () => path,
    quadTo: () => path,
    close: () => path,
    toSVGString: () => '',
    copy: () => makePath(),
    transform: () => path,
  };
  return path;
}

function makeMatrix() {
  const matrix = {
    identity: () => matrix,
    translate: () => matrix,
    scale: () => matrix,
    concat: () => matrix,
    get: () => [1, 0, 0, 0, 1, 0, 0, 0, 1],
  };
  return matrix;
}

export const Skia = {
  Path: { Make: makePath, MakeFromSVGString: makePath },
  Matrix: makeMatrix,
};

export function useCanvasRef() {
  return { current: null };
}

export function useImage(_source?: unknown) {
  return null;
}

export type SkImage = unknown;
