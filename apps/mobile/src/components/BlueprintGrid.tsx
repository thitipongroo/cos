// BlueprintGrid — a faint technical grid backdrop for the SITE_ENGINEER home (ADR-071).
//
// §32.7 prohibits blueprint imagery + glow in the signed-in app, with one exception: the pre-auth
// entry screens may use the "technical / mission-critical" motif (gear + cyan glow). ADR-071 extends
// that same motif — by explicit PO decision (2026-07-25) — to this one signed-in landing screen.
//
// Purely decorative: absolutely filled behind the screen content, pointerEvents="none" so it never
// intercepts a scroll or tap, and drawn at a low alpha so cards read on top of it.

import { StyleSheet, View } from 'react-native';
import Svg, { Defs, Pattern, Path, Rect } from 'react-native-svg';
import { darkColors } from '../theme/tokens';

// Grid cell size in px. Small enough to read as a drafting grid, large enough not to look like noise.
const CELL = 28;

export function BlueprintGrid() {
  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none" testID="blueprint-grid">
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern id="blueprint-grid" width={CELL} height={CELL} patternUnits="userSpaceOnUse">
            {/* One cell: a top edge + a left edge. Tiled, these form the full grid. */}
            <Path
              d={`M ${CELL} 0 L 0 0 0 ${CELL}`}
              fill="none"
              stroke={darkColors.cyan}
              strokeWidth={0.5}
              strokeOpacity={0.08}
            />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill="url(#blueprint-grid)" />
      </Svg>
    </View>
  );
}
