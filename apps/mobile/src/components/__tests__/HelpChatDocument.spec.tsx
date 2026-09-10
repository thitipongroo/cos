// Behaviour of the Help Chat document (mockup 01_authen/05_get_help/03_help_chat).
//
// The screen is DRAWN COMPLETE — the thread, the chips and the composer are all rendered as the
// mockup draws them (product-owner decision 2026-09-10). Nothing behind them is built:
// `platform.support_tickets` and `platform.support_messages` exist as tables, but no endpoint reads
// or writes them.
//
// So what these tests hold is the CONTRACT of that state, which is the part a later change could
// quietly break in either direction:
//
//   - every unbuilt action says so ON A PRESS — the six controls raise the alert;
//   - and the screen says NOTHING about it otherwise. No "coming soon" or "unavailable" standing on
//     the page. That is the half a well-meaning edit is most likely to undo, because adding a note
//     looks like an improvement.
//
// The drawn copy is not pinned by value — it lives in the i18n catalogues and in
// `lib/mockupFigures.ts` (ADR-099), and changes when the drawing does.

import { Alert } from 'react-native';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { paletteFor } from '../../theme/palette';
import { HelpChatDocument } from '../HelpChatDocument';

const DARK = paletteFor('dark');

/** Every control on this screen that has no process behind it. */
const INERT = [
  'help-chat-quick-diagnostic',
  'help-chat-quick-sync',
  'help-chat-quick-hardware',
  'help-chat-attach',
  'help-chat-camera',
  'help-chat-send',
] as const;

function renderDoc() {
  return render(
    <I18nProvider>
      <HelpChatDocument palette={DARK} paddingBottom={0} />
    </I18nProvider>,
  );
}

describe('HelpChatDocument', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => {
    alert.mockRestore();
  });

  it('draws the thread the mockup draws — session, day, and all three turns', async () => {
    const { getByTestId } = await renderDoc();

    expect(getByTestId('help-chat-session')).toBeTruthy();
    expect(getByTestId('help-chat-agent-1')).toBeTruthy();
    expect(getByTestId('help-chat-user-1')).toBeTruthy();
    expect(getByTestId('help-chat-agent-2')).toBeTruthy();
  });

  it('draws every control the mockup draws', async () => {
    const { getByTestId } = await renderDoc();

    for (const id of INERT) expect(getByTestId(id)).toBeTruthy();
    expect(getByTestId('help-chat-input')).toBeTruthy();
  });

  // The product owner's instruction, and the half of it a later edit is most likely to undo: the
  // page carries no standing note about what is unbuilt. It is stated on a press and nowhere else.
  it('says nothing on the page about what is not built yet', async () => {
    const { queryByText } = await renderDoc();

    expect(queryByText(/coming soon/i)).toBeNull();
    expect(queryByText(/unavailable/i)).toBeNull();
    expect(queryByText(/not available/i)).toBeNull();
  });

  it('says so on a press — every control with no process behind it', async () => {
    const { getByTestId } = await renderDoc();

    for (const id of INERT) {
      alert.mockClear();
      await fireEvent.press(getByTestId(id));
      await waitFor(() => expect(alert).toHaveBeenCalledTimes(1));
    }
  });

  // A text box that refuses keystrokes reads as broken rather than unbuilt, so the field accepts
  // typing — and send clears it, because the message went nowhere and leaving it there implies it
  // is queued.
  it('accepts typing, and clears the field when send reports itself unbuilt', async () => {
    const { getByTestId } = await renderDoc();
    const field = getByTestId('help-chat-input');

    await fireEvent.changeText(field, 'my rig is offline');
    expect(getByTestId('help-chat-input').props.value).toBe('my rig is offline');

    await fireEvent.press(getByTestId('help-chat-send'));

    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(getByTestId('help-chat-input').props.value).toBe('');
  });
});
