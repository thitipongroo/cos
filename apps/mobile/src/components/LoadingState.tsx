// <LoadingState /> — the standard loading placeholder / progress component (§32.7 "Loading State";
// ADR-055). Layout from mockup/mobile/02_loading_component (the "Universal Loading Patterns" A–D).
//
// Presentational only: it owns no data source and no i18n copy. The caller passes `progress` (0–100;
// omit for indeterminate) and an already-translated `label` (QM-3 — the component holds no key and no
// literal). The `widget` variant additionally accepts a caller-owned brand `iconSource` + `heading`
// for its launch/branded use (e.g. app favicon + tagline); both are opt-in.
//
// Motion (PO 2026-08-01 — "loadings must actually move"): when the caller supplies a real `progress`
// (determinate), the fill bar / ring arc animate smoothly to it and the percentage counts up with the
// same value — the number is never fabricated, it tracks the caller's honest progress. When `progress`
// is omitted (indeterminate) there is NO percentage and the bar stays a pulsing skeleton — the ring
// keeps its rotating sweep — so nothing invents a figure it doesn't have (honest-data policy).
//
// The `ai` variant carries the cyan glow / scan-line / waveform. §32.7 "Exception 2 — loading states"
// permits the motif here: no project data is on screen yet, and it unmounts the moment data renders.
//
// Decisions live in ../lib/loadingState.ts so they are covered by the QM-1 100% gate; this file is the
// shell (jest.config.ts collectCoverageFrom excludes src/components/**, and react-native is mocked
// wholesale, so components cannot be rendered under jest — they are Detox territory).

import { useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, Animated, Easing, Image } from 'react-native';
import type { ImageSourcePropType } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, {
  Circle,
  Defs,
  Stop,
  Rect,
  LinearGradient as SvgLinearGradient,
} from 'react-native-svg';
import {
  resolvePalette,
  formatPercent,
  clampProgress,
  aiMotifEnabled,
  listRowWidths,
  accessibilityLabel,
  LIST_SKELETON_ROWS,
  type LoadingVariant,
  type LoadingTheme,
  type LoadingPalette,
} from '../lib/loadingState';
import { fontFamily, spacing, typography } from '../theme/tokens';

const AnimatedCircle = Animated.createAnimatedComponent(Circle);

export interface LoadingStateProps {
  /** Layout. `list` stacks card skeletons — §32.7 prohibits tables on mobile, so there is no `table`. */
  variant: LoadingVariant;
  /** 0–100. Omit for indeterminate (no bar fill, no percentage). Clamped; NaN reads as indeterminate. */
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

/**
 * A determinate progress bar whose fill animates to the current value. Indeterminate callers get a
 * pulsing skeleton track instead of an invented fill (honest-data policy). `fill` is the shared 0→1
 * animated value; `color` overrides the primary (the `ai` variant fills in cyan).
 */
function ProgressBar({
  palette,
  determinate,
  fill,
  sweep,
  color,
}: {
  palette: LoadingPalette;
  determinate: boolean;
  fill: Animated.Value;
  sweep: Animated.Value;
  color?: string;
}): React.JSX.Element {
  const styles = makeStyles(palette);
  const [trackW, setTrackW] = useState(0);
  const barColor = color ?? palette.primary;
  if (!determinate) {
    // No honest value → a bright segment sweeps across the track (Material-style indeterminate), so the
    // bar is visibly working without inventing a percentage.
    const seg = Math.max(24, trackW * 0.35);
    const tx = sweep.interpolate({ inputRange: [0, 1], outputRange: [-seg, trackW] });
    return (
      <View style={styles.track} onLayout={(e) => setTrackW(e.nativeEvent.layout.width)}>
        <Animated.View
          style={[
            styles.fill,
            { width: seg, backgroundColor: barColor, transform: [{ translateX: tx }] },
          ]}
        />
      </View>
    );
  }
  const width = fill.interpolate({ inputRange: [0, 1], outputRange: ['0%', '100%'] });
  return (
    <View style={styles.track}>
      <Animated.View
        style={[
          styles.fill,
          { width: width as unknown as `${number}%`, backgroundColor: barColor },
        ]}
      />
    </View>
  );
}

/**
 * A perpetual shimmer band that sweeps across a card, so the loading always reads as "working" — even
 * in the branded launch case where the skeletons are replaced by a static favicon + tagline, or when a
 * determinate bar is sitting at a fixed percentage between steps. Absolutely positioned over the card
 * (which clips it via overflow:hidden); purely decorative, so it is pointer-transparent and a11y-hidden.
 */
function CardShimmer({
  sweep,
  color,
  alpha,
}: {
  sweep: Animated.Value;
  color: string;
  alpha: number;
}): React.JSX.Element {
  const [size, setSize] = useState({ w: 0, h: 0 });
  const BAND = 150;
  // Move a STATIC gradient band with a native translateX (react-native-svg's own animated props don't
  // drive from a JS Animated.Value reliably, so the band lives in a plain View that the transform moves).
  // The band's left edge travels from off-screen-left to off-screen-right, forever.
  const tx = sweep.interpolate({ inputRange: [0, 1], outputRange: [-BAND, size.w + BAND] });
  return (
    <View
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      style={StyleSheet.absoluteFill}
      onLayout={(e) => setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })}
    >
      {size.h > 0 ? (
        <Animated.View
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: BAND,
            height: size.h,
            transform: [{ translateX: tx }],
          }}
        >
          <Svg width={BAND} height={size.h}>
            <Defs>
              <SvgLinearGradient id="cardShimmer" x1="0" y1="0" x2="1" y2="0">
                <Stop offset="0" stopColor={color} stopOpacity={0} />
                <Stop offset="0.5" stopColor={color} stopOpacity={alpha} />
                <Stop offset="1" stopColor={color} stopOpacity={0} />
              </SvgLinearGradient>
            </Defs>
            <Rect x={0} y={0} width={BAND} height={size.h} fill="url(#cardShimmer)" />
          </Svg>
        </Animated.View>
      ) : null}
    </View>
  );
}

/**
 * The `micro` variant's ring (mockup D). Determinate → a real progress arc that grows with the value
 * (the "circle bar"); indeterminate → a rotating quarter-arc sweep. SVG so the arc is a true partial
 * stroke, not a border trick.
 */
function ProgressRing({
  palette,
  determinate,
  fill,
  spinDeg,
}: {
  palette: LoadingPalette;
  determinate: boolean;
  fill: Animated.Value;
  spinDeg: Animated.AnimatedInterpolation<string>;
}): React.JSX.Element {
  const size = 18;
  const stroke = 2;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const track = `${palette.primary}33`;
  if (determinate) {
    // Offset shrinks from full circumference (empty) to 0 (full) as fill goes 0→1.
    const offset = fill.interpolate({
      inputRange: [0, 1],
      outputRange: [circumference, 0],
    });
    return (
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <AnimatedCircle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={palette.primary}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          // Start the arc at 12 o'clock rather than 3 o'clock.
          rotation={-90}
          origin={`${size / 2}, ${size / 2}`}
        />
      </Svg>
    );
  }
  return (
    <Animated.View style={{ transform: [{ rotate: spinDeg }] }}>
      <Svg width={size} height={size}>
        <Circle cx={size / 2} cy={size / 2} r={r} stroke={track} strokeWidth={stroke} fill="none" />
        <Circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          stroke={palette.primary}
          strokeWidth={stroke}
          fill="none"
          strokeDasharray={`${circumference * 0.25} ${circumference}`}
          strokeLinecap="round"
        />
      </Svg>
    </Animated.View>
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
  const clamped = clampProgress(progress); // number 0–100, or null when indeterminate
  const determinate = clamped !== null;
  const target = clamped === null ? 0 : clamped / 100;
  // The percentage shown IS the animated fill value, so number and bar/ring never disagree; it renders
  // only when the caller gave a real progress (honest-data policy — no invented figure).
  const [displayPct, setDisplayPct] = useState(0);
  const percent = determinate ? formatPercent(displayPct) : null;
  const a11y = accessibilityLabel(label, progress);

  const pulseValue = useRef(new Animated.Value(0)).current;
  const spinValue = useRef(new Animated.Value(0)).current;
  const scanValue = useRef(new Animated.Value(0)).current;
  // Drives the fill-bar width, the ring arc, and the counting percentage — one value so they agree.
  const fillValue = useRef(new Animated.Value(0)).current;
  // A perpetual left-to-right sweep (never settles) — drives the card shimmer and the indeterminate
  // bar segment, so the loading always reads as actively working, not a frozen still.
  const sweepValue = useRef(new Animated.Value(0)).current;
  // Shimmer highlight: a light band on the dark shell, a brighter white on the light one (the alpha
  // is applied on the gradient stop, so the colour stays a solid SVG-friendly hex).
  const shimmerColor = theme === 'dark' ? '#F8FAFC' : '#FFFFFF';
  const shimmerAlpha = theme === 'dark' ? 0.22 : 0.6;

  useEffect(() => {
    const id = fillValue.addListener(({ value }) => setDisplayPct(Math.round(value * 100)));
    return () => fillValue.removeListener(id);
  }, [fillValue]);

  useEffect(() => {
    // Capture builds (EXPO_PUBLIC_CAPTURE, same flag that mutes the LogBox toast) FREEZE every loop at a
    // natural mid-frame: a full-page screenshot is stitched from several scrolling viewports, and a
    // moving shimmer between frames defeats the stitch's overlap match. The fill jumps straight to its
    // honest target so the frozen frame still shows the real bar/ring/percentage.
    // Compare against '1' exactly, matching src/app/_layout.tsx. A bare truthiness check made
    // EXPO_PUBLIC_CAPTURE=0 (or any "off" string) still freeze every animation.
    if (process.env['EXPO_PUBLIC_CAPTURE'] === '1') {
      pulseValue.setValue(0.6);
      spinValue.setValue(0);
      scanValue.setValue(0);
      sweepValue.setValue(0.5);
      fillValue.setValue(target);
      return;
    }
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
    // The perpetual shimmer / indeterminate sweep — drives a translateX on the shimmer band and the
    // indeterminate bar segment, both native-driver-friendly transforms.
    const sweep = Animated.loop(
      Animated.timing(sweepValue, {
        toValue: 1,
        duration: 1400,
        easing: Easing.inOut(Easing.ease),
        useNativeDriver: true,
      }),
    );
    breathe.start();
    spin.start();
    scan.start();
    sweep.start();
    // Slide the fill/ring/percentage to the current honest value. Width + SVG stroke are layout/JS
    // props, so this one animation cannot use the native driver (the loops above still do).
    const advance = Animated.timing(fillValue, {
      toValue: target,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    });
    advance.start();
    return () => {
      breathe.stop();
      spin.stop();
      scan.stop();
      sweep.stop();
      advance.stop();
    };
  }, [pulseValue, spinValue, scanValue, sweepValue, fillValue, target]);

  const pulse = pulseValue.interpolate({ inputRange: [0, 1], outputRange: [0.4, 1] });
  const spinDeg = spinValue.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });

  const styles = makeStyles(palette);
  const a11yProps =
    a11y === null
      ? {}
      : { accessible: true, accessibilityLabel: a11y, accessibilityRole: 'progressbar' as const };

  // ── micro ─────────────────────────────────────────────────────────────────────────────────────
  // An inline strip: ring + label + percentage. Sits beside content, so it has no card chrome.
  if (variant === 'micro') {
    return (
      <View testID={testID} style={styles.microRow} {...a11yProps}>
        {/* Progress ring (mockup D) — a real arc when determinate, a rotating sweep when not. */}
        <ProgressRing
          palette={palette}
          determinate={determinate}
          fill={fillValue}
          spinDeg={spinDeg}
        />
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
              {/* The first row carries a sync-in-progress spinner + counting percentage (mockup B). */}
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
        <CardShimmer sweep={sweepValue} color={shimmerColor} alpha={shimmerAlpha} />
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
        <ProgressBar
          palette={palette}
          determinate={determinate}
          fill={fillValue}
          sweep={sweepValue}
          color={palette.accent ?? palette.primary}
        />
        <CardShimmer sweep={sweepValue} color={shimmerColor} alpha={shimmerAlpha} />
      </View>
    );
  }

  // ── widget ────────────────────────────────────────────────────────────────────────────────────
  // The dashboard tile: icon plate, text skeletons, label + counting percentage, progress bar.
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
      <ProgressBar
        palette={palette}
        determinate={determinate}
        fill={fillValue}
        sweep={sweepValue}
      />
      <CardShimmer sweep={sweepValue} color={shimmerColor} alpha={shimmerAlpha} />
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
