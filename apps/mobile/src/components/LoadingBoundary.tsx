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
  const opacity = useRef(new Animated.Value(loading ? 1 : 0)).current;
  const wasLoading = useRef(loading);

  useEffect(() => {
    if (loading && !wasLoading.current) {
      // Back into loading (e.g. a manual refetch) — show the loader immediately.
      setLoaderMounted(true);
      opacity.setValue(1);
    } else if (!loading && wasLoading.current) {
      // Settled — fade the loader out over the freshly-mounted content, then drop it.
      Animated.timing(opacity, {
        toValue: 0,
        duration: 260,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) setLoaderMounted(false);
      });
    }
    wasLoading.current = loading;
  }, [loading, opacity]);

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
            progress={progress}
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
