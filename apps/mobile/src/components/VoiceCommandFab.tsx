// Voice command FAB for the SITE_ENGINEER home (ADR-073). The mockup's voice FAB, now with a defined
// behaviour: hold to record → transcribe (existing pipeline) → classify intent (AI gateway) → route.
//
// Reuses <VoiceNoteButton /> for the record+transcribe step; the routing is the pure, unit-tested
// actionForCommand. When the gateway is unavailable (no LLM key yet) or the command is unsupported
// (e.g. SEARCH — no screen), it shows a message rather than guessing an action (ห้ามเดา). Plain button,
// no glow — FAB glow remains §32.7-prohibited (outside the ADR-071 grid/progress-glow exception).

import { useCallback } from 'react';
import { View, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { VoiceNoteButton } from './VoiceNoteButton';
import { parseVoiceIntent } from '../api/voiceIntent';
import { actionForCommand } from '../lib/voiceCommand';
import { useI18n } from '../i18n';
import { spacing } from '../theme/tokens';
import { usePalette } from '../theme/usePalette';

const UNSUPPORTED_KEY: Record<'search' | 'destination' | 'unrecognized', string> = {
  search: 'voice.searchUnavailable',
  destination: 'voice.unknownScreen',
  unrecognized: 'voice.unrecognized',
};

export function VoiceCommandFab() {
  const router = useRouter();
  const { t } = useI18n();
  const p = usePalette();

  const onTranscript = useCallback(
    async (text: string) => {
      let command;
      try {
        command = await parseVoiceIntent(text);
      } catch {
        Alert.alert(t('voice.commandUnavailable'));
        return;
      }
      const action = actionForCommand(command);
      if (action.kind === 'route') {
        // Routes come from actionForCommand's fixed table (real screens only), so this is safe.
        router.push({ pathname: action.route, params: action.params ?? {} } as never);
      } else {
        Alert.alert(t(UNSUPPORTED_KEY[action.reason]));
      }
    },
    [router, t],
  );

  return (
    // A ring of PAGE BACKGROUND around the button. The FAB floats over a scrolling list, and on the
    // Tasks screen it lands on cards whose "Update progress" button is the same blue — two rounded
    // blue shapes touching read as one. The mockup avoids this by giving the card button a different
    // container colour; here the halo does the same job with one token and no new palette entry. The
    // drop shadow on the button itself carries the elevation.
    <View style={[styles.fab, { backgroundColor: p.bg }]} testID="voice-command-fab">
      <VoiceNoteButton onTranscript={onTranscript} shape="fab" testID="voice-fab-btn" />
    </View>
  );
}

const styles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.xl,
    padding: 6,
    borderRadius: 999, // circle — half the width, not a step on the radius scale (§32.7)
  },
});
