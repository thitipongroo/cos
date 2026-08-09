// Account settings — security, preferences, app info (all roles).
// Implements mockup/mobile/05_site_worker/05_profile/01_account_settings.
//
// A SCREEN pushed from the navigation drawer's Settings row (product-owner decision 2026-08-09).
// The account controls lived inside the drawer for one build, which is what the 2026-08-09 "the
// drawer IS the profile" ruling first produced — but the panel then carried two different kinds of
// thing, navigation and settings, and ~900px of a 2400px screen sat below the fold. Splitting them
// is also what the mockups themselves do: the tenant-admin drawer drawing is short (Field Tools +
// Settings + Logout) and `05_profile/01_account_settings` is a full screen of its own.
//
// The drawer is still the profile in the sense that mattered: identity lives there, and this is
// reached from it. There is no `/profile` route.
//
// NOT `system-settings`: that is the TENANT_ADMIN tab for tenant-wide configuration. This is the
// signed-in user's own account, on every role.

import { View, ScrollView, StyleSheet } from 'react-native';
import { AccountSettings } from '../../components/AccountSettings';
import { spacing } from '../../theme/tokens';
import { usePalette } from '../../theme/usePalette';

export default function AccountSettingsScreen() {
  const p = usePalette();
  return (
    <ScrollView
      testID="account-settings-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
    >
      {/* No in-content title: the breadcrumb already reads HOME › SETTINGS (§32.7). */}
      <View>
        <AccountSettings />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.md, paddingBottom: spacing.xl },
});
