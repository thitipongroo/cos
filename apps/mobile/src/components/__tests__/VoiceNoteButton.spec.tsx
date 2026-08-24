// Behaviour of <VoiceNoteButton /> — hold to record, release to transcribe.
//
// THE TRANSCRIPT IS HANDED TO A FIELD SOMEONE IS TYPING IN. That is what makes the failure paths
// matter more than the happy one here: this button fills the report or issue description, so a
// failure that called back with '' would silently blank what the worker already wrote, and one that
// called back with a partial result would put words in a record that is later read as what they
// said. Every failure below therefore ends with `onTranscript` NOT called — the field keeps what it
// had, and the error is shown instead.
//
// IT IS HELD, NOT TAPPED, and the phase is what makes a release meaningful: a release that never
// followed a successful start must do nothing. Permission refused, or a recorder that would not
// prepare, both leave the phase at idle — and the finger is still going to come up.
//
// AND THE BUTTON GOES BACK TO IDLE AFTER A FAILURE. A button stuck reading "Recording…" is one the
// worker holds again expecting it to stop, which would start a second recording instead.

import { StyleSheet } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { VoiceNoteButton } from '../VoiceNoteButton';

let mockGranted = true;
let mockUri: string | null = 'file:///recordings/test-note.m4a';
const mockPrepare = jest.fn();
const mockRecord = jest.fn();
const mockStop = jest.fn();

jest.mock('expo-audio', () => ({
  RecordingPresets: { HIGH_QUALITY: { extension: '.m4a' } },
  useAudioRecorder: () => ({
    get uri() {
      return mockUri;
    },
    prepareToRecordAsync: mockPrepare,
    record: mockRecord,
    stop: mockStop,
  }),
  requestRecordingPermissionsAsync: () => Promise.resolve({ granted: mockGranted }),
}));

const mockTranscribe = jest.fn();
jest.mock('../../api/transcribe', () => ({
  transcribeAudio: (uri: string, language?: string) => mockTranscribe(uri, language),
}));

function renderButton(props: Record<string, unknown> = {}) {
  const onTranscript = jest.fn();
  const utils = render(
    <I18nProvider>
      <VoiceNoteButton testID="voice" onTranscript={onTranscript} {...props} />
    </I18nProvider>,
  );
  return { onTranscript, utils };
}

/** Hold and release — the whole gesture, which is the only way this button is ever used. */
async function hold(getByTestId: (id: string) => unknown) {
  await fireEvent(getByTestId('voice') as never, 'pressIn');
  await fireEvent(getByTestId('voice') as never, 'pressOut');
}

describe('VoiceNoteButton', () => {
  beforeEach(() => {
    mockGranted = true;
    mockUri = 'file:///recordings/test-note.m4a';
    mockPrepare.mockReset().mockResolvedValue(undefined);
    mockRecord.mockReset();
    mockStop.mockReset().mockResolvedValue(undefined);
    mockTranscribe.mockReset().mockResolvedValue('Concrete pour delayed by rain');
  });

  it('renders idle, inviting the hold', async () => {
    const { utils } = renderButton();
    const { getByTestId } = await utils;

    expect(getByTestId('voice')).toBeTruthy();
    // FALSY, not `false`: `isBusy` is `phase === 'transcribing' || disabled`, so with no `disabled`
    // prop it is `undefined`, and that is what Pressable puts in accessibilityState. A screen reader
    // reads undefined and false the same way, so this is the state, not a defect — but a test that
    // demanded `false` would be asserting a detail the component never promised.
    expect(getByTestId('voice').props.accessibilityState.disabled).toBeFalsy();
  });

  it('records while it is held', async () => {
    const { utils } = renderButton();
    const { getByTestId } = await utils;

    await fireEvent(getByTestId('voice'), 'pressIn');

    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));
    expect(mockPrepare).toHaveBeenCalledTimes(1);
  });

  // The waveform is the only thing that says a recording is running — this button captures nothing
  // visible otherwise, and a worker with no feedback holds it for a while and then holds it again.
  it('shows the waveform while it is recording', async () => {
    const { utils } = renderButton();
    const { getByTestId } = await utils;

    await fireEvent(getByTestId('voice'), 'pressIn');

    await waitFor(() => expect(getByTestId('voice-waveform')).toBeTruthy());
  });

  it('transcribes what was recorded and hands the text over', async () => {
    const { onTranscript, utils } = renderButton();
    const { getByTestId } = await utils;

    await hold(getByTestId);

    await waitFor(() => expect(onTranscript).toHaveBeenCalledWith('Concrete pour delayed by rain'));
    expect(mockStop).toHaveBeenCalledTimes(1);
    expect(mockTranscribe).toHaveBeenCalledWith('file:///recordings/test-note.m4a', undefined);
  });

  // The language is the caller's, not the device's: a Thai report dictated on an English handset is
  // the ordinary case here, and guessing from the OS locale would transcribe it as English.
  it('transcribes in the language the caller asked for', async () => {
    const { utils } = renderButton({ language: 'th' });
    const { getByTestId } = await utils;

    await hold(getByTestId);

    await waitFor(() => expect(mockTranscribe).toHaveBeenCalledTimes(1));
    expect(mockTranscribe.mock.calls[0][1]).toBe('th');
  });

  it('returns to idle once the transcript is in', async () => {
    const { utils } = renderButton();
    const { getByTestId, queryByTestId } = await utils;

    await hold(getByTestId);

    await waitFor(() => expect(queryByTestId('voice-waveform')).toBeNull());
    expect(getByTestId('voice').props.accessibilityState.disabled).toBeFalsy();
  });

  // ── THE FAILURES, WHICH ARE THE POINT ────────────────────────────────────────────────────────

  // Refused: nothing is recorded, and the release that follows the refusal must not transcribe a
  // recording that was never made.
  it('says the microphone was refused, and records nothing', async () => {
    mockGranted = false;

    const { onTranscript, utils } = renderButton();
    const { getByTestId } = await utils;

    await hold(getByTestId);

    await waitFor(() => expect(getByTestId('voice-note-error')).toBeTruthy());
    expect(mockRecord).not.toHaveBeenCalled();
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  // A button stuck on "Recording…" is one the worker holds again to stop, starting a second one.
  it('goes back to idle when the recorder will not start', async () => {
    mockPrepare.mockRejectedValue(new Error('busy'));

    const { onTranscript, utils } = renderButton();
    const { getByTestId, queryByTestId } = await utils;

    await hold(getByTestId);

    await waitFor(() => expect(getByTestId('voice-note-error')).toBeTruthy());
    expect(queryByTestId('voice-waveform')).toBeNull();
    expect(getByTestId('voice').props.accessibilityState.disabled).toBeFalsy();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  // Stopped, but the recorder produced no file. Handing '' to the parent would blank the field the
  // worker had already typed into.
  it('reports an error rather than an empty transcript when no audio was written', async () => {
    mockUri = null;

    const { onTranscript, utils } = renderButton();
    const { getByTestId } = await utils;

    await hold(getByTestId);

    await waitFor(() => expect(getByTestId('voice-note-error')).toBeTruthy());
    expect(mockTranscribe).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  // Offline, or the AI gateway is down. The recording is lost either way — but the FIELD is not.
  it('keeps the field untouched when the transcription fails', async () => {
    mockTranscribe.mockRejectedValue(new Error('offline'));

    const { onTranscript, utils } = renderButton();
    const { getByTestId, queryByTestId } = await utils;

    await hold(getByTestId);

    await waitFor(() => expect(getByTestId('voice-note-error')).toBeTruthy());
    expect(onTranscript).not.toHaveBeenCalled();
    expect(queryByTestId('voice-waveform')).toBeNull();
  });

  // The error clears on the next attempt, so a stale message never sits under a recording that is
  // working — reading as though this one failed too.
  it('clears the last error when a new recording starts', async () => {
    mockGranted = false;

    const { utils } = renderButton();
    const { getByTestId, queryByTestId } = await utils;

    await hold(getByTestId);
    await waitFor(() => expect(getByTestId('voice-note-error')).toBeTruthy());

    mockGranted = true;
    await fireEvent(getByTestId('voice'), 'pressIn');

    await waitFor(() => expect(queryByTestId('voice-note-error')).toBeNull());
  });

  // ── WHEN IT MUST NOT LISTEN ──────────────────────────────────────────────────────────────────

  it('records nothing while the caller has it disabled', async () => {
    const { onTranscript, utils } = renderButton({ disabled: true });
    const { getByTestId } = await utils;

    expect(getByTestId('voice').props.accessibilityState.disabled).toBe(true);

    await hold(getByTestId);

    expect(mockRecord).not.toHaveBeenCalled();
    expect(onTranscript).not.toHaveBeenCalled();
  });

  // A second hold on top of an upload would record over a note that has not been handed back yet.
  //
  // The transcription is left UNSETTLED on purpose and the release is not awaited: awaiting hands
  // control to a flush that cannot finish while the handler's promise is pending, so the test would
  // time out on the very state it means to observe.
  it('refuses a new hold while the last one is still being transcribed', async () => {
    mockTranscribe.mockReturnValue(new Promise(() => undefined));

    const { utils } = renderButton();
    const { getByTestId } = await utils;

    await fireEvent(getByTestId('voice'), 'pressIn');
    await waitFor(() => expect(mockRecord).toHaveBeenCalledTimes(1));

    void fireEvent(getByTestId('voice'), 'pressOut');
    await waitFor(() => expect(mockTranscribe).toHaveBeenCalledTimes(1));

    expect(getByTestId('voice').props.accessibilityState.disabled).toBe(true);

    void fireEvent(getByTestId('voice'), 'pressIn');

    expect(mockRecord).toHaveBeenCalledTimes(1);
  });

  // ── THE TWO SHAPES ───────────────────────────────────────────────────────────────────────────
  //
  // ROUND WHERE IT FLOATS, SQUARE WHERE IT IS THE SUBJECT (PO 2026-08-11): on the task list it
  // hovers over rows and reads as an action startable from anywhere; inside the issue form's VOICE
  // NOTE panel it IS the panel, sitting in a column of rounded plates, where a lone circle read as
  // a floating action button it is not.

  // The bar is labelled because it sits in a form beside other fields, where an unlabelled mic is
  // one more icon among many; the FAB is not, because it is the only thing on it.
  it('labels the bar it wears inside a form', async () => {
    const { utils } = renderButton();
    const { getByText } = await utils;

    expect(getByText('Hold to record')).toBeTruthy();
  });

  it('drops the label on the FAB, keeping it on the spoken name', async () => {
    const { utils } = renderButton({ shape: 'fab' });
    const { getByTestId, queryByText } = await utils;

    expect(queryByText('Hold to record')).toBeNull();
    expect(getByTestId('voice').props.accessibilityLabel).toBe('Hold to record');
  });

  // The mic is a MaterialIcons glyph and not an emoji (PO 2026-08-08): an emoji renders in the
  // system font, so it changed shape and colour between Android versions and could never take the
  // button's tint.
  it.each([
    ['bar', undefined],
    ['fab', 'round'],
    ['fab', 'square'],
  ])('draws the one mic glyph on the %s', async (shape, fabShape) => {
    const { utils } = renderButton({ shape, fabShape });
    const { getByText } = await utils;

    expect(getByText('mic')).toBeTruthy();
  });

  // The issue screen's VOICE NOTE panel passes 80, which is what its mockup draws — there the
  // button is the whole point of a dedicated panel rather than an accessory floating over a list.
  it('takes the size its host asks for', async () => {
    const { utils } = renderButton({ shape: 'fab', fabSize: 80 });
    const { getByTestId } = await utils;

    // FLATTENED, because the LAST style wins: `styles.fab` already carries the 56 default and the
    // prop's override is appended after it. Reading the first match would assert the default and
    // pass whatever the prop did.
    const style = StyleSheet.flatten(getByTestId('voice').props.style as never) as Record<
      string,
      unknown
    >;
    expect(style).toMatchObject({ width: 80, height: 80 });
  });

  // The spoken name changes with the phase, because a screen reader user gets no waveform.
  it('says what it is doing while it does it', async () => {
    const { utils } = renderButton();
    const { getByTestId } = await utils;

    await fireEvent(getByTestId('voice'), 'pressIn');

    await waitFor(() => expect(getByTestId('voice').props.accessibilityLabel).toBe('Recording…'));
  });
});
