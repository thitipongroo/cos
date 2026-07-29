// <LoadingState /> — the standard loading placeholder / progress component (§32.7 "Loading State";
// ADR-055). Layout from mockup/mobile/universal_loading_component_mobile_view.
//
// Presentational only: it owns no data source, no timer, and no i18n copy. The caller passes
// `progress` (0–100; omit for indeterminate) and an already-translated `label` (QM-3 — the
// component holds no key and no literal). The `widget` variant additionally accepts a caller-owned
// brand `iconSource` + `heading` for its launch/branded use (e.g. app favicon + tagline); both are
// opt-in, so the plain dashboard skeleton is unchanged when they are omitted (ADR-055 — brand assets
// and copy stay with the caller, none are baked here).
//
// The `ai` variant carries the cyan glow / scan-line / waveform. §32.7 "Exception 2 — loading
// states" permits the motif here for the reason the pre-auth exception exists: no project data is
// on screen yet, and the motif unmounts the moment data renders. Every other variant is a flat
// skeleton. All colour comes from theme/tokens.ts — §32.7 forbids hardcoded hex.
//
// Decisions live in ../lib/loadingState.ts so they are covered by the QM-1 100% gate; this file is
// the shell (jest.config.ts collectCoverageFrom excludes src/components/**, and react-native is
// mocked wholesale, so components cannot be rendered under jest — they are Detox territory).

import { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Image } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import {
  resolvePalette,
  formatPercent,
  progressWidth,
  aiMotifEnabled,
  listRowWidths,
  accessibilityLabel,
  LIST_SKELETON_ROWS,
  type LoadingVariant,
  type LoadingTheme,
  type LoadingPalette,
} from '../lib/loadingState';
import { fontFamily, spacing, typography } from '../theme/tokens';

export interface LoadingStateProps {
  /** Layout. `list` stacks card skeletons — §32.7 prohibits tables on mobile, so there is no `table`. */
  variant: LoadingVariant;
  /** 0–100. Omit for indeterminate (no bar, no percentage). Clamped; NaN reads as indeterminate. */
  progress?: number;
  /** Already-translated copy. Omit to render no text. */
  label?: string;
  /**
   * `widget` only — a caller-supplied brand mark that replaces the pulsing icon-plate skeleton
   * (rendered static + contained, e.g. the app favicon on the launch screen). The caller owns the
   * asset; the component bakes none (ADR-055). Omit to keep the skeleton plate.
   */
  iconSource?: ImageSourcePropType;
  /**
   * `widget` only — already-resolved heading that replaces the top skeleton bar (e.g. the brand
   * tagline on the launch screen). Caller-owned copy like `label` (QM-3 — no literal in here).
   * `\n` renders multiple lines. Omit to keep the skeleton bar.
   */
  heading?: string;
  /** Selects the §32.7 palette. Dark screens are listed in §32.7 "Mobile Dark Surfaces". */
  theme: LoadingTheme;
  /** Rows for the `list` variant. Defaults to the three the mockup shows. */
  rows?: number;
  testID?: string;
}

/** A single pulsing skeleton bar — the shared primitive behind every non-ai variant. */
function SkeletonBar({
  palette,
  width,
  height,
  radius = 4,
  pulse,
}: {
  palette: LoadingPalette;
  width: number | string;
  height: number;
  radius?: number;
  pulse: Animated.AnimatedInterpolation<number>;
}): React.JSX.Element {
  return (
    <Animated.View
      style={{
        width: width as Animated.WithAnimatedValue<number | `${number}%`>,
        height,
        borderRadius: radius,
        backgroundColor: palette.skeleton,
        opacity: pulse,
      }}
    />
  );
}

export function LoadingState({
  variant,
  progress,
  label,
  theme,
  rows = LIST_SKELETON_ROWS,
  iconSource,
  heading,
  testID,
}: LoadingStateProps): React.JSX.Element {
  const palette = resolvePalette(theme);
  const showMotif = aiMotifEnabled(variant, theme);
  const percent = formatPercent(progress);
  const width = progressWidth(progress);
  const a11y = accessibilityLabel(label, progress);

  const pulseValue = useRef(new Animated.Value(0)).current;
  const spinValue = useRef(new Animated.Value(0)).current;
  const scanValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Capture builds (EXPO_PUBLIC_CAPTURE, same flag that mutes the LogBox toast) FREEZE every loop at a
    // natural mid-frame: a full-page screenshot of the loading state is stitched from several scrolling
    // viewports, and a moving shimmer between frames defeats the stitch's overlap match. Production and
    // normal dev are unaffected — the loops run as usual.
    if (process.env['EXPO_PUBLIC_CAPTURE']) {
      pulseValue.setValue(0.6);
      spinValue.setValue(0);
      scanValue.setValue(0);
      return;
    }
    // One breathing pulse drives every skeleton bar, so the whole card reads as a single surface
    // rather than a field of independently blinking rectangles.
    const breathe = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseValue, { toValue: 1, duration: 750, useNativeDriver: true }),
        Animated.timing(pulseValue, { toValue: 0, duration: 750, useNativeDriver: true }),
      ]),
    );
    const spin = Animated.loop(
      Animated.timing(spinValue, {
        toValue: 1,
        duration: 1000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    const scan = Animated.loop(
      Animated.timing(scanValue, {
        toValue: 1,
        duration: 3000,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    breathe.start();
    spin.start();
    scan.start();
    return () => {
      breathe.stop();
      spin.stop();
      scan.stop();
    };
  }, [pulseValue, spinValue, scanValue]);

  const pulse = pulseValue.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const spinDeg = spinValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const styles = makeStyles(palette);
  const a11yProps =
    a11y === null
      ? {}
      : { accessible: true, accessibilityLabel: a11y, accessibilityRole: 'progressbar' as const };

  // ── micro ─────────────────────────────────────────────────────────────────────────────────────
  // An inline strip: spinner + label + percentage. Sits beside content, so it has no card chrome.
  if (variant === 'micro') {
    return (
      <View testID={testID} style={styles.microRow} {...a11yProps}>
        {/* Spinning ring (mockup D) — a low-alpha track with a rotating primary arc. */}
        <View style={styles.ring}>
          <Animated.View style={[styles.ringArc, { transform: [{ rotate: spinDeg }] }]} />
        </View>
        {label !== undefined && label !== '' && (
          <Text style={styles.microLabel} numberOfLines={1}>
            {label}
          </Text>
        )}
        {percent !== null && <Text style={styles.microPercent}>{percent}</Text>}
      </View>
    );
  }

  // ── list ──────────────────────────────────────────────────────────────────────────────────────
  // Stacked card skeletons (§32.7: cards, never a table).
  if (variant === 'list') {
    return (
      <View testID={testID} style={styles.list} {...a11yProps}>
        {Array.from({ length: rows }, (_, row) => {
          const { title, subtitle } = listRowWidths(row);
          return (
            <View key={row} style={styles.listRow}>
              <SkeletonBar palette={palette} width={40} height={40} radius={4} pulse={pulse} />
              <View style={styles.listRowText}>
                <SkeletonBar palette={palette} width={title} height={14} pulse={pulse} />
                <SkeletonBar palette={palette} width={subtitle} height={10} pulse={pulse} />
              </View>
              {/* The first row carries a sync-in-progress spinner + percentage (mockup B). */}
              {row === 0 ? (
                <View style={styles.listSync}>
                  <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
                    <MaterialIcons name="sync" size={18} color={palette.syncing} />
                  </Animated.View>
                  {percent !== null ? <Text style={styles.listSyncPercent}>{percent}</Text> : null}
                </View>
              ) : null}
            </View>
          );
        })}
      </View>
    );
  }

  // ── ai ────────────────────────────────────────────────────────────────────────────────────────
  // The AI insight processor: cyan left-border, glow, scan-line, waveform (§32.7 Exception 2).
  if (variant === 'ai') {
    return (
      <View testID={testID} style={[styles.card, showMotif && styles.aiCard]} {...a11yProps}>
        {showMotif && (
          <Animated.View
            style={[
              styles.scanLine,
              {
                opacity: scanValue.interpolate({
                  inputRange: [0, 0.5, 1],
                  outputRange: [0, 1, 0],
                }),
                transform: [
                  {
                    translateY: scanValue.interpolate({
                      inputRange: [0, 1],
                      outputRange: [0, 96],
                    }),
                  },
                ],
              },
            ]}
          />
        )}
        <View style={styles.aiHeader}>
          <MaterialIcons name="psychology" size={18} color={palette.accent ?? palette.primary} />
          {label !== undefined && label !== '' && <Text style={styles.aiLabel}>{label}</Text>}
          {percent !== null && <Text style={styles.aiPercent}>{percent}</Text>}
        </View>
        {showMotif ? (
          <Waveform palette={palette} pulse={pulse} />
        ) : (
          <SkeletonBar palette={palette} width="100%" height={14} pulse={pulse} />
        )}
        {width !== null && (
          <View style={styles.track}>
            <View
              style={[
                styles.fill,
                {
                  width: width as `${number}%`,
                  backgroundColor: palette.accent ?? palette.primary,
                },
              ]}
            />
          </View>
        )}
      </View>
    );
  }

  // ── widget ────────────────────────────────────────────────────────────────────────────────────
  // The dashboard tile: icon plate, text skeletons, label + percentage, progress bar.
  return (
    <View testID={testID} style={styles.card} {...a11yProps}>
      <View style={styles.widgetBody}>
        {/* Mark: a caller-supplied brand image (static, for the branded launch use), else the
            pulsing circular skeleton with an analytics glyph inside (mockup A). */}
        {iconSource !== undefined ? (
          <Image source={iconSource} style={styles.iconImage} resizeMode="contain" />
        ) : (
          <Animated.View style={[styles.iconPlate, { opacity: pulse }]}>
            <MaterialIcons name="analytics" size={28} color={palette.muted} />
          </Animated.View>
        )}
        {/* Under the mark: the caller's heading (brand tagline) when branded, else a skeleton bar. */}
        {heading !== undefined && heading !== '' ? (
          <Text style={styles.widgetHeading}>{heading}</Text>
        ) : (
          <SkeletonBar palette={palette} width="35%" height={12} pulse={pulse} />
        )}
        {(label !== undefined && label !== '') || percent !== null ? (
          <View style={styles.widgetTextRow}>
            {label !== undefined && label !== '' && (
              <Text style={styles.widgetLabel} numberOfLines={1}>
                {label}
              </Text>
            )}
            {percent !== null && <Text style={styles.widgetPercent}>{percent}</Text>}
          </View>
        ) : null}
      </View>
      {width !== null && (
        <View style={styles.track}>
          <View style={[styles.fill, { width: width as `${number}%` }]} />
        </View>
      )}
    </View>
  );
}

/** The `ai` variant's waveform — nine bars whose heights breathe out of phase. */
function Waveform({
  palette,
  pulse,
}: {
  palette: LoadingPalette;
  pulse: Animated.AnimatedInterpolation<number>;
}): React.JSX.Element {
  // Fixed per-bar heights, phase-shifted by the shared pulse: a nine-bar equaliser without nine
  // independent animations.
  const heights = [6, 14, 10, 16, 8, 15, 11, 5, 13];
  return (
    <View style={waveformStyles.row}>
      {heights.map((height, index) => (
        <Animated.View
          key={index}
          style={{
            width: 3,
            height,
            borderRadius: 2,
            backgroundColor: palette.accent ?? palette.primary,
            opacity: pulse.interpolate({
              inputRange: [0.4, 1],
              outputRange: index % 2 === 0 ? [0.35, 1] : [1, 0.35],
            }),
          }}
        />
      ))}
    </View>
  );
}

const waveformStyles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 18 },
});

const makeStyles = (palette: LoadingPalette) =>
  StyleSheet.create({
    card: {
      backgroundColor: palette.surface,
      borderRadius: 4, // §32.7 shape language — 4px, no pills
      padding: spacing.md,
      gap: spacing.sm,
      overflow: 'hidden',
    },
    // Icon plate (mockup A) — a circular skeleton with a glyph centred inside.
    iconPlate: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: palette.skeleton,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Spinning ring (mockup D) — low-alpha track + a rotating primary top arc overlaid on it.
    ring: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: `${palette.primary}33`,
    },
    ringArc: {
      position: 'absolute',
      top: -2,
      left: -2,
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 2,
      borderColor: 'transparent',
      borderTopColor: palette.primary,
    },
    aiCard: {
      // Start/end, not left/right: RN does not auto-flip borderLeft* under I18nManager.isRTL, so a
      // physical edge would sit on the wrong side in ar-SA (QM-3).
      borderStartWidth: 4,
      borderStartColor: palette.accent ?? palette.primary,
      // §32.7 Exception 2 — the AI glow. Elevation stays 0; this is a tint, not a drop shadow.
      shadowColor: palette.accent ?? palette.primary,
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 0 },
    },
    scanLine: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      height: 2,
      backgroundColor: palette.accent ?? palette.primary,
    },
    aiHeader: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    aiLabel: {
      flex: 1,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight,
      color: palette.text,
    },
    aiPercent: {
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight,
      color: palette.accent ?? palette.primary,
      fontVariant: ['tabular-nums'],
    },
    // Brand mark for the launch/branded widget — the favicon, rendered static + contained (no plate
    // skeleton, no pulse). The favicon PNG is transparent, so it floats on the card ground.
    iconImage: { width: 72, height: 72 },
    // Brand heading (tagline) for the launch/branded widget — replaces the top skeleton bar.
    widgetHeading: {
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
      lineHeight: typography.title.lineHeight,
      color: palette.text,
      textAlign: 'center',
      letterSpacing: 0.5,
    },
    widgetBody: { alignItems: 'center', gap: spacing.sm, paddingVertical: spacing.sm },
    widgetTextRow: { flexDirection: 'row', alignItems: 'baseline', gap: spacing.xs },
    widgetLabel: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
      color: palette.muted,
    },
    widgetPercent: {
      fontFamily: fontFamily.bold,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.lineHeight,
      color: palette.primary,
      fontVariant: ['tabular-nums'],
    },
    track: {
      height: 6,
      borderRadius: 3,
      backgroundColor: palette.skeleton,
      overflow: 'hidden',
    },
    fill: { height: '100%', borderRadius: 3, backgroundColor: palette.primary },
    // Clustered container (mockup B) — a bordered group; the 2px gaps show the tinted ground through.
    list: {
      gap: 2,
      borderRadius: 4,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: palette.skeleton,
      backgroundColor: palette.skeleton,
    },
    listRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      // §32.7 touch targets: a skeleton row must not be shorter than the list item it stands in for.
      minHeight: 52,
      padding: spacing.sm,
      backgroundColor: palette.surface,
    },
    listRowText: { flex: 1, gap: spacing.xs },
    listSync: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    listSyncPercent: {
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight,
      color: palette.syncing,
      fontVariant: ['tabular-nums'],
    },
    microRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    microLabel: {
      flexShrink: 1,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight,
      color: palette.muted,
    },
    microPercent: {
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight,
      color: palette.primary,
      fontVariant: ['tabular-nums'],
    },
  });
