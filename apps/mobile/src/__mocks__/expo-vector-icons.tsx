// Jest mock for '@expo/vector-icons'.
//
// The real package reaches expo-font -> expo-modules-core, which needs the native runtime and throws
// at import time off-device. 79 import sites across the app use exactly one export, MaterialIcons
// (verified by grep), so one stub covers all of them.
//
// It renders a Text node carrying the glyph name so a test can assert WHICH icon a screen drew —
// rendering nothing would make every icon indistinguishable and quietly weaken those assertions.

import { Text } from 'react-native';

export function MaterialIcons({
  name,
  testID,
}: {
  name: string;
  size?: number;
  color?: string;
  style?: unknown;
  testID?: string;
}) {
  return <Text testID={testID ?? `icon-${name}`}>{name}</Text>;
}
