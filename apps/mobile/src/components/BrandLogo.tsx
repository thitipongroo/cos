// BrandLogo — the CONSTRUCTION OS wordmark, rendered crisp at any size: the hexagon mark is a vector
// (react-native-svg) and the wordmark + tagline are native <Text> (Inter Tight), so nothing is a scaled
// raster. Geometry + colours are taken verbatim from assets/cos_logo/construction_os_logo_final.html.
//
// `variant` follows the shell it sits on: 'dark' → light-text logo (dark shell), 'light' → dark-text
// logo (light shell). `showTagline` adds the "AI-NATIVE CONSTRUCTION PLATFORM" line (drop it where the
// bar is too short for it to read).

import { View, Text, StyleSheet } from 'react-native';
import Svg, { Polygon, Rect } from 'react-native-svg';
import { fontFamily } from '../theme/tokens';

// Hexagon mark palette (construction_os_logo_final.html). Both variants carry the concept's #2563EB
// (System blue) border — the doc puts it on the light-shell mark + the "Dark" app-icon variant.
const MARK = {
  dark: { poly: '#0B1020', stroke: '#2563EB', bar: '#F8FAFC', accent: '#06B6D4' },
  light: { poly: '#0F172A', stroke: '#2563EB', bar: '#94A3B8', accent: '#06B6D4' },
};
// Wordmark / tagline colours. The dark-shell tagline is lifted from the doc's #475569 to #64748B so it
// stays legible on the top-bar surface (#0F172A) rather than the doc's near-black backdrop (#020617).
const TEXT = {
  dark: { main: '#F8FAFC', os: '#22D3EE', tag: '#64748B' },
  light: { main: '#0B1020', os: '#2563EB', tag: '#64748B' },
};

/**
 * Hexagon height as a multiple of the nominal `height`. One constant, so every call site (top bar,
 * Quick-Add sheet) shifts together and the wordmark scale is untouched.
 */
const MARK_SCALE = 1.32;

export function BrandLogo({
  variant = 'light',
  height = 26,
  showTagline = true,
}: {
  variant?: 'light' | 'dark';
  height?: number;
  showTagline?: boolean;
}) {
  const onDark = variant === 'dark';
  const m = onDark ? MARK.dark : MARK.light;
  const c = onDark ? TEXT.dark : TEXT.light;
  // The mark is drawn TALLER than the nominal `height` (PO decision 2026-08-04: "the icon is a bit
  // small — make it bigger so it balances the text"). `height` sets the type scale, and the hexagon
  // is sized off it rather than being equal to it.
  //
  // Why it looked small at 1.0: the mark's viewBox is 80×92, so at parity with `height` it renders
  // ~13% NARROWER than it is tall, while the text beside it is a two-line block (wordmark + tagline)
  // whose total height already matched the mark. Measured off the 1080-wide capture: mark 60px vs a
  // 67px text block. At 1.32 the hexagon reads as the dominant element it is meant to be, and its
  // width (~1.15 × height) finally exceeds the single-line cap height it sits against.
  const markH = Math.round(height * MARK_SCALE);
  const markW = Math.round((markH * 80) / 92); // mark viewBox is 80×92
  const wmSize = Math.round(height * 0.54); // wordmark scales with the logo height

  return (
    <View style={styles.row}>
      <Svg width={markW} height={markH} viewBox="0 0 80 92">
        <Polygon
          points="40,6 74.64,26 74.64,66 40,86 5.36,66 5.36,26"
          fill={m.poly}
          stroke={m.stroke}
          strokeWidth={m.stroke != null ? 1.5 : 0}
        />
        <Rect x="14" y="29" width="52" height="7.5" rx="1" fill={m.bar} />
        <Rect x="14" y="43" width="52" height="7.5" rx="1" fill={m.bar} />
        <Rect x="14" y="57" width="17" height="7.5" rx="1" fill={m.accent} />
        <Rect x="34" y="57" width="32" height="7.5" rx="1" fill={m.bar} />
      </Svg>
      <View style={styles.textCol}>
        <Text style={[styles.wm, { fontSize: wmSize }]} numberOfLines={1}>
          <Text style={{ color: c.main }}>CONSTRUCTION</Text>
          <Text style={{ color: c.os }}> OS</Text>
        </Text>
        {showTagline ? (
          <Text
            style={[styles.tg, { color: c.tag, fontSize: Math.max(6, Math.round(height * 0.24)) }]}
            numberOfLines={1}
          >
            AI-NATIVE CONSTRUCTION PLATFORM
          </Text>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // flexShrink + minWidth:0 so the logo YIELDS when the bar is tight instead of overflowing its
  // container. React Native does not clip overflow by default, so without this an over-wide brand row
  // is drawn straight over whatever sits to its right — which is exactly how the top bar's sync pill
  // ended up on top of the cyan "OS" once the pill became universal (fixed 2026-08-04). With it, the
  // wordmark ellipsizes as a visible last resort rather than silently colliding.
  row: { flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1, minWidth: 0 },
  textCol: { justifyContent: 'center', flexShrink: 1, minWidth: 0 },
  wm: { fontFamily: fontFamily.medium, letterSpacing: 1.6, lineHeight: undefined },
  tg: { fontFamily: fontFamily.regular, letterSpacing: 1.4, marginTop: 2 },
});
