// PhotoCapture — capture a photo with expo-camera, queue it offline, and mark it up (§32.7; ADR-056).
// Each capture writes a local_photos row (upload_status PENDING) linked to the given entity;
// runPushSync/PhotoUploadQueue upload it when online. A gallery grid below the camera shows the
// captured photos; tapping one opens <PhotoAnnotation /> to draw on it. The annotation is stored
// locally (dirty) and enqueued for /sync/push once the photo's file has uploaded and has a server
// file_id — an annotation on a not-yet-uploaded photo simply waits (ADR-056: the photo/media flush
// is last, and an annotation whose photo never uploads stays local; accepted evidence-gap risk).

import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, Alert, ScrollView } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db, newLocalId, pendingPhotoCount } from '../db/database';
import type { PhotoEntityType } from '../db/database';
import { localPhotos, localPhotoAnnotations, type Photo } from '../db/schema';
import { getAnnotation, upsertAnnotation } from '../db/annotationRepo';
import { deletePhotoLocal } from '../db/photoRepo';
import { photoQueueStatus } from '../sync/photoQueueLimit';
import { canDeletePhoto, GALLERY_COLUMNS } from '../lib/photoGallery';
import { PhotoAnnotation, type AnnotationStroke } from './PhotoAnnotation';
import { useT } from '../i18n';
import { colors, fontFamily, radius, spacing, typography } from '../theme/tokens';
import { usePalette } from '../theme/usePalette';

interface PhotoCaptureProps {
  entityType: PhotoEntityType;
  entityId: string;
  onCaptured?: (count: number) => void;
  /**
   * 'grid' (default) — live viewfinder above a 3-column gallery. The shape for screens where the
   *   photos ARE the record: deliveries, inspections, issues.
   * 'strip' — the daily report's ภาพประกอบ section (mockup 03_reports): a horizontal row of square
   *   thumbnails ending in a dashed UPLOAD tile, with the camera opening only when that tile is
   *   tapped. Same capture, same queue, same annotator — only the chrome differs.
   * 'viewfinder' — the issue-capture mockup (02_issues): a 4:3 preview with an inset guide, a LIVE
   *   pill, and a round shutter ON the frame, over the same thumbnail strip.
   */
  layout?: 'grid' | 'strip' | 'viewfinder';
}

interface Annotating {
  photo: Photo;
  initialStrokes: AnnotationStroke[];
}

export function PhotoCapture({
  entityType,
  entityId,
  onCaptured,
  layout = 'grid',
}: PhotoCaptureProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [count, setCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [annotating, setAnnotating] = useState<Annotating | null>(null);
  // Strip layout only: the viewfinder is closed until the UPLOAD tile is tapped, so a report form is
  // not a live camera the whole time it is being filled in.
  const [cameraOpen, setCameraOpen] = useState(false);
  const t = useT();
  // The strip and viewfinder chrome are EMPTY surfaces — a tile with no photo in it yet, the
  // caption under the shutter. Those have to follow the shell's theme or they punch a white hole
  // in a dark screen; the parts that sit ON a photo (the delete pip, the LIVE pill) stay on the
  // fixed palette, because their backdrop is the image, not the page.
  const p = usePalette();

  // Reactive list of this entity's photos — re-renders as captures/uploads change the rows.
  const { data: photos } = useLiveQuery(
    db.select().from(localPhotos).where(eq(localPhotos.entityId, entityId)),
  );
  // Reactive set of photo ids that have a saved annotation — drives the "annotated" badge.
  const { data: annotationRows } = useLiveQuery(
    db.select({ localPhotoId: localPhotoAnnotations.localPhotoId }).from(localPhotoAnnotations),
  );
  const annotatedIds = new Set(annotationRows.map((r) => r.localPhotoId));

  // The strip asks for the camera at the moment the UPLOAD tile is tapped, not on mount: the
  // thumbnails and the delete/annotate actions all work without the permission, and a report form
  // that renders as nothing but a permission button before the worker has asked for a camera is
  // both confusing and a prompt they did not invite.
  const openCamera = async (): Promise<void> => {
    if (!permission?.granted) {
      const result = await requestPermission();
      if (!result.granted) return;
    }
    setCameraOpen(true);
  };

  if (layout !== 'strip' && !permission) {
    return null; // permissions still loading
  }

  if (layout !== 'strip' && !permission?.granted) {
    return (
      <TouchableOpacity
        testID="photo-permission-button"
        style={styles.button}
        onPress={() => {
          void requestPermission();
        }}
      >
        <Text style={styles.buttonText}>{t('photos.capture.enable')}</Text>
      </TouchableOpacity>
    );
  }

  const onCapture = async (): Promise<void> => {
    // §17.7: block new captures when the pending-upload queue is full (100); warn at 80.
    const status = photoQueueStatus(pendingPhotoCount());
    if (status === 'FULL') {
      setNotice(t('photos.capture.queueFull'));
      return;
    }
    setNotice(status === 'WARN' ? t('photos.capture.queueWarn') : null);

    const picture = await cameraRef.current?.takePictureAsync();
    if (!picture?.uri) return;
    await db.insert(localPhotos).values({
      id: newLocalId(),
      photoId: '',
      entityType,
      entityId,
      localPath: picture.uri,
      uploadStatus: 'PENDING',
      serverFileId: null,
    });
    const next = count + 1;
    setCount(next);
    onCaptured?.(next);
  };

  const openAnnotate = async (photo: Photo): Promise<void> => {
    const existing = await getAnnotation(photo.id);
    setAnnotating({ photo, initialStrokes: (existing?.strokes ?? []) as AnnotationStroke[] });
  };

  const onSaveAnnotation = async (strokes: AnnotationStroke[]): Promise<void> => {
    if (annotating) await upsertAnnotation(annotating.photo.id, strokes);
    setAnnotating(null);
  };

  // Deleting destroys local-only work (the photo and any markup), so it is confirmed first. Alert is
  // the platform's own dialog, not an app modal — §32.7's "no modal-on-modal" rule is about stacking
  // custom modals, and <PhotoCapture /> is mounted on plain screens (deliveries/inspections/issues).
  const confirmDelete = (photo: Photo): void => {
    Alert.alert(t('photos.gallery.deleteConfirmTitle'), t('photos.gallery.deleteConfirmBody'), [
      { text: t('photos.gallery.deleteConfirmCancel'), style: 'cancel' },
      {
        text: t('photos.gallery.deleteConfirmOk'),
        style: 'destructive',
        onPress: () => void deletePhotoLocal(photo.id),
      },
    ]);
  };

  // Full-screen annotator over the whole capture UI while marking up.
  if (annotating) {
    return (
      <PhotoAnnotation
        photoUri={annotating.photo.localPath}
        initialStrokes={annotating.initialStrokes}
        onSave={(strokes) => void onSaveAnnotation(strokes)}
        onCancel={() => setAnnotating(null)}
        theme="dark"
      />
    );
  }

  // Shared by 'strip' and 'viewfinder' — both mockups end their photo zone with the same row.
  const renderStrip = () => (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.strip}
      testID="photo-strip"
    >
      {photos.map((photo) => (
        <View key={photo.id} style={[styles.stripTile, { backgroundColor: p.surface }]}>
          <TouchableOpacity
            testID={`gallery-photo-${photo.id}`}
            onPress={() => void openAnnotate(photo)}
          >
            <Image source={{ uri: photo.localPath }} style={styles.stripThumb} />
          </TouchableOpacity>
          {canDeletePhoto(photo.uploadStatus) ? (
            <TouchableOpacity
              testID={`gallery-delete-${photo.id}`}
              style={styles.stripDelete}
              accessibilityLabel={t('photos.gallery.delete')}
              onPress={() => confirmDelete(photo)}
            >
              <MaterialIcons name="close" size={16} color={colors.bg} />
            </TouchableOpacity>
          ) : null}
          {/* Sync state stays visible — a worker on site needs to know a photo is still queued
              (§17.7), and the strip has no caption row to put it in. */}
          <View style={styles.stripBadge}>
            <View
              style={[
                styles.stripDot,
                {
                  backgroundColor:
                    photo.uploadStatus === 'UPLOADED' ? colors.success : colors.warning,
                },
              ]}
            />
          </View>
        </View>
      ))}
      {layout === 'strip' ? (
        <TouchableOpacity
          testID="photo-upload-tile"
          style={[
            styles.stripTile,
            styles.uploadTile,
            { backgroundColor: p.surface, borderColor: p.border },
          ]}
          accessibilityLabel={t('photos.capture.addPhoto')}
          onPress={() => void openCamera()}
        >
          <MaterialIcons name="add" size={24} color={p.muted} />
          <Text style={[styles.uploadTileText, { color: p.muted }]}>
            {t('photos.capture.upload')}
          </Text>
        </TouchableOpacity>
      ) : null}
    </ScrollView>
  );

  if (layout === 'viewfinder') {
    return (
      <View testID="photo-capture" style={styles.container}>
        {/* The mockup's live 4:3 frame. The permission gate above still applies — unlike the strip,
            this layout IS a camera, so there is nothing honest to render without one. */}
        <View style={styles.viewfinder}>
          <CameraView ref={cameraRef} style={styles.viewfinderCamera} facing="back" />
          {/* Inset guide + LIVE pill, both non-interactive so they never eat a shutter tap. */}
          <View style={styles.viewfinderGuide} pointerEvents="none" />
          <View style={styles.livePill} pointerEvents="none">
            <View style={styles.liveDot} />
            <Text style={styles.liveText}>{t('photos.capture.live')}</Text>
          </View>
          <TouchableOpacity
            testID="capture-photo-button"
            accessibilityLabel={t('photos.capture.capture')}
            style={styles.shutter}
            onPress={onCapture}
          >
            <View style={styles.shutterInner} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.shutterHint, { color: p.muted }]}>
          {t('photos.capture.shutterHint')}
        </Text>
        {notice ? (
          <Text testID="photo-queue-notice" style={styles.notice}>
            {notice}
          </Text>
        ) : null}
        {photos.length > 0 ? renderStrip() : null}
        {count > 0 ? (
          <Text testID="photo-count" style={styles.count}>
            {t('photos.capture.queued', { count })}
          </Text>
        ) : null}
      </View>
    );
  }

  if (layout === 'strip') {
    return (
      <View testID="photo-capture" style={styles.container}>
        {cameraOpen ? (
          <>
            <CameraView ref={cameraRef} style={styles.preview} facing="back" />
            <View style={styles.stripActions}>
              <TouchableOpacity
                testID="capture-photo-button"
                style={[styles.button, styles.stripButton]}
                onPress={onCapture}
              >
                <Text style={styles.buttonText}>{t('photos.capture.capture')}</Text>
              </TouchableOpacity>
              <TouchableOpacity
                testID="close-camera-button"
                style={styles.stripClose}
                onPress={() => setCameraOpen(false)}
              >
                <Text style={styles.stripCloseText}>{t('photos.capture.done')}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
        {notice ? (
          <Text testID="photo-queue-notice" style={styles.notice}>
            {notice}
          </Text>
        ) : null}

        {renderStrip()}

        {count > 0 ? (
          <Text testID="photo-count" style={styles.count}>
            {t('photos.capture.queued', { count })}
          </Text>
        ) : null}
      </View>
    );
  }

  return (
    <View testID="photo-capture" style={styles.container}>
      <CameraView ref={cameraRef} style={styles.preview} facing="back" />
      <TouchableOpacity testID="capture-photo-button" style={styles.button} onPress={onCapture}>
        <Text style={styles.buttonText}>{t('photos.capture.capture')}</Text>
      </TouchableOpacity>
      {notice ? (
        <Text testID="photo-queue-notice" style={styles.notice}>
          {notice}
        </Text>
      ) : null}

      {/* Gallery grid (§32.7): captured photos as tappable cards — never a table. */}
      <Text style={styles.galleryTitle}>{t('photos.gallery.title')}</Text>
      {photos.length === 0 ? (
        <Text testID="gallery-empty" style={styles.empty}>
          {t('photos.gallery.empty')}
        </Text>
      ) : (
        <View testID="photo-gallery" style={styles.grid}>
          {photos.map((photo) => (
            <View key={photo.id} style={styles.card}>
              <TouchableOpacity
                testID={`gallery-photo-${photo.id}`}
                onPress={() => void openAnnotate(photo)}
              >
                <Image source={{ uri: photo.localPath }} style={styles.thumb} />
              </TouchableOpacity>
              {/* Only photos whose bytes never reached the server can be removed here — see
                  canDeletePhoto(). An uploaded file is Tenant Admin territory (spec §14). */}
              {canDeletePhoto(photo.uploadStatus) ? (
                <TouchableOpacity
                  testID={`gallery-delete-${photo.id}`}
                  style={styles.deleteButton}
                  accessibilityLabel={t('photos.gallery.delete')}
                  onPress={() => confirmDelete(photo)}
                >
                  <Text style={styles.deleteButtonText}>✕</Text>
                </TouchableOpacity>
              ) : null}
              <Text style={styles.cardLabel}>
                {photo.uploadStatus === 'UPLOADED'
                  ? t('photos.gallery.uploaded')
                  : t('photos.gallery.pending')}
              </Text>
              <Text style={styles.cardHint}>
                {annotatedIds.has(photo.id)
                  ? t('photos.gallery.annotated')
                  : t('photos.gallery.tapToAnnotate')}
              </Text>
            </View>
          ))}
        </View>
      )}

      {count > 0 ? (
        <Text testID="photo-count" style={styles.count}>
          {t('photos.capture.queued', { count })}
        </Text>
      ) : null}
    </View>
  );
}

/** Half-gutter each side of a card, so adjacent cards sit spacing.xs apart. */
const GUTTER = spacing.xs / 2;

/** Strip tile edge — the mockup's 120px square. */
const STRIP_TILE = 120;

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  preview: { height: 200, borderRadius: radius.lg, overflow: 'hidden' },
  button: {
    minHeight: 48,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: colors.bg,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
    textTransform: 'uppercase',
  },
  galleryTitle: {
    color: colors.textPrimary,
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    marginTop: spacing.xs,
  },
  empty: {
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },
  // Three across (GALLERY_COLUMNS), matching the mockup's grid-cols-3. Cards size by percentage so
  // the grid holds on any handset width. Gutters come from per-card padding, NOT a container `gap`:
  // three 33.3% cards already consume the full row, so a gap on top of that overflows it.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingVertical: spacing.xs,
  },
  card: {
    width: `${100 / GALLERY_COLUMNS}%`,
    flexGrow: 0,
    flexShrink: 0,
    paddingHorizontal: GUTTER,
    paddingBottom: spacing.xs,
    gap: 2,
  },
  thumb: {
    width: '100%',
    aspectRatio: 1,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  // Positioned against the card's padding box, which starts at the thumbnail's top-left corner.
  deleteButton: {
    position: 'absolute',
    top: 4,
    right: GUTTER + 4,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonText: { color: colors.bg, fontFamily: fontFamily.semibold, fontSize: 14 },
  cardLabel: {
    color: colors.textSecondary,
    fontFamily: fontFamily.medium,
    fontSize: typography.label.fontSize,
  },
  cardHint: {
    color: colors.primary,
    fontFamily: fontFamily.medium,
    fontSize: typography.label.fontSize,
  },
  // ── viewfinder layout (mockup 02_issues) ────────────────────────────────────────
  viewfinder: {
    aspectRatio: 4 / 3,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    // The camera fills this box, so the backgroundColor only shows for the instant before the
    // preview attaches — it is deliberately NOT themed.
    overflow: 'hidden',
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  viewfinderCamera: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 },
  viewfinderGuide: {
    position: 'absolute',
    top: spacing.md,
    left: spacing.md,
    right: spacing.md,
    bottom: spacing.md,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    borderRadius: radius.md,
  },
  livePill: {
    position: 'absolute',
    top: spacing.md,
    right: spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    paddingVertical: 4,
    borderRadius: radius.xl,
    backgroundColor: 'rgba(0,0,0,0.5)',
  },
  liveDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: colors.success },
  liveText: {
    color: '#FFFFFF',
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  // 64px ring with a 48px disc — the mockup's shutter, and comfortably over the 44px minimum.
  shutter: {
    marginBottom: spacing.lg,
    width: 64,
    height: 64,
    borderRadius: 999,
    borderWidth: 4,
    borderColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 48, height: 48, borderRadius: 999, backgroundColor: '#FFFFFF' },
  shutterHint: {
    textAlign: 'center',
    color: colors.textSecondary,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },
  // ── strip layout (mockup 03_reports ภาพประกอบ) ───────────────────────────────────────────────
  strip: { flexDirection: 'row', gap: spacing.sm, paddingVertical: spacing.xs },
  stripActions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  stripButton: { flex: 1 },
  stripClose: { minHeight: 48, justifyContent: 'center', paddingHorizontal: spacing.md },
  stripCloseText: {
    color: colors.textSecondary,
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    textTransform: 'uppercase',
  },
  stripTile: {
    width: STRIP_TILE,
    height: STRIP_TILE,
    borderRadius: radius.lg,
    overflow: 'hidden',
    backgroundColor: colors.surface,
  },
  stripThumb: { width: STRIP_TILE, height: STRIP_TILE },
  stripDelete: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 24,
    height: 24,
    borderRadius: 999, // circle (the documented capsule marker), not a step on the radius scale
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stripBadge: { position: 'absolute', left: 6, bottom: 6 },
  stripDot: { width: 8, height: 8, borderRadius: 999 },
  uploadTile: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  uploadTileText: {
    color: colors.textSecondary,
    fontFamily: fontFamily.semibold,
    fontSize: 10,
    letterSpacing: 0.5,
  },
  count: {
    color: colors.success,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
  notice: {
    color: colors.warning,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
});
