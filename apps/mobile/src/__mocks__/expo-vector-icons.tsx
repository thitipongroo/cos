// Jest mock for '@expo/vector-icons'.
//
// The real package reaches expo-font -> expo-modules-core, which needs the native runtime and throws
// at import time off-device. 79 import sites across the app use exactly one export, MaterialIcons
// (verified by grep), so one stub covers all of them.
//
// It renders a Text node carrying the glyph name so a test can assert WHICH icon a screen drew —
// rendering nothing would make every icon indistinguishable and quietly weaken those assertions.
//
// `accessibilityLabel` is forwarded (2026-08-20) because for some controls the icon IS the
// accessible name: <SyncPill /> is a bare glyph in the top bar and puts its label on the icon
// itself, so a stub that dropped the prop made the one thing a screen-reader user gets from that
// component untestable.

import { Text } from 'react-native';

export function MaterialIcons({
  name,
  testID,
  accessibilityLabel,
}: {
  name: string;
  size?: number;
  color?: string;
  style?: unknown;
  testID?: string;
  accessibilityLabel?: string;
}) {
  return (
    <Text testID={testID ?? `icon-${name}`} accessibilityLabel={accessibilityLabel}>
      {name}
    </Text>
  );
}
