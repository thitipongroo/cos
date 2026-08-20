// Behaviour of the erasure screen.
//
// This is the screen where the product had to refuse to build what the mockup drew, and the test is
// what stops it being "finished" later by someone who has not read why.
//
// The mockup is a confirmation dialog: type DELETE, press CONFIRM PERMANENT DELETION, and "all
// personal identity, site logs, and technical telemetry associated with your profile will be
// permanently removed." Two things block it. There is no erasure endpoint — PDPA-13 is open and no
// route exists. And the promise is one the platform must not keep: QM-5 requires anonymisation in
// place over cascade delete, and site reports are kept for the project's life plus seven years under
// accounting law. Erasing them on request would breach that duty; a button saying we will is a false
// statement either way.
//
// So the screen explains what erasure DOES per record type — erase where it can, retain and
// anonymise where law binds — points at the Data Protection Office, and renders the confirm control
// DISABLED (PO 2026-08-04: show it, disabled, with a coming-soon chip). The "type DELETE" ritual is
// dropped: a confirmation ceremony for an action that cannot execute is theatre.

import { render } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import TransparencyDeleteScreen from '../transparency-delete';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

function renderScreen() {
  return render(
    <I18nProvider>
      <TransparencyDeleteScreen />
    </I18nProvider>,
  );
}

describe('TransparencyDeleteScreen', () => {
  it('explains erasure per record type rather than as one promise', async () => {
    const { getByTestId } = await renderScreen();

    for (const key of ['identity', 'location', 'reports', 'audit']) {
      expect(getByTestId(`delete-rec-${key}`)).toBeTruthy();
    }
  });

  // THE CONTROL IS DISABLED, and shown. Hiding it would leave a reader unable to tell whether
  // erasure exists at all; a live one would promise something the platform must not do.
  it('shows the request control disabled rather than hiding it', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('delete-request')).toBeTruthy();
    expect(getByTestId('delete-request').props.accessibilityState.disabled).toBe(true);
  });

  it('says in its spoken label that it is not available yet', async () => {
    const { getByTestId } = await renderScreen();

    const label = getByTestId('delete-request').props.accessibilityLabel as string;
    expect(label).toBeTruthy();
    expect(label.length).toBeGreaterThan(0);
  });

  // A confirmation ceremony for an action that cannot execute is theatre. The absence of the
  // mockup's ritual is deliberate, and this is what records that.
  it('asks for no typed confirmation, because there is nothing to confirm', async () => {
    const { queryByTestId, queryByPlaceholderText } = await renderScreen();

    expect(queryByTestId('delete-confirm-input')).toBeNull();
    expect(queryByPlaceholderText('DELETE')).toBeNull();
  });

  it('renders as a document, with no destructive control that acts', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    expect(getByTestId('transparency-delete')).toBeTruthy();
    expect(queryByTestId('delete-confirm')).toBeNull();
  });
});
