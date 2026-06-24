// PhotoCapture — capture a photo with expo-camera and queue it offline.
// Each capture writes a local_photos row (upload_status PENDING) linked to the given entity;
// PhotoUploadQueue/SyncManager upload it when online. §32.7 Mobile Core Component Library.

import { useRef, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { database } from '../db/database';
import Photo, { PhotoEntityType } from '../db/models/Photo';
import { colors, fontFamily, spacing, typography } from '../theme/tokens';

interface PhotoCaptureProps {
  entityType: PhotoEntityType;
  entityId: string;
  onCaptured?: (count: number) => void;
}

export function PhotoCapture({ entityType, entityId, onCaptured }: PhotoCaptureProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [count, setCount] = useState(0);

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
        <Text style={styles.buttonText}>Enable camera</Text>
      </TouchableOpacity>
    );
  }

  const onCapture = async (): Promise<void> => {
    const picture = await cameraRef.current?.takePictureAsync();
    if (!picture?.uri) return;
    await database.write(async () => {
      await database.get<Photo>('local_photos').create((r) => {
        r.photoId = '';
        r.entityType = entityType;
        r.entityId = entityId;
        r.localPath = picture.uri;
        r.uploadStatus = 'PENDING';
        r.serverFileId = null;
      });
    });
    const next = count + 1;
    setCount(next);
    onCaptured?.(next);
  };

  return (
    <View testID="photo-capture" style={styles.container}>
      <CameraView ref={cameraRef} style={styles.preview} facing="back" />
      <TouchableOpacity testID="capture-photo-button" style={styles.button} onPress={onCapture}>
        <Text style={styles.buttonText}>Capture photo</Text>
      </TouchableOpacity>
      {count > 0 ? (
        <Text testID="photo-count" style={styles.count}>
          {count} photo(s) queued
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
  count: {
    color: colors.success,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
});
