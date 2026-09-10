// Help Chat — POST-AUTH route (mockup/mobile/01_authen/05_get_help/03_help_chat).
//
// The twin of `app/(auth)/help-chat.tsx`. The chat is open on BOTH sides of login (ADR-093
// decision 3), and this route exists because AuthGate in `app/_layout.tsx` redirects an
// authenticated user out of the `(auth)` group — a signed-in push to the pre-auth route lands on
// Home. Same answer as `app/(app)/support.tsx` and `app/(app)/privacy-policy.tsx`.
//
// NO APP BAR OF ITS OWN for the brand and the back control — <TopBar /> supplies those, and
// `Breadcrumb.tsx` registers this path (§32.7 "a screen is named ONCE"). What it does keep is the
// drawing's `Agent Online` status line, because that belongs to the conversation rather than to the
// app's chrome.
//
// It follows the user's theme; §32.7 pins only the pre-auth surfaces.
//
// SIGNING IN CHANGES NOTHING HERE YET. `platform.support_tickets` carries a nullable `tenant_id`
// and `opened_by` precisely so an anonymous ticket and an account holder's ticket live in one table
// (ADR-093 §2) — but no endpoint reads or writes either, so both routes render the same drawn
// thread. See `components/HelpChatDocument.tsx` for what is inert and what happens on a press.

import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useT } from '../../i18n';
import { HelpChatDocument } from '../../components/HelpChatDocument';
import { usePalette } from '../../theme/usePalette';
import { fontFamily } from '../../theme/tokens';

export default function HelpChatScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const p = usePalette();

  const t = useT();

  return (
    <View style={{ flex: 1, backgroundColor: p.bg }}>
      {/* The conversation's own status line. The brand, the title and the back control are
          <TopBar />'s — this is the one piece of the drawing's bar that is about the chat. */}
      <View style={[styles.statusRow, { borderBottomColor: p.border, backgroundColor: p.surface }]}>
        <View style={[styles.statusDot, { backgroundColor: p.success }]} />
        <Text style={[styles.statusText, { color: p.muted }]} numberOfLines={1}>
          {t('helpChat.agentOnline')}
        </Text>
      </View>

      <HelpChatDocument palette={p} paddingBottom={insets.bottom} />
    </View>
  );
}

const styles = StyleSheet.create({
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  // A circle: 999 marks a shape whose radius is half its width (§32.7).
  statusDot: { width: 8, height: 8, borderRadius: 999 },
  statusText: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
