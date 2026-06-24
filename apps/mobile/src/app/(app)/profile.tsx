// Profile screen — account info + logout (all roles). Offline-safe (reads local auth state).

import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { useAuthStore } from '../../store/authStore';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';

export default function ProfileScreen() {
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  const logout = useAuthStore((s) => s.logout);

  return (
    <View testID="profile-screen" style={styles.container}>
      <Text style={styles.heading}>Profile</Text>

      <View style={styles.row}>
        <Text style={styles.label}>User ID</Text>
        <Text testID="profile-user-id" style={styles.value}>
          {userId ?? '—'}
        </Text>
      </View>
      <View style={styles.row}>
        <Text style={styles.label}>Role</Text>
        <Text testID="profile-role" style={styles.value}>
          {role ?? '—'}
        </Text>
      </View>

      <TouchableOpacity testID="logout-button" style={styles.logout} onPress={() => logout()}>
        <Text style={styles.logoutText}>Log out</Text>
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.sm },
  heading: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  label: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  value: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
  },
  logout: {
    marginTop: spacing.lg,
    minHeight: 48,
    borderRadius: 8,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  logoutText: {
    color: colors.bg,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
  },
});
