// Behaviour of <VoiceCommandFab /> — hold, speak, and land on the right screen (ADR-073).
//
// IT NEVER GUESSES. That is the whole design of this control: the transcript goes to the gateway for
// an intent, the intent goes through the fixed table in `actionForCommand`, and anything the table
// does not answer produces a MESSAGE rather than a route. The failure it is built against is a
// worker speaking into a phone on a site and being taken somewhere plausible but wrong — which is
// worse than being taken nowhere, because they act on the screen they land on.
//
// SEARCH IS THE SHARPEST CASE. The intent is RECOGNISED — the gateway understood the command
// perfectly — and there is still nowhere to go, because no search screen exists yet. A control that
// routed "the closest thing" here would be answering a question it understood with a screen the
// worker did not ask for.
//
// AND THE GATEWAY BEING DOWN IS ITS OWN ANSWER, distinct from the command being unsupported: one
// says try again later, the other says this will never work. Collapsing them would tell a worker
// their phrasing was wrong when the LLM key is simply not configured yet.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../i18n';
import { VoiceCommandFab } from '../VoiceCommandFab';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

const mockParse = jest.fn();
jest.mock('../../api/voiceIntent', () => ({
  parseVoiceIntent: (text: string) => mockParse(text),
}));

const mockTranscribe = jest.fn();
jest.mock('../../api/transcribe', () => ({
  transcribeAudio: (uri: string, language?: string) => mockTranscribe(uri, language),
}));

function renderFab() {
  return render(
    <I18nProvider>
      <VoiceCommandFab />
    </I18nProvider>,
  );
}

/** Hold the FAB and let go — the only gesture this control has. */
async function speak(getByTestId: (id: string) => never) {
  await fireEvent(getByTestId('voice-fab-btn'), 'pressIn');
  await fireEvent(getByTestId('voice-fab-btn'), 'pressOut');
}

describe('VoiceCommandFab', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    mockPush.mockReset();
    mockParse.mockReset();
    mockTranscribe.mockReset().mockResolvedValue('log an issue about the crane');
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => alert.mockRestore());

  it('renders the FAB it wraps', async () => {
    const { getByTestId } = await renderFab();

    expect(getByTestId('voice-command-fab')).toBeTruthy();
    expect(getByTestId('voice-fab-btn')).toBeTruthy();
  });

  // ── THE COMMANDS THAT GO SOMEWHERE ───────────────────────────────────────────────────────────

  // The spoken text travels WITH the route, so the screen opens already carrying what was said —
  // otherwise the worker dictates a report and then has to dictate it again into the form.
  it('opens the report form carrying what was said', async () => {
    mockParse.mockResolvedValue({ intent: 'DAILY_REPORT', text: 'poured the slab on level four' });

    const { getByTestId } = await renderFab();
    await speak(getByTestId as never);

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush.mock.calls[0][0]).toMatchObject({ pathname: '/report' });
  });

  it('opens the issues screen for a logged issue', async () => {
    mockParse.mockResolvedValue({ intent: 'LOG_ISSUE', text: 'the crane is down' });

    const { getByTestId } = await renderFab();
    await speak(getByTestId as never);

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(mockPush.mock.calls[0][0]).toMatchObject({ pathname: '/issues' });
  });

  it('navigates where the command named a screen that exists', async () => {
    mockParse.mockResolvedValue({ intent: 'NAVIGATE', target: 'tasks' });

    const { getByTestId } = await renderFab();
    await speak(getByTestId as never);

    await waitFor(() => expect(mockPush).toHaveBeenCalledTimes(1));
    expect(alert).not.toHaveBeenCalled();
  });

  // ── THE COMMANDS THAT GO NOWHERE, AND SAY SO ─────────────────────────────────────────────────

  // Understood perfectly, and still nowhere to go. Routing "the closest thing" would answer a
  // question the gateway understood with a screen the worker did not ask for.
  it('says search is unavailable rather than routing to the nearest screen', async () => {
    mockParse.mockResolvedValue({ intent: 'SEARCH', text: 'find the concrete order' });

    const { getByTestId } = await renderFab();
    await speak(getByTestId as never);

    await waitFor(() => expect(alert).toHaveBeenCalledWith('Voice search is not available yet'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  // A destination the table does not hold. NEVER ROUTE TO NOWHERE — a push to a route that does not
  // exist is a blank screen with a back button, which reads as the app breaking.
  it('says so when the named screen is not one this app has', async () => {
    mockParse.mockResolvedValue({ intent: 'NAVIGATE', target: 'payroll' });

    const { getByTestId } = await renderFab();
    await speak(getByTestId as never);

    await waitFor(() => expect(alert).toHaveBeenCalledWith("That screen isn't available"));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('says so when a NAVIGATE command named no destination at all', async () => {
    mockParse.mockResolvedValue({ intent: 'NAVIGATE' });

    const { getByTestId } = await renderFab();
    await speak(getByTestId as never);

    await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('says it did not understand rather than picking a screen', async () => {
    mockParse.mockResolvedValue({ intent: 'SOMETHING_ELSE', text: 'mumble' });

    const { getByTestId } = await renderFab();
    await speak(getByTestId as never);

    await waitFor(() => expect(alert).toHaveBeenCalledWith("Sorry, I didn't catch a command"));
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── THE GATEWAY ITSELF ───────────────────────────────────────────────────────────────────────

  // Distinct from "unsupported": one says try again later, the other says this will never work.
  // Collapsing them tells a worker their phrasing was wrong when the LLM key is not configured.
  it('says the command service is unavailable when the gateway fails', async () => {
    mockParse.mockRejectedValue(new Error('503'));

    const { getByTestId } = await renderFab();
    await speak(getByTestId as never);

    // NOT one of the three unsupported messages: "try again later" versus "this will never work".
    await waitFor(() => expect(alert).toHaveBeenCalledWith('Voice command unavailable'));
    expect(mockPush).not.toHaveBeenCalled();
  });

  // ── BEFORE THERE IS ANYTHING TO ACT ON ───────────────────────────────────────────────────────

  // No transcript, no intent call: sending an empty string to the gateway would spend a request to
  // be told it did not understand silence.
  it('asks the gateway nothing when the recording produced no transcript', async () => {
    mockTranscribe.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderFab();
    await speak(getByTestId as never);

    await waitFor(() => expect(mockTranscribe).toHaveBeenCalled());
    expect(mockParse).not.toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });
});
