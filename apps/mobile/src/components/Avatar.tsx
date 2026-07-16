// Avatar — the signed-in user's face in a dark-surface header (§32.7 "Mobile Dark Surfaces").
//
// Replaces the Profile bottom-nav tab for SITE_ENGINEER (master §Phase 10; product-owner decision
// 2026-07-16), so it is a real navigation control and carries the full 44px icon-button tap target.
//
// Renders, in order: the user's uploaded photo (platform.users.photo_url), else their initials from
// the token's `name` claim, else a person glyph. The mockup's photo of a worker in a hard hat is not
// used — §32.7:622 prohibits hard-hat imagery, and it was an externally hosted image.

import { useEffect, useState } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getMe } from '../api/users';
import { initialsOf } from '../lib/initials';
import { useAuthStore } from '../store/authStore';
import { colors, darkColors, fontFamily, touchTarget, typography } from '../theme/tokens';

export function Avatar({
  testID,
  onPress,
  variant = 'dark',
}: {
  testID?: string;
  onPress: () => void;
  /** 'dark' on the Site Engineer top bar; 'light' on every other role's top bar (§32.7). */
  variant?: 'light' | 'dark';
}) {
  const displayName = useAuthStore((s) => s.displayName);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    getMe()
      .then((me) => setPhotoUrl(me.photo_url))
      .catch(() => {
        // Offline, or the account has no photo — initials carry the avatar. The name comes from the
        // persisted session, so this never blocks the header from drawing.
      });
  }, []);

  const initials = initialsOf(displayName);
  const showPhoto = photoUrl !== null && !photoFailed;
  const dark = variant === 'dark';

  return (
    <TouchableOpacity
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={displayName ?? undefined}
      style={styles.tap}
      onPress={onPress}
    >
      <View style={[styles.circle, dark ? styles.circleDark : styles.circleLight]}>
        {showPhoto ? (
          <Image
            testID="avatar-photo"
            source={{ uri: photoUrl }}
            style={styles.photo}
            // A broken/expired URL must not leave a blank circle — fall back to initials.
            onError={() => setPhotoFailed(true)}
          />
        ) : initials ? (
          <Text testID="avatar-initials" style={[styles.initials, !dark && styles.initialsLight]}>
            {initials}
          </Text>
        ) : (
          <MaterialIcons
            name="person"
            size={18}
            color={dark ? darkColors.muted : colors.textSecondary}
          />
        )}
      </View>
    </TouchableOpacity>
  );
}

const SIZE = 32;

const styles = StyleSheet.create({
  tap: {
    minWidth: touchTarget.iconButton,
    minHeight: touchTarget.iconButton,
    alignItems: 'center',
    justifyContent: 'center',
  },
  circle: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  circleDark: { backgroundColor: darkColors.elevated, borderColor: darkColors.border },
  circleLight: { backgroundColor: colors.surface, borderColor: colors.textSecondary },
  photo: { width: SIZE, height: SIZE },
  initials: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.semibold,
    color: darkColors.text,
  },
  initialsLight: { color: colors.textPrimary },
});
