// Help Chat — PRE-AUTH route (mockup/mobile/01_authen/05_get_help/03_help_chat).
//
// A child of the Support Centre, reached by the chevron the drawing puts on its Help Chat card.
// The chat is open on BOTH sides of login (ADR-093 decision 3), so it has a post-auth twin at
// `app/(app)/help-chat.tsx` — which exists for the reason every such pair here does: AuthGate in
// `app/_layout.tsx` redirects an authenticated user out of the `(auth)` group, so a signed-in push
// to this route would land on Home.
//
// DARK SURFACE, PINNED rather than read from the theme store — reached from the Support Centre,
// itself pushed from the dark OTP flow (§32.7 pinned pre-auth surfaces).
//
// THE TOP BAR carries the drawing's title and its `Agent Online` status line. What each control
// does, and which of them are inert, is in `components/HelpChatDocument.tsx`.

import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useT } from '../../i18n';
import { HelpChatDocument } from '../../components/HelpChatDocument';
import { paletteFor } from '../../theme/palette';
import { darkScreen } from '../../theme/screenStyles';
import { darkColors, fontFamily, typography } from '../../theme/tokens';

const DARK = paletteFor('dark');

export default function HelpChatScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useT();

  return (
    <View style={[darkScreen.root, { paddingTop: insets.top }]}>
      <View style={darkScreen.header}>
        <Pressable
          testID="help-chat-back"
          accessibilityRole="button"
          accessibilityLabel={t('support.back')}
          onPress={() => router.back()}
          style={darkScreen.backButton}
        >
          <MaterialIcons name="arrow-back" size={24} color={darkColors.primary} />
        </Pressable>

        {/* Title and status, centred — the drawing stacks them. */}
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {t('helpChat.title')}
          </Text>
          <View style={styles.statusRow}>
            <View style={styles.statusDot} />
            <Text style={styles.statusText} numberOfLines={1}>
              {t('helpChat.agentOnline')}
            </Text>
          </View>
        </View>

        {/* The drawing's trailing spacer, so the title block sits centred. */}
        <View style={styles.spacer} />
      </View>

      <HelpChatDocument palette={DARK} paddingBottom={insets.bottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  titleBlock: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  title: {
    color: darkColors.primary,
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  // A circle: 999 marks a shape whose radius is half its width (§32.7).
  statusDot: { width: 8, height: 8, borderRadius: 999, backgroundColor: darkColors.success },
  statusText: {
    color: darkColors.muted,
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  spacer: { width: 40 },
});
