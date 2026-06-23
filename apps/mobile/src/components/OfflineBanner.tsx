// OfflineBanner — shown when device is offline (spec §Phase 10 shared components)
// Mounts at the top of the screen. Hidden when online.

import { View, Text, StyleSheet } from 'react-native';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { colors, fontFamily } from '../theme/tokens';

export function OfflineBanner() {
  const { isOnline } = useNetworkStatus();

  if (isOnline) return null;

  return (
    <View style={styles.banner}>
      <Text style={styles.text}>Offline — changes will sync when reconnected</Text>
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
