// Jest mock for 'expo-camera'.
//
// The real module loads expo-modules-core (native runtime, throws on import off-device). Only
// <CameraView> and useCameraPermissions() are used, both from components/PhotoCapture.tsx.
//
// Permission is granted by default: a test that renders a photo-capture surface wants the capture
// UI, not the permission prompt. A spec that needs the denied path can jest.mock() this per-file.

import { forwardRef } from 'react';
import { View } from 'react-native';

export const CameraView = forwardRef<unknown, { children?: React.ReactNode; testID?: string }>(
  function CameraView({ children, testID }, _ref) {
    return <View testID={testID ?? 'camera-view'}>{children}</View>;
  },
);

export function useCameraPermissions(): [
  { granted: boolean } | null,
  () => Promise<{ granted: boolean }>,
] {
  return [{ granted: true }, async () => ({ granted: true })];
}
