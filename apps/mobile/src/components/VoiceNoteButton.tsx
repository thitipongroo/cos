// VoiceNoteButton — §32.7: hold-to-record, waveform animation, auto-transcription.
//
// Hold the button (onPressIn) to record; release (onPressOut) to stop, upload, and transcribe.
// The resulting text is handed to the parent via onTranscript (e.g. to fill a report/issue field).
// Recording uses expo-audio (RecordingPresets.HIGH_QUALITY → .m4a AAC); transcription goes through
// transcribeAudio() (upload to File Service → POST /ai/transcribe).

import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, StyleSheet, Animated, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useAudioRecorder, RecordingPresets, requestRecordingPermissionsAsync } from 'expo-audio';
import { useT } from '../i18n';
import { transcribeAudio } from '../api/transcribe';
import { colors, fontFamily, radius, spacing, typography } from '../theme/tokens';

type Phase = 'idle' | 'recording' | 'transcribing';

const WAVEFORM_BARS = 5;

interface VoiceNoteButtonProps {
  onTranscript: (text: string) => void;
  language?: string;
  disabled?: boolean;
  testID?: string;
  /**
   * 'bar' (default) — the full-width labelled pill used inside report/issue forms.
   * 'fab' — a round 56×56 icon-only button for the SITE_ENGINEER home FAB (mockup parity);
   *   drops the label, same hold-to-record behaviour.
   */
  shape?: 'bar' | 'fab';
}

export function VoiceNoteButton({
  onTranscript,
  language,
  disabled,
  testID,
  shape = 'bar',
}: VoiceNoteButtonProps) {
  const t = useT();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);

  // One Animated.Value per waveform bar; looped while recording.
  const bars = useRef(Array.from({ length: WAVEFORM_BARS }, () => new Animated.Value(0.3))).current;

  useEffect(() => {
    if (phase !== 'recording') return;
    const loops = bars.map((bar, i) =>
      Animated.loop(
        Animated.sequence([
          Animated.timing(bar, {
            toValue: 1,
            duration: 300 + i * 60,
            useNativeDriver: true,
          }),
          Animated.timing(bar, {
            toValue: 0.3,
            duration: 300 + i * 60,
            useNativeDriver: true,
          }),
        ]),
      ),
    );
    loops.forEach((l) => l.start());
    return () => loops.forEach((l) => l.stop());
  }, [phase, bars]);

  async function startRecording() {
    setError(null);
    const { granted } = await requestRecordingPermissionsAsync();
    if (!granted) {
      setError(t('voiceNote.permissionDenied'));
      return;
    }
    try {
      await recorder.prepareToRecordAsync();
      recorder.record();
      setPhase('recording');
    } catch {
      setError(t('voiceNote.error'));
      setPhase('idle');
    }
  }

  async function stopAndTranscribe() {
    if (phase !== 'recording') return;
    setPhase('transcribing');
    try {
      await recorder.stop();
      const uri = recorder.uri;
      if (!uri) {
        throw new Error('no uri');
      }
      const text = await transcribeAudio(uri, language);
      onTranscript(text);
      setPhase('idle');
    } catch {
      setError(t('voiceNote.error'));
      setPhase('idle');
    }
  }

  const label =
    phase === 'recording'
      ? t('voiceNote.recording')
      : phase === 'transcribing'
        ? t('voiceNote.transcribing')
        : t('voiceNote.hold');

  const isBusy = phase === 'transcribing' || disabled;

  return (
    <View style={styles.wrap}>
      <Pressable
        testID={testID}
        onPressIn={isBusy ? undefined : startRecording}
        onPressOut={stopAndTranscribe}
        disabled={isBusy}
        accessibilityRole="button"
        accessibilityLabel={label}
        style={[
          styles.button,
          shape === 'fab' ? styles.fab : null,
          phase === 'recording' ? styles.recording : null,
          isBusy ? styles.busy : null,
        ]}
      >
        {phase === 'recording' ? (
          <View testID="voice-waveform" style={styles.waveform}>
            {bars.map((bar, i) => (
              <Animated.View key={i} style={[styles.bar, { transform: [{ scaleY: bar }] }]} />
            ))}
          </View>
        ) : phase === 'transcribing' ? (
          <ActivityIndicator color={colors.bg} />
        ) : shape === 'fab' ? (
          // Round FAB (SITE_ENGINEER home) — the mockup's clean line mic, white on the blue button.
          <MaterialIcons name="mic" size={26} color={colors.bg} />
        ) : (
          // The SAME clean-line mic as the FAB, not an emoji (PO decision 2026-08-08 — the engineer
          // Home's mic is the project standard). An emoji renders in the system font, so it changed
          // shape and colour between Android versions and could never take the button's tint.
          <MaterialIcons name="mic" size={22} color={colors.bg} />
        )}
        {shape === 'fab' ? null : <Text style={styles.label}>{label}</Text>}
      </Pressable>
      {error ? (
        <Text testID="voice-note-error" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.xs },
  button: {
    minHeight: 60,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.md,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
  },
  // Round icon-only FAB variant (mockup parity, SITE_ENGINEER home). 56×56 per the DESIGN.md FAB spec.
  fab: {
    minHeight: 0,
    width: 56,
    height: 56,
    borderRadius: 28,
    paddingHorizontal: 0,
    gap: 0,
  },
  recording: { backgroundColor: colors.danger },
  busy: { opacity: 0.7 },
  label: {
    color: colors.bg,
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
  },
  waveform: { flexDirection: 'row', alignItems: 'center', gap: 4, height: 24 },
  bar: {
    width: 4,
    height: 24,
    borderRadius: radius.sm,
    backgroundColor: colors.bg,
  },
  error: {
    color: colors.danger,
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.medium,
  },
});
