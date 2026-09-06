// One glyph from the Material Symbols font — the app's SECOND icon set, and deliberately narrow.
//
// WHY THIS EXISTS. All 84 icon call sites in this app draw from `@expo/vector-icons`' MaterialIcons,
// which is Google's OLDER set. Material Symbols is the newer one, and it carries marks the old set
// never had. The executive Tasks screen's risk heading asks for `temp_preferences_custom`, which is
// in Symbols and in no family bundled with `@expo/vector-icons` — checked against every glyphmap in
// the installed package, not assumed. Product-owner decision 2026-09-07: load the font rather than
// substitute a different mark.
//
// IT IS NOT A SECOND ICON SYSTEM. Two icon styles in one product is a worse outcome than one missing
// glyph, so this component exists to make every use of it countable: `grep MaterialSymbol` finds the
// complete list, and anything that MaterialIcons can draw must keep drawing from MaterialIcons.
//
// HOW IT RENDERS. Material Symbols is a LIGATURE font: the glyph name is written as ordinary text
// and the font's substitution table replaces the letters with the mark. There is no codepoint table
// to import and no icon-set wrapper — `<Text>` with the family is the whole mechanism. If the font
// has not loaded, the letters render instead of the glyph; `_layout.tsx` holds the first paint until
// `useFonts` resolves, so that window does not exist in the running app.

import { Text, type StyleProp, type TextStyle } from 'react-native';

/** The family name `useFonts` registered it under, in `app/_layout.tsx`. */
export const MATERIAL_SYMBOLS_FAMILY = 'MaterialSymbolsOutlined_400Regular';

export function MaterialSymbol({
  name,
  size,
  color,
  style,
  testID,
}: {
  /** The Symbols glyph name, exactly as Google writes it — `temp_preferences_custom`. */
  name: string;
  size: number;
  color: string;
  style?: StyleProp<TextStyle>;
  testID?: string;
}): React.JSX.Element {
  return (
    <Text
      testID={testID ?? `symbol-${name}`}
      // Decorative by default, like every other icon in this app: the text beside it carries the
      // meaning, and a screen reader announcing the ligature would read the glyph's NAME aloud.
      accessibilityElementsHidden
      importantForAccessibility="no"
      // `lineHeight` matched to `fontSize` so the glyph's box is square and sits on the row's centre
      // rather than on a text baseline with descender space under it.
      style={[
        { fontFamily: MATERIAL_SYMBOLS_FAMILY, fontSize: size, lineHeight: size, color },
        style,
      ]}
    >
      {name}
    </Text>
  );
}
