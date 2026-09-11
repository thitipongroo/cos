// Support Center — POST-AUTH route (product-owner decision 2026-08-17).
//
// Opened by the signed-in TopBar's "?", which until that decision showed an
// `Alert.alert('Help & Support', 'coming soon')` because there was no in-app help surface to send
// anyone to. There was one — app/(auth)/support.tsx — but it could not be reached from here:
// AuthGate in app/_layout.tsx redirects an authenticated user out of the (auth) group
// (`isAuthenticated && inAuthGroup → /(app)/home`), so a push from a signed-in screen landed on Home.
// This route is the (app) twin that fixes that, exactly as app/(app)/privacy-policy.tsx does for the
// Privacy Policy (PO decision 2026-08-04).
//
//   The same bounce is why the drawer's Support row was removed in this change: `/support` had been
//   added to `SHARED_LINKS` on 2026-08-10 to give signed-in users a way to ask for help, and it had
//   never worked. The product owner ruled on 2026-08-17 that the "?" is the single post-auth entry
//   rather than restoring a second one — so there is now exactly one way in from each side.
//
// ── THIS ROUTE IS A FRAME, AND NOTHING ELSE, SINCE 2026-09-11 ───────────────────────────────────
//
// It renders `components/SupportHubDocument.tsx` and adds nothing to it. The screen IS the drawing
// (`mockup/mobile/support_center/01_dashboard`).
//
// IT USED TO ADD THREE CARDS and the product owner removed all three on 2026-09-11:
//
//   YOUR SESSION            the signed-in name and role, and the active project
//   DEVICE DIAGNOSTICS      connection, queued changes, unresolved conflicts, storage, build
//   WHAT YOUR ROLE CAN OPEN the §6.4 module list, via `drawerLinksFor(role)`
//
// Every one of them was REAL — that is what makes the removal worth recording rather than just
// doing. They were added on 2026-08-17 on the reasoning that "a support screen that ignores the
// identity, project and device state the app already holds is asking the user to type back what it
// knows", and that reasoning was sound. What changed is that the Support Centre split in two the
// same day this drawing landed: the pre-auth screen took the job of helping someone who cannot get
// IN, and a diagnostics dump belongs to THAT conversation, not to a help library. The nearest
// equivalent still exists where it is useful — `(auth)/support.tsx`'s FIELD ASSISTANT panel.
//
// So this file no longer reads authStore, projectStore, the sync queue, the conflict list or the
// §6.4 matrix, and the imports for all of them are gone with the cards. Nothing here is commented
// out: the record of what was removed is this paragraph and the git history, not dead code.
//
// No app bar of its own, and no page title: <TopBar /> supplies the brand, the "?" that got here and
// the "<" back control, and Breadcrumb.tsx registers this path, which is what makes it a child
// screen (§32.7 "a screen is named ONCE"). It follows the user's theme rather than pinning dark —
// §32.7 pins only the pre-auth surfaces, which this is not.

import { View, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { SupportHubDocument } from '../../components/SupportHubDocument';
import { useBackendHealth } from '../../components/SupportPrimitives';
import { usePalette } from '../../theme/usePalette';
import { spacing } from '../../theme/tokens';

export default function SupportScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const pal = usePalette();
  const router = useRouter();
  const { health, minutesAgo } = useBackendHealth();

  return (
    <View style={[styles.root, { backgroundColor: pal.bg }]}>
      <SupportHubDocument
        testID="support"
        palette={pal}
        // GROUP-QUALIFIED. The destination exists in `(auth)` and `(app)`, groups add no path
        // segment, and AuthGate bounces a signed-in user out of `(auth)` — so a bare push is
        // ambiguous and could land on Home. Same rule as `DrawerLink.href`.
        onOpenChat={() => router.push('/(app)/help-chat')}
        health={health}
        minutesAgo={minutesAgo}
        paddingBottom={insets.bottom + spacing.xl}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
});
