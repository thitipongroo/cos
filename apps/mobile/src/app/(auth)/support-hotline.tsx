// IT Support Hotline — PRE-AUTH route (mockup/mobile/01_authen/05_get_help/02_hotline_details).
//
// A child of the Support Centre, reached by the chevron the drawing puts on its IT Hotline card.
// That card no longer dials in place; `CALL NOW` on this screen is the dial (§32.7, ADR-093
// decision 4).
//
// TWO ROUTES, ONE DOCUMENT — the shape `PrivacyPolicyDocument` uses. `SupportCenterDocument` was
// the other example until 2026-09-11, when the Support Centre STOPPED being one document rendered
// twice: it is two screens now, doing two jobs, and the hotline is not. This one really is one
// document, so the shape still applies here. The post-auth twin is `app/(app)/support-hotline.tsx`. It exists for the same reason theirs
// do: AuthGate in `app/_layout.tsx` redirects an authenticated user out of the `(auth)` group
// (`isAuthenticated && inAuthGroup → /(app)/home`), so a push from a signed-in screen to this route
// would land on Home.
//
// DARK SURFACE, PINNED rather than read from the theme store: this is reached from the Support
// Centre, which is itself pushed from the dark OTP screen, so following a light preference would
// break mid-flow (§32.7 pinned pre-auth surfaces).
//
// THE TOP BAR FOLLOWS `code.html`. The drawing's two files disagree about it: `code.html` ends the
// bar with an empty 44px spacer, `screen.png` shows a trailing call glyph. §32.7 settles it — the
// HTML is the drawing and the PNG is a render of some state of it — and it is also the better
// answer, because the screen then has exactly one way to place the same call.

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useT } from '../../i18n';
import { SupportHotlineDocument } from '../../components/SupportHotlineDocument';
import { paletteFor } from '../../theme/palette';
import { darkScreen } from '../../theme/screenStyles';
import { darkColors, spacing } from '../../theme/tokens';

const DARK = paletteFor('dark');

export default function SupportHotlineScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  return (
    <View style={[darkScreen.root, { paddingTop: insets.top }]}>
      <View style={darkScreen.header}>
        <Pressable
          testID="support-hotline-back"
          accessibilityRole="button"
          accessibilityLabel={t('support.back')}
          onPress={() => router.back()}
          style={darkScreen.backButton}
        >
          <MaterialIcons name="arrow-back" size={24} color={darkColors.primary} />
        </Pressable>
        <Text style={darkScreen.headerTitle} numberOfLines={1}>
          {t('supportHotline.title')}
        </Text>
        {/* The drawing's own trailing spacer, so the title sits centred. */}
        <View style={styles.spacer} />
      </View>

      <SupportHotlineDocument palette={DARK} paddingBottom={insets.bottom + spacing.xl} />
    </View>
  );
}

const styles = StyleSheet.create({
  spacer: { width: 44 },
});
