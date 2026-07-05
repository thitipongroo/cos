// OfflineBanner — shown when device is offline (spec §Phase 10 shared components)
// Mounts at the top of the screen. Hidden when online.

import { View, Text, StyleSheet } from 'react-native';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useT } from '../i18n';
import { colors, fontFamily } from '../theme/tokens';

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();
  const t = useT();

  if (isOnline) return null;

  return (
    <View style={styles.banner} testID="offline-banner">
      <Text style={styles.text}>{t('sync.offlineBanner.message')}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: colors.danger,
    paddingVertical: 6,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  text: {
    color: colors.bg,
    fontSize: 12,
    fontFamily: fontFamily.semibold,
  },
});
