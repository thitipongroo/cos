// <LoadingBoundary /> — wraps a data region and crossfades from its <LoadingState /> to the real
// content when the fetch settles (PO 2026-08-01 — "make loading→screen transitions seamless"), instead
// of the abrupt ternary swap every screen used before.
//
// While `loading` is true it renders ONLY the loader (the children are not mounted, so a screen whose
// content can't render without its data never has to guard against a null-data first paint). The moment
// `loading` flips false the children mount with real data and the loader — now overlaid on top — fades
// out over ~260ms and unmounts, so the content is revealed rather than popped in.
//
// It forwards every <LoadingState /> prop (variant / progress / label / iconSource / heading / rows), so
// a caller picks the loading shape (widget / list / micro / ai) the same way it would call LoadingState
// directly. Presentational only; owns no data.

import { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Animated, Easing } from 'react-native';
import type { StyleProp, ViewStyle, ImageSourcePropType } from 'react-native';
import { LoadingState } from './LoadingState';
import { completionHoldMs, CROSSFADE_MS } from '../lib/loadingState';
import type { LoadingVariant, LoadingTheme } from '../lib/loadingState';

export interface LoadingBoundaryProps {
  /** While true, the loader shows and children stay unmounted; false crossfades to children. */
  loading: boolean;
  variant: LoadingVariant;
  theme: LoadingTheme;
  progress?: number;
  label?: string;
  rows?: number;
  iconSource?: ImageSourcePropType;
  heading?: string;
  /** Wrapper style — usually the same layout the content would have occupied. */
  style?: StyleProp<ViewStyle>;
  /** Style for the loader's own container (e.g. centering a full-screen launch loader). Applied in both
   *  the in-flow loading phase and the absolute-fill fade-out, so the loader never jumps. */
  loaderStyle?: StyleProp<ViewStyle>;
  testID?: string;
  children: React.ReactNode;
}

export function LoadingBoundary({
  loading,
  variant,
  theme,
  progress,
  label,
  rows,
  iconSource,
  heading,
  style,
  loaderStyle,
  testID,
  children,
}: LoadingBoundaryProps): React.JSX.Element {
  // The loader stays mounted through its fade-out, one tick past `loading` going false.
  const [loaderMounted, setLoaderMounted] = useState(loading);
  // Once the fetch settles, the loader is driven to 100% before it fades — so the bar and the
  // counting percentage complete the run the user was watching instead of vanishing mid-travel
  // (product-owner decision 2026-08-17). Indeterminate callers hold for 0ms; see completionHoldMs.
  const [completing, setCompleting] = useState(false);
  const opacity = useRef(new Animated.Value(loading ? 1 : 0)).current;
  const wasLoading = useRef(loading);

  useEffect(() => {
    const cameBackIntoLoading = loading && !wasLoading.current;
    const settled = !loading && wasLoading.current;
    wasLoading.current = loading;

    if (cameBackIntoLoading) {
      // Back into loading (e.g. a manual refetch) — show the loader immediately.
      setCompleting(false);
      setLoaderMounted(true);
      opacity.setValue(1);
      return;
    }
    if (!settled) return;

    // Settled — drive the bar to 100, hold for exactly one fill, then fade out over the
    // freshly-mounted content and drop the loader.
    setCompleting(true);
    const timer = setTimeout(() => {
      Animated.timing(opacity, {
        toValue: 0,
        duration: CROSSFADE_MS,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setLoaderMounted(false);
      });
    }, completionHoldMs(progress));
    return () => clearTimeout(timer);
  }, [loading, opacity, progress]);

  return (
    <View style={style} testID={testID}>
      {loading ? null : children}
      {loaderMounted ? (
        <Animated.View
          // During the fade-out the loader overlays the content and must not eat its taps.
          pointerEvents={loading ? 'auto' : 'none'}
          style={[loading ? loaderStyle : [StyleSheet.absoluteFill, loaderStyle], { opacity }]}
        >
          <LoadingState
            variant={variant}
            theme={theme}
            // While completing, a determinate caller's bar is sent to 100 so it finishes its run.
            // An indeterminate one is left alone — it has no percentage to complete, and forcing
            // one would invent a figure the caller never supplied (ADR-055 honest-data policy).
            progress={completing && progress !== undefined ? 100 : progress}
            label={label}
            rows={rows}
            iconSource={iconSource}
            heading={heading}
          />
        </Animated.View>
      ) : null}
    </View>
  );
}
