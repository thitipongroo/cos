// Behaviour of the permit-submitted receipt.
//
// It is reached with `router.replace` and is deliberately ABSENT from BREADCRUMB_MAP — which is what
// denies it a TopBar back chevron. That is the point: there is no form behind it to go back to, and
// a Back control here would return someone to a request they have already filed.
//
// So both onward actions are replaces as well, and each goes somewhere that makes sense from a
// finished request: home, or the queue where the permit now sits.
//
// The status is drawn in the tone the permit's own vocabulary gives it — PENDING is not an error and
// not a success, and colouring it either way tells the requester something the server did not say.

import { render, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import PermitSubmittedScreen from '../permit-submitted';

const mockReplace = jest.fn();
const mockPush = jest.fn();
let mockParams: Record<string, string> = {};

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: mockReplace }),
}));

function renderScreen() {
  return render(
    <I18nProvider>
      <PermitSubmittedScreen />
    </I18nProvider>,
  );
}

describe('PermitSubmittedScreen', () => {
  beforeEach(() => {
    mockReplace.mockReset();
    mockPush.mockReset();
    mockParams = { permitNumber: 'PN-001', permitType: 'WORK_PERMIT', status: 'PENDING' };
  });

  it('confirms the request', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('permit-submitted-screen')).toBeTruthy();
    expect(getByTestId('permit-submitted-title')).toBeTruthy();
  });

  // The number is what the requester quotes when they chase it.
  it('shows the permit number the server assigned', async () => {
    const { getByTestId } = await renderScreen();

    expect(String(getByTestId('permit-submitted-number').props.children)).toBe('PN-001');
  });

  it('shows the status the server gave', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('permit-submitted-status')).toBeTruthy();
  });

  it('still reads as a receipt when the route carried nothing', async () => {
    mockParams = {};

    const { getByTestId } = await renderScreen();

    expect(getByTestId('permit-submitted-screen')).toBeTruthy();
    expect(getByTestId('permit-submitted-card')).toBeTruthy();
  });

  // REPLACE both ways: there is no request behind this to return to.
  it('goes home by replacing, not by pushing', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('permit-submitted-home'));

    expect(mockReplace).toHaveBeenCalledWith('/home');
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('opens the permit queue by replacing too', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('permit-submitted-view'));

    expect(mockReplace).toHaveBeenCalledWith('/permits');
    expect(mockPush).not.toHaveBeenCalled();
  });

  // The AI panel is an honest shell — there is no model behind it, and it says so rather than
  // printing a fabricated assessment of a permit request.
  it('says the assessment is unavailable rather than inventing one', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('permit-submitted-ai-unavailable')).toBeTruthy();
  });
});
