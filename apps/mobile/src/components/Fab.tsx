// <Fab /> — the circular "+" a list screen floats over its bottom-right corner.
//
// Six screens drew it identically: a 56px primary circle with a 28px glyph, labelled for a screen
// reader because a "+" says nothing aloud. Extracted 2026-08-20; the style itself is
// `screenChrome(p).fab`, which the screens still spread for their own sheets.
//
// The icon is a prop because one caller toggles it: the incident screen's button opens the compose
// form and then closes it, and a close button drawn as a "+" would be lying about what it does.

import { useMemo } from 'react';
import { TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { usePalette } from '../theme/usePalette';
import { screenChrome } from '../theme/screenStyles';
import { useTenantReadOnly } from '../hooks/useTenantReadOnly';

interface Props {
  testID: string;
  /** Spoken label — required, because the glyph carries no meaning for a screen reader. */
  accessibilityLabel: string;
  onPress: () => void;
  icon?: keyof typeof MaterialIcons.glyphMap;
}

export function Fab({
  testID,
  accessibilityLabel,
  onPress,
  icon = 'add',
}: Props): React.JSX.Element | null {
  const p = usePalette();
  const style = useMemo(() => screenChrome(p).fab, [p]);
  // §7.10: once a free trial has ended the tenant is read-only. Every `+` in the app is this component — the list
  // screens' create, and the Home screens' quick-action menus — so hiding it here removes them all at once.
  const readOnly = useTenantReadOnly();
  if (readOnly) return null;

  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={[style, { backgroundColor: p.primary }]}
    >
      <MaterialIcons name={icon} size={28} color={p.onPrimary} />
    </TouchableOpacity>
  );
}
