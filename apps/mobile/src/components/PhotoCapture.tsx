// PhotoCapture — capture a photo with expo-camera, queue it offline, and mark it up (§32.7; ADR-056).
// Each capture writes a local_photos row (upload_status PENDING) linked to the given entity;
// runPushSync/PhotoUploadQueue upload it when online. A gallery grid below the camera shows the
// captured photos; tapping one opens <PhotoAnnotation /> to draw on it. The annotation is stored
// locally (dirty) and enqueued for /sync/push once the photo's file has uploaded and has a server
// file_id — an annotation on a not-yet-uploaded photo simply waits (ADR-056: the photo/media flush
// is last, and an annotation whose photo never uploads stays local; accepted evidence-gap risk).

import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Image, ScrollView } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { eq } from 'drizzle-orm';
import { useLiveQuery } from 'drizzle-orm/expo-sqlite';
import { db, newLocalId, pendingPhotoCount } from '../db/database';
import type { PhotoEntityType } from '../db/database';
import { localPhotos, localPhotoAnnotations, type Photo } from '../db/schema';
import { getAnnotation, upsertAnnotation } from '../db/annotationRepo';
import { photoQueueStatus } from '../sync/photoQueueLimit';
import { PhotoAnnotation, type AnnotationStroke } from './PhotoAnnotation';
import { useT } from '../i18n';
import { colors, fontFamily, spacing, typography } from '../theme/tokens';

interface PhotoCaptureProps {
  entityType: PhotoEntityType;
  entityId: string;
  onCaptured?: (count: number) => void;
}

interface Annotating {
  photo: Photo;
  initialStrokes: AnnotationStroke[];
}

export function PhotoCapture({ entityType, entityId, onCaptured }: PhotoCaptureProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [count, setCount] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const [annotating, setAnnotating] = useState<Annotating | null>(null);
  const t = useT();

  // Reactive list of this entity's photos — re-renders as captures/uploads change the rows.
  const { data: photos } = useLiveQuery(
    db.select().from(localPhotos).where(eq(localPhotos.entityId, entityId)),
  );
  // Reactive set of photo ids that have a saved annotation — drives the "annotated" badge.
  const { data: annotationRows } = useLiveQuery(
    db.select({ localPhotoId: localPhotoAnnotations.localPhotoId }).from(localPhotoAnnotations),
  );
  const annotatedIds = new Set(annotationRows.map((r) => r.localPhotoId));

  if (!permission) {
    return null; // permissions still loading
  }

  if (!permission.granted) {
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
        <ScrollView horizontal testID="photo-gallery" contentContainerStyle={styles.grid}>
          {photos.map((photo) => (
            <TouchableOpacity
              key={photo.id}
              testID={`gallery-photo-${photo.id}`}
              style={styles.card}
              onPress={() => void openAnnotate(photo)}
            >
              <Image source={{ uri: photo.localPath }} style={styles.thumb} />
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
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {count > 0 ? (
        <Text testID="photo-count" style={styles.count}>
          {t('photos.capture.queued', { count })}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { gap: spacing.sm },
  preview: { height: 200, borderRadius: 8, overflow: 'hidden' },
  button: {
    minHeight: 48,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: colors.bg,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
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
  grid: { gap: spacing.sm, paddingVertical: spacing.xs },
  card: { width: 96, gap: 2 },
  thumb: { width: 96, height: 96, borderRadius: 8, backgroundColor: colors.surface },
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
