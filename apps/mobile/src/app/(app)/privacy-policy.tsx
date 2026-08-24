// Privacy Policy — post-auth route (PO decision 2026-08-04).
//
// Reached from the navigation drawer's PRIVACY POLICY item. A signed-in user needs the same notice
// they were shown before signing up — PDPA §23 makes the notice a standing disclosure, not a
// one-time consent screen — so this mounts the SAME <PrivacyPolicyDocument /> as
// app/(auth)/privacy-policy.tsx. There is exactly one copy of the policy text in the app.
//
// Two things differ from the pre-auth route, both consequences of being inside the (app) shell:
//   - No app bar of its own. <TopBar /> supplies the title, the breadcrumb and the "<" back control
//     (Breadcrumb.tsx registers this path, which is what makes it a child screen).
//   - It follows the user's theme instead of pinning dark, and takes its accent from the palette:
//     §32.7 scopes darkColors.cyan to the auth entry screens, so it stops at the (auth) boundary.
//
// It DOES pass `onDataCollection`: post-auth the Data Collection card is the entry point to the
// Transparency Portal (PO decision 2026-08-04), which is the deep version of that section and is
// only reachable once signed in.

import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { usePalette } from '../../theme/usePalette';
import { spacing } from '../../theme/tokens';
import { PrivacyPolicyDocument } from '../../components/PrivacyPolicyDocument';

export default function PrivacyPolicyScreen(): React.JSX.Element {
  const router = useRouter();
  const pal = usePalette();

  return (
    <View style={[styles.root, { backgroundColor: pal.bg }]}>
      <PrivacyPolicyDocument
        testID="privacy-policy"
        palette={pal}
        accent={pal.primary}
        paddingBottom={spacing.xl}
        onDataCollection={() => router.push('/transparency')}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
