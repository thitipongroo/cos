// <SignaturePad /> — the drawn confirmation on a safety checklist (mockup
// mockup/mobile/05_site_worker/03_safety/01_checklist "DIGITAL AUTHORIZATION").
//
// WHAT THIS SIGNATURE IS. An attestation MARK on an internal record: the worker draws it to close
// their own daily verification. It is NOT a qualified electronic signature — no PKI, no certificate,
// no non-repudiation — and the legally meaningful attribution is the row's `inspected_by` /
// `inspected_at`, which the server sets from the authenticated session. Contract e-signature is a
// different mechanism entirely (ADR-058, CredentialService, bilateral PKI/VC) and must not be
// confused with this one. Stored by migration 20260808000002.
//
// Reuses the ADR-056 drawing machinery rather than adding a second representation of "ink": the same
// Skia canvas, the same Gesture.Pan, and the same `AnnotationStroke` shape — an SVG path in
// NORMALISED (0..1) coordinates, so the mark re-renders at any pad size or screen density and the
// payload stays a few hundred bytes on a sync batch that flushes over site 3G (§17.7).

import { useCallback, useMemo, useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import { Canvas, Path, Group, Skia } from '@shopify/react-native-skia';
import { MaterialIcons } from '@expo/vector-icons';
import type { AnnotationStroke } from './PhotoAnnotation';
import { useI18n } from '../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette, type Palette } from '../theme/usePalette';

/** Fraction of the pad's long edge — a pen line that stays proportional at any pad size. */
const STROKE_FRACTION = 0.006;
const PAD_HEIGHT = 160;

export interface SignaturePadProps {
  /** The current strokes. Controlled by the caller so the parent owns what gets submitted. */
  strokes: AnnotationStroke[];
  onChange: (strokes: AnnotationStroke[]) => void;
  /** Shown under the pad — who is signing, from the authenticated session. */
  signerName?: string | null;
  testID?: string;
}

export function SignaturePad({ strokes, onChange, signerName, testID }: SignaturePadProps) {
  const { t, formatDate } = useI18n();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);

  const [size, setSize] = useState({ w: 0, h: PAD_HEIGHT });
  const drawing = useRef<{ x: number; y: number }[]>([]);
  const [liveKey, setLiveKey] = useState(0); // bump to re-render the in-flight stroke

  const norm = useCallback(
    (x: number, y: number) => ({ x: size.w ? x / size.w : 0, y: size.h ? y / size.h : 0 }),
    [size.w, size.h],
  );

  const pan = useMemo(
    () =>
      Gesture.Pan()
        .runOnJS(true)
        .onBegin((e) => {
          drawing.current = [norm(e.x, e.y)];
          setLiveKey((k) => k + 1);
        })
        .onUpdate((e) => {
          drawing.current.push(norm(e.x, e.y));
          setLiveKey((k) => k + 1);
        })
        .onEnd(() => {
          const pts = drawing.current;
          drawing.current = [];
          // A tap is not a stroke: two points are the minimum that draws a line, and committing a
          // single point would make the pad "signed" on an accidental touch.
          if (pts.length < 2) {
            setLiveKey((k) => k + 1);
            return;
          }
          onChange([...strokes, { d: strokeToSvg(pts), color: p.text, width: STROKE_FRACTION }]);
          setLiveKey((k) => k + 1);
        }),
    [norm, onChange, strokes, p.text],
  );

  const longEdge = Math.max(size.w, size.h);
  const liveD = drawing.current.length >= 2 ? strokeToSvg(drawing.current) : null;
  const signed = strokes.length > 0;

  return (
    <View testID={testID} style={styles.root}>
      <GestureDetector gesture={pan}>
        <View
          style={styles.pad}
          // The pad is a drawing surface, not a button — TalkBack has no gesture that can sign it,
          // so it is announced as an image with a name and a state (signed / not yet) rather than
          // offered as something to activate (§20.8, WCAG 2.2 AA). Leaving the checklist unsigned is
          // valid: `signature` is optional on the submission, so a screen-reader user is never
          // blocked by a mark they cannot draw.
          accessibilityRole="image"
          accessibilityLabel={t('safety.checklist.signHere')}
          accessibilityValue={{ text: signed ? t('safety.checklist.signed') : '' }}
          onLayout={(e) =>
            setSize({ w: e.nativeEvent.layout.width, h: e.nativeEvent.layout.height })
          }
        >
          {/* The empty-pad prompt sits UNDER the canvas and disappears on the first stroke, so it can
              never be mistaken for part of the signature or exported with it. */}
          {!signed ? (
            <View style={styles.placeholder} pointerEvents="none">
              <MaterialIcons name="gesture" size={40} color={p.muted} />
              <Text style={styles.placeholderText}>{t('safety.checklist.signHere')}</Text>
            </View>
          ) : null}
          <Canvas style={StyleSheet.absoluteFill}>
            <Group>
              {strokes.map((s, i) => (
                <Path
                  key={i}
                  path={denormalise(s.d, size.w, size.h)}
                  color={s.color}
                  style="stroke"
                  strokeWidth={s.width * longEdge}
                  strokeJoin="round"
                  strokeCap="round"
                />
              ))}
              {liveD ? (
                <Path
                  key={`live-${liveKey}`}
                  path={denormalise(liveD, size.w, size.h)}
                  color={p.text}
                  style="stroke"
                  strokeWidth={STROKE_FRACTION * longEdge}
                  strokeJoin="round"
                  strokeCap="round"
                />
              ) : null}
            </Group>
          </Canvas>
          {/* The mockup stamps a timestamp in the pad corner. It is the CURRENT date, rendered through
              formatDate so Thai shows the Buddhist era (QM-3) — the authoritative `inspected_at` is
              set server-side when the checklist is submitted, not from this label. */}
          <Text style={styles.stamp}>{formatDate(new Date().toISOString())}</Text>
        </View>
      </GestureDetector>

      <View style={styles.footer}>
        <Text style={styles.signer} numberOfLines={1}>
          {t('safety.checklist.signer', { name: signerName ?? t('drawer.member') })}
        </Text>
        <TouchableOpacity
          testID="signature-clear"
          onPress={() => onChange([])}
          disabled={!signed}
          accessibilityRole="button"
          accessibilityLabel={t('safety.checklist.clearPad')}
          accessibilityState={{ disabled: !signed }}
          style={[styles.clear, !signed && styles.clearDisabled]}
        >
          <Text style={styles.clearText}>{t('safety.checklist.clearPad')}</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

/** Points → an SVG path, the same encoding <PhotoAnnotation /> stores. */
function strokeToSvg(pts: { x: number; y: number }[]): string {
  const [head, ...rest] = pts;
  if (!head) return '';
  return `M${head.x.toFixed(4)},${head.y.toFixed(4)} ${rest
    .map((pt) => `L${pt.x.toFixed(4)},${pt.y.toFixed(4)}`)
    .join(' ')}`;
}

/** Scale a normalised path onto the live pad. */
function denormalise(d: string, w: number, h: number) {
  const path = Skia.Path.MakeFromSVGString(d);
  if (!path) return Skia.Path.Make();
  const m = Skia.Matrix();
  m.scale(w, h);
  path.transform(m);
  return path;
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    root: { gap: spacing.xs },
    pad: {
      height: PAD_HEIGHT,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      overflow: 'hidden',
      justifyContent: 'center',
    },
    // Explicit inset rather than StyleSheet.absoluteFillObject: the RN mock these tests run against
    // exposes absoluteFill only, and the two are the same four zeros.
    placeholder: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    placeholderText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },
    stamp: {
      position: 'absolute',
      right: spacing.sm,
      bottom: spacing.xs,
      fontSize: 10,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },
    footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    signer: {
      flex: 1,
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
      fontStyle: 'italic',
    },
    clear: {
      minHeight: touchTarget.iconButton,
      justifyContent: 'center',
      paddingHorizontal: spacing.sm,
    },
    clearDisabled: { opacity: 0.4 },
    clearText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.accent,
      textTransform: 'uppercase',
    },
  });
