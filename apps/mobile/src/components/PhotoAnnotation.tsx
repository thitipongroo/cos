// <PhotoAnnotation /> — mark up a captured photo (§32.7; ADR-056). Mobile only.
//
// Design decisions, all from ADR-056 and verified on-device by the spike:
//   • The photo is drawn as a Skia <Image> INSIDE the same Canvas as the strokes, so
//     canvasRef.makeImageSnapshot() exports both together (a transparent overlay would export the
//     strokes on a blank background).
//   • Undo is a retained-mode stroke LIST, not a pixel buffer (Skia has no getImageData). Each stroke
//     is an SVG path string; undo pops the list.
//   • Strokes persist in NORMALISED (0..1) coordinates so one list renders at any resolution and the
//     annotation stays re-editable. On export they are re-rendered over the full-resolution photo.
//   • dispose() is unnecessary here — the declarative renderer owns the SkImage from useImage.
//
// Presentational + self-contained: it owns its toolbar labels via i18n (site.photo.annotate.*, the
// component-owned-chrome pattern — unlike <LoadingState />, ADR-055), and hands the caller the final
// stroke list + a flattened-image file URI through onSave. Persistence, versioning, and the sync
// enqueue are the caller's concern (same split as <PhotoCapture />).

import { useCallback, useMemo, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, useWindowDimensions } from 'react-native';
import { GestureDetector } from 'react-native-gesture-handler';
import {
  Canvas,
  Image as SkiaImage,
  Path,
  Group,
  useCanvasRef,
  useImage,
  type SkImage,
} from '@shopify/react-native-skia';
// SDK 54+ moved documentDirectory / writeAsStringAsync to the `/legacy` subpath (the new File/Directory
// API has no drop-in for a one-shot base64 write). Same choice as src/api/transcribe.ts.
import * as FileSystem from 'expo-file-system/legacy';
import { useStrokeCapture, type StrokePoint, denormalisePath } from '../hooks/useStrokeCapture';
import { useT } from '../i18n';
import { colors, darkColors, fontFamily, radius, spacing, typography } from '../theme/tokens';

/** One freehand stroke, stored resolution-independently. */
export interface AnnotationStroke {
  /** SVG path string in NORMALISED (0..1) coordinates. */
  d: string;
  color: string;
  /** Stroke width as a fraction of the canvas's longer edge, so it scales with resolution. */
  width: number;
}

export interface PhotoAnnotationProps {
  /** file:// URI of the photo to annotate. */
  photoUri: string;
  /** Existing strokes to re-edit (normalised). Omit for a fresh annotation. */
  initialStrokes?: AnnotationStroke[];
  /**
   * Called on Save with the final normalised stroke list AND a flattened PNG written to disk
   * (documentDirectory) — the file the offline queue uploads. The caller owns both.
   */
  onSave: (strokes: AnnotationStroke[], flattenedUri: string) => void;
  onCancel?: () => void;
  theme?: 'light' | 'dark';
}

const PEN_COLOR = colors.danger; // #FF3B30 — matches the mockup's default markup colour
const STROKE_FRACTION = 0.006; // pen width as a fraction of the long edge

interface Palette {
  bg: string;
  text: string;
  primary: string;
}
const darkPalette: Palette = {
  bg: darkColors.bg,
  text: darkColors.text,
  primary: darkColors.primary,
};
const lightPalette: Palette = { bg: colors.bg, text: colors.textPrimary, primary: colors.primary };

export function PhotoAnnotation({
  photoUri,
  initialStrokes = [],
  onSave,
  onCancel,
  theme = 'dark',
}: PhotoAnnotationProps) {
  const t = useT();
  // The two token sets name their foreground colour differently (darkColors.text vs
  // colors.textPrimary) and their tap-target colour the same (primary). Normalise to one shape.
  const palette = theme === 'dark' ? darkPalette : lightPalette;
  const canvasRef = useCanvasRef();
  const image = useImage(photoUri);
  const { width: screenW } = useWindowDimensions();

  // The photo keeps its aspect ratio inside the screen width. Strokes are normalised, so the exact
  // canvas size only affects display, never what is stored.
  const canvasW = screenW;
  const canvasH = useMemo(() => {
    if (!image) return screenW;
    return Math.round((screenW * image.height()) / image.width());
  }, [image, screenW]);

  const [strokes, setStrokes] = useState<AnnotationStroke[]>(initialStrokes);

  const norm = useCallback(
    (x: number, y: number) => ({ x: x / canvasW, y: y / canvasH }),
    [canvasW, canvasH],
  );

  const commit = useCallback((points: StrokePoint[]) => {
    setStrokes((prev) => [
      ...prev,
      { d: strokeToSvg(points), color: PEN_COLOR, width: STROKE_FRACTION },
    ]);
  }, []);

  const { pan, liveKey, drawing } = useStrokeCapture({
    norm,
    onCommit: commit,
    testId: 'photo-annotation-pan',
  });

  const undo = useCallback(() => setStrokes((prev) => prev.slice(0, -1)), []);
  const clear = useCallback(() => setStrokes([]), []);

  const save = useCallback(async () => {
    const snapshot = canvasRef.current?.makeImageSnapshot();
    const uri = snapshot ? await writePng(snapshot) : '';
    onSave(strokes, uri);
  }, [canvasRef, strokes, onSave]);

  const styles = useMemo(() => makeStyles(palette), [palette]);
  const longEdge = Math.max(canvasW, canvasH);
  const liveD = drawing.current.length >= 2 ? strokeToSvg(drawing.current) : null;

  return (
    <View testID="photo-annotation" style={styles.root}>
      <View style={styles.header}>
        <Text style={styles.title}>{t('site.photo.annotate.title')}</Text>
      </View>

      <GestureDetector gesture={pan}>
        <Canvas ref={canvasRef} style={{ width: canvasW, height: canvasH }}>
          {image ? (
            <SkiaImage image={image} x={0} y={0} width={canvasW} height={canvasH} fit="fill" />
          ) : null}
          <Group>
            {strokes.map((s, i) => (
              <Path
                key={i}
                path={denormalisePath(s.d, canvasW, canvasH)}
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
                path={denormalisePath(liveD, canvasW, canvasH)}
                color={PEN_COLOR}
                style="stroke"
                strokeWidth={STROKE_FRACTION * longEdge}
                strokeJoin="round"
                strokeCap="round"
              />
            ) : null}
          </Group>
        </Canvas>
      </GestureDetector>

      <View style={styles.toolbar}>
        <ToolButton
          label={t('site.photo.annotate.pen')}
          active
          palette={palette}
          onPress={() => {}}
        />
        <ToolButton
          label={t('site.photo.annotate.undo')}
          palette={palette}
          disabled={strokes.length === 0}
          onPress={undo}
          testID="annotate-undo"
        />
        <ToolButton
          label={t('site.photo.annotate.clear')}
          palette={palette}
          disabled={strokes.length === 0}
          onPress={clear}
          testID="annotate-clear"
        />
        {onCancel ? (
          <ToolButton label={t('common.back')} palette={palette} onPress={onCancel} />
        ) : null}
        <ToolButton
          label={t('site.photo.annotate.save')}
          palette={palette}
          primary
          onPress={() => void save()}
          testID="annotate-save"
        />
      </View>
    </View>
  );
}

function ToolButton({
  label,
  onPress,
  palette,
  active,
  primary,
  disabled,
  testID,
}: {
  label: string;
  onPress: () => void;
  palette: Palette;
  active?: boolean;
  primary?: boolean;
  disabled?: boolean;
  testID?: string;
}) {
  return (
    <TouchableOpacity
      testID={testID}
      disabled={disabled}
      onPress={onPress}
      style={{
        minHeight: 44,
        paddingHorizontal: spacing.md,
        justifyContent: 'center',
        borderRadius: radius.md,
        opacity: disabled ? 0.4 : 1,
        backgroundColor: primary ? palette.primary : 'transparent',
      }}
    >
      <Text
        style={{
          color: primary ? colors.bg : active ? palette.primary : palette.text,
          fontFamily: fontFamily.semibold,
          fontSize: typography.label.fontSize,
          // Only the filled primary action (Save) is a CTA — uppercase it; the transparent tools
          // (Pen / Undo / Clear all / Back) keep their natural case (PO 2026-08-01).
          textTransform: primary ? 'uppercase' : undefined,
        }}
      >
        {label}
      </Text>
    </TouchableOpacity>
  );
}

/** Points (normalised) → an SVG path with quadratic midpoint smoothing (the standard freehand idiom). */
function strokeToSvg(pts: { x: number; y: number }[]): string {
  if (pts.length === 0) return '';
  const p = pts.map((pt) => ({ x: round(pt.x), y: round(pt.y) }));
  let d = `M${p[0]!.x} ${p[0]!.y}`;
  for (let i = 1; i < p.length - 1; i++) {
    const mx = round((p[i]!.x + p[i + 1]!.x) / 2);
    const my = round((p[i]!.y + p[i + 1]!.y) / 2);
    d += `Q${p[i]!.x} ${p[i]!.y} ${mx} ${my}`;
  }
  const last = p[p.length - 1]!;
  d += `L${last.x} ${last.y}`;
  return d;
}

async function writePng(snapshot: SkImage): Promise<string> {
  const base64 = snapshot.encodeToBase64();
  const uri = `${FileSystem.documentDirectory}annotation-${Date.now()}.png`;
  await FileSystem.writeAsStringAsync(uri, base64, {
    encoding: FileSystem.EncodingType.Base64,
  });
  return uri;
}

const round = (n: number): number => Math.round(n * 1e5) / 1e5;

const makeStyles = (palette: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: palette.bg },
    header: { padding: spacing.md },
    title: {
      color: palette.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.title.fontSize,
    },
    toolbar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      padding: spacing.sm,
      flexWrap: 'wrap',
    },
  });
