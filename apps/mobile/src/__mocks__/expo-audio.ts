// Jest mock for 'expo-audio'.
//
// Importing the real package pulls in `expo` itself, whose Expo.fx side effects reach the dev-client
// message socket and React Native's getDevServer — neither of which exists in a node process. There
// is no audio session here either, so the recorder is a shape, not a device.
//
// Permission is granted and the recorder produces a stable file URI, which lets a spec assert the
// path a voice note takes (record -> stop -> attach) without asserting that audio was captured.

export const RecordingPresets = {
  HIGH_QUALITY: { extension: '.m4a' },
  LOW_QUALITY: { extension: '.m4a' },
} as const;

export interface AudioRecorder {
  uri: string | null;
  prepareToRecordAsync: () => Promise<void>;
  record: () => void;
  stop: () => Promise<void>;
}

export function useAudioRecorder(_preset?: unknown): AudioRecorder {
  return {
    uri: 'file:///recordings/test-note.m4a',
    prepareToRecordAsync: async () => undefined,
    record: () => undefined,
    stop: async () => undefined,
  };
}

export async function requestRecordingPermissionsAsync(): Promise<{ granted: boolean }> {
  return { granted: true };
}
