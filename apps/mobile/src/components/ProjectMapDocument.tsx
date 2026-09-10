// Project Map — where the portfolio's sites are, as the VIEWER's drawing shows them.
//
// DRAWING: mockup/mobile/role_viewer/03_map/01_map_viewer (Stitch screen "Project Map - Viewer
// (Fixed View)").
//
// REDRAWN 2026-09-11 — one of the four this role's set gained that day. The header became the app's
// real <TopBar />; the pin labels put name and state on ONE line, the state now reading `• ON TRACK`
// / `• DELAYED`; each sheet row gained a dotted state chip and a round chevron; the issue counts
// gained a word (`3 minor`, `12 alerts`) and a glyph per tone; and the sheet header gained a
// `keyboard_arrow_up`. Its bottom nav is UNCHANGED — still `Projects · Daily Logs · Map ·
// Directory`, which is one of the two drawings in this set that never adopted the enumerated bar,
// and is exactly why this screen is a drawer row rather than a tab.
//
// THE SHEET'S STATE CHIP READS THE SAME WORDS AS THE PINS. The drawing writes `TRACK` on the first
// row's chip and `• ON TRACK` on the same site's pin — one state, two labels, in one picture. The
// pins' wording is used in both places rather than a third label being invented for a chip six
// hundred pixels below the first (ADR-085: composition is the implementation's).
//
// ── THERE IS NO MAP BEHIND THIS MAP, AND THAT IS A DECISION RATHER THAN AN OMISSION ─────────────
//
// `docs/specifications/28-ecosystem-expansion.md` lists the GIS engine under "Stack Additions
// Required" as "Esri / Mapbox / OpenLayers — decide at V2-1 entry", and V2-1's entry criteria are
// "V1 Phase 4 metrics + 18 months stable". `apps/mobile` has no map library; `expo-location` is a
// dependency with zero imports anywhere in `src/`. `projects.projects` holds no coordinate either —
// the geo columns added by `20260705000001_geo_coordinates` are on site reports, issues, photos and
// check-ins, not on the project.
//
// The drawing is not an interactive map either. It is a stock photograph with three
// absolutely-positioned pins on top, four control buttons that do nothing, and a sheet listing two
// sites. Escalated to the product owner on 2026-09-10 with the choice of drawing it as drawn or
// deferring the screen to V2-1; the answer was to draw it, on the condition that no GIS engine is
// adopted and §28's decision is left untouched. This file adopts none.
//
// WHAT STANDS IN FOR THE PHOTOGRAPH: nothing. A recessed canvas with the drawing's own bottom
// gradient, and the pins on it. The photograph is precisely the part §28 defers, and the two
// substitutes available were both worse — a stock image would assert a place this platform has no
// coordinate for, and a drafting grid is the blueprint motif the brand guide prohibits in the
// signed-in app (ADR-071 extends that exception to ONE screen, the Site Engineer's home, and
// extending it further is a decision nobody has made).
//
// WHAT IS DRAWN (lib/mockupFigures.ts, ADR-099):
//   VIEWER_MAP_PINS   every pin's position, label and tone. Positions, not coordinates.
//   VIEWER_MAP_SITES  the "3 VISIBLE" count and the two sheet rows, with their completion
//                     percentages and issue counts.
//
// THE FOUR MAP CONTROLS ARE DRAWN AND SAY SO ON A PRESS — zoom in, zoom out, recentre and layers.
// Each needs the GIS engine above; none prints anything standing on the page.
//
// NO HEADER OR BOTTOM NAV OF ITS OWN. The drawing has both; the shell supplies them, and this
// screen is reached from the navigation drawer rather than from a tab (PO decision 2026-09-10 —
// VIEWER's enumerated bar is unchanged).

import { useCallback, useMemo } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Defs, LinearGradient, Rect, Stop } from 'react-native-svg';
import { useComingSoon } from './useComingSoon';
import { VIEWER_MAP_PINS, VIEWER_MAP_SITES } from '../lib/mockupFigures';
import { useT } from '../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette, type Palette } from '../theme/usePalette';

/** The control stack, top to bottom, exactly as the drawing stacks it. */
const CONTROLS = [
  { id: 'zoom-in', icon: 'add', labelKey: 'map.viewer.zoomIn' },
  { id: 'zoom-out', icon: 'remove', labelKey: 'map.viewer.zoomOut' },
  { id: 'locate', icon: 'my-location', labelKey: 'map.viewer.recentre' },
  { id: 'layers', icon: 'layers', labelKey: 'map.viewer.layers' },
] as const;

/** Pin body sizes. The drawing draws two labelled pins large and one unlabelled pin smaller. */
const PIN = { large: 34, small: 26 } as const;

/** The width a pin and its label are centred within. Wide enough for the longest drawn label. */
const PIN_BOX = 180;

export function ProjectMapDocument(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const soon = useComingSoon();

  const toneColor = useCallback(
    (tone: 'success' | 'warning') => (tone === 'success' ? p.success : p.warning),
    [p],
  );

  return (
    <View testID="project-map" style={styles.root}>
      <View style={styles.canvas}>
        {/* The drawing's bottom scrim — the map fades into the page before the sheet meets it. */}
        <Svg style={StyleSheet.absoluteFill} pointerEvents="none">
          <Defs>
            <LinearGradient id="map-scrim" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0" stopColor={p.bg} stopOpacity="0" />
              <Stop offset="0.6" stopColor={p.bg} stopOpacity="0.4" />
              <Stop offset="1" stopColor={p.bg} stopOpacity="0.9" />
            </LinearGradient>
          </Defs>
          <Rect width="100%" height="100%" fill="url(#map-scrim)" />
        </Svg>

        <View style={styles.controlStack}>
          {CONTROLS.map((control) => (
            <Pressable
              key={control.id}
              testID={`map-control-${control.id}`}
              accessibilityRole="button"
              accessibilityLabel={t(control.labelKey)}
              onPress={() => soon(control.labelKey)}
              style={styles.control}
            >
              <MaterialIcons name={control.icon} size={20} color={p.text} />
            </Pressable>
          ))}
        </View>

        {VIEWER_MAP_PINS.value.map((pin, index) => {
          const side = PIN[pin.size];
          const color = toneColor(pin.tone);
          return (
            <View
              key={`${pin.label ?? 'pin'}-${index}`}
              testID={`map-pin-${index}`}
              style={[
                styles.pin,
                { top: `${pin.top * 100}%`, left: `${pin.left * 100}%` },
                pin.label === null && styles.pinPlain,
              ]}
              pointerEvents="none"
            >
              {/* The teardrop: a square with three round corners, turned 45°, so the un-rounded
                  corner becomes the point. The drawing builds it exactly this way. */}
              <View
                style={[
                  styles.pinBody,
                  { width: side, height: side, borderRadius: side / 2, borderColor: color },
                ]}
              >
                <View style={[styles.pinCore, { backgroundColor: color }]} />
              </View>
              {pin.label === null ? null : (
                <View style={[styles.pinLabel, { borderColor: color }]}>
                  <Text style={styles.pinLabelText}>{pin.label}</Text>
                  <Text style={[styles.pinLabelState, { color }]}>
                    {t('map.viewer.dotState', { state: t(`map.viewer.state.${pin.tone}`) })}
                  </Text>
                </View>
              )}
            </View>
          );
        })}
      </View>

      {/* THE SHEET. A panel, not a modal: §32.7 forbids modal-on-modal and this is the screen's own
          content rather than something over it. The grab handle is drawn because the drawing draws
          one; it does not drag, and the list inside scrolls instead. */}
      <View testID="map-sheet" style={styles.sheet}>
        <View style={styles.handleRow}>
          <View style={styles.handle} />
        </View>

        <View style={styles.sheetHead}>
          <View style={styles.sheetTitleRow}>
            <MaterialIcons name="explore" size={18} color={p.muted} />
            <Text style={styles.sheetTitle}>{t('map.viewer.activeSites')}</Text>
          </View>
          <View style={styles.sheetHeadTrail}>
            <View style={styles.countChip}>
              <Text style={styles.countText}>
                {t('map.viewer.visible', { count: VIEWER_MAP_SITES.value.visible })}
              </Text>
            </View>
            {/* DRAWN, and it does not collapse anything. The sheet is a fixed panel — a drag
                handle on a panel that cannot be dragged is the drawn dead control this project
                keeps refusing to ship, so the glyph is decoration and carries no press. */}
            <MaterialIcons name="keyboard-arrow-up" size={20} color={p.muted} />
          </View>
        </View>

        {/* THE LIST SCROLLS, AND THE FIRST CAPTURE PROVED IT HAS TO. The sheet is capped so the map
            above it stays a map, and at that cap the second site row was cut off mid-figure with no
            way to reach it — its completion bar and issue count were simply not on the screen. The
            drawing labels this region "List Content (Scrollable)"; it now is one. */}
        <ScrollView
          testID="map-sheet-list"
          contentContainerStyle={styles.sheetBody}
          showsVerticalScrollIndicator={false}
        >
          {VIEWER_MAP_SITES.value.rows.map((row) => {
            const color = toneColor(row.tone as 'success' | 'warning');
            return (
              <Pressable
                key={row.ref}
                testID={`map-site-${row.ref}`}
                accessibilityRole="button"
                accessibilityLabel={row.name}
                // The row carries a round chevron plate, so it is a control. No per-site screen
                // exists for this role, so it says so on the press — the same treatment the
                // project cards on `/projects` get, and the opposite of the grab handle above,
                // which is ornament on a panel that cannot be dragged.
                onPress={() => soon('map.viewer.siteDetail')}
                style={[styles.siteRow, { borderLeftColor: color }]}
              >
                <View style={styles.siteHead}>
                  <View style={styles.siteTitleBlock}>
                    <Text style={styles.siteName} numberOfLines={1} ellipsizeMode="tail">
                      {row.name}
                    </Text>
                    <Text style={styles.siteMeta} numberOfLines={1}>
                      {t('map.viewer.siteRef', {
                        ref: row.ref,
                        category: t(`project.viewer.category.${row.category}`),
                      })}
                    </Text>
                  </View>
                  <View style={styles.siteHeadTrail}>
                    <View style={[styles.statusChip, { borderColor: color }]}>
                      <View style={[styles.statusDot, { backgroundColor: color }]} />
                      <Text style={[styles.statusText, { color }]}>
                        {t(`map.viewer.state.${row.tone}`)}
                      </Text>
                    </View>
                    <View style={styles.chevronCircle}>
                      <MaterialIcons name="chevron-right" size={18} color={p.muted} />
                    </View>
                  </View>
                </View>

                <View style={styles.siteFacts}>
                  <View style={styles.factCell}>
                    <Text style={styles.factLabel}>{t('map.viewer.completion')}</Text>
                    <View style={styles.factValueRow}>
                      <Text style={styles.factValue}>{`${row.completion}%`}</Text>
                      <View style={styles.factTrack}>
                        <View
                          style={[
                            styles.factFill,
                            { width: `${row.completion}%`, backgroundColor: color },
                          ]}
                        />
                      </View>
                    </View>
                  </View>

                  {/* THE COUNT CARRIES A WORD NOW — `3 minor`, `12 alerts` — and the glyph goes
                      with it: a tick where the site is on track, a warning where it is not. Keyed
                      on the row's TONE rather than on the number, so the two can never disagree. */}
                  <View style={[styles.factCell, styles.factCellDivided]}>
                    <Text style={styles.factLabel}>{t('map.viewer.activeIssues')}</Text>
                    <View style={styles.factValueRow}>
                      <MaterialIcons
                        name={row.tone === 'success' ? 'check-circle' : 'warning'}
                        size={16}
                        color={color}
                      />
                      <Text style={styles.factValue}>
                        {t(`map.viewer.issueCount.${row.tone}`, { count: row.issues })}
                      </Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: p.bg },

    // The canvas is RECESSED, not the page colour: a map surface flush with the page would have no
    // edge at all, and the sheet below it would float on nothing.
    canvas: { flex: 1, backgroundColor: p.surfaceSunk, overflow: 'hidden' },

    controlStack: { position: 'absolute', top: spacing.md, right: spacing.md, gap: spacing.xs },
    control: {
      width: touchTarget.iconButton,
      height: touchTarget.iconButton,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceSoft,
    },

    // CENTRED ON THE COORDINATE, not hung from it. `top`/`left` place a box's top-left corner, so
    // the first version put each pin down and to the RIGHT of its position — which slid the "Metro
    // Exp." label under the layers button in the first capture. A fixed width with half of it as a
    // negative margin is what centres a percentage-positioned box in React Native; the drawing does
    // the same thing with `-translate-x-1/2`.
    pin: {
      position: 'absolute',
      width: PIN_BOX,
      marginLeft: -PIN_BOX / 2,
      alignItems: 'center',
    },
    pinPlain: { opacity: 0.8 },
    pinBody: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      backgroundColor: p.surface,
      // Three round corners and one square one, turned 45° — the drawing's teardrop.
      borderBottomRightRadius: 0,
      transform: [{ rotate: '45deg' }],
    },
    pinCore: { width: 10, height: 10, borderRadius: 999, transform: [{ rotate: '-45deg' }] },
    // ONE ROW, not two — the redraw sets the name and the state side by side inside a capsule.
    pinLabel: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      marginTop: spacing.xs,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs / 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      backgroundColor: p.surfaceSoft,
    },
    pinLabelText: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    pinLabelState: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },

    sheet: {
      // The list inside scrolls, so this is a cap on how much of the screen the sheet may take
      // rather than a limit on what it can show. Set from a measurement rather than from the
      // drawing's `h-[40vh]`: at 44% the second of the two drawn sites was still cut mid-figure on
      // a 1080x2400 handset — reachable by scrolling, but a screenshot cannot scroll, and the
      // capture is what a reviewer reads. 52% fits both rows and still leaves the map the larger
      // half of the screen, which is what makes it a map screen.
      maxHeight: '52%',
      borderTopLeftRadius: radius.xl,
      borderTopRightRadius: radius.xl,
      borderTopWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    handleRow: { alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.xs },
    handle: { width: 48, height: 6, borderRadius: 999, backgroundColor: p.border },
    sheetHeadTrail: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    sheetHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: spacing.md,
      paddingBottom: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: p.border,
    },
    sheetTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    sheetTitle: {
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.body.fontSize,
    },
    countChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xs / 2,
      borderRadius: radius.xl,
      backgroundColor: p.surfaceBright,
    },
    countText: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },
    sheetBody: { padding: spacing.md, gap: spacing.md },

    siteRow: {
      gap: spacing.sm,
      padding: spacing.md,
      borderTopRightRadius: radius.lg,
      borderBottomRightRadius: radius.lg,
      borderLeftWidth: 4,
      backgroundColor: p.surfaceSoft,
    },
    siteHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    siteHeadTrail: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    // A CIRCLE by construction: 999 with a fixed side is §32.7's "make this round" marker.
    chevronCircle: {
      width: 30,
      height: 30,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    siteTitleBlock: { flex: 1, gap: spacing.xs / 2 },
    siteName: {
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.body.fontSize,
    },
    siteMeta: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    statusChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xs / 2,
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    statusDot: { width: 6, height: 6, borderRadius: 999 },
    statusText: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },

    siteFacts: {
      flexDirection: 'row',
      gap: spacing.md,
      paddingTop: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: p.border,
    },
    factCell: { flex: 1, gap: spacing.xs / 2 },
    // The redraw rules a hairline between the two fact cells.
    factCellDivided: { paddingLeft: spacing.md, borderLeftWidth: 1, borderLeftColor: p.border },
    factLabel: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },
    factValueRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    factValue: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    factTrack: {
      flex: 1,
      height: 6,
      borderRadius: 999,
      backgroundColor: p.surfaceSunk,
      overflow: 'hidden',
    },
    factFill: { height: '100%', borderRadius: 999 },
  });
