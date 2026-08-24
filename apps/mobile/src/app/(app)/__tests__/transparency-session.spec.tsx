// Behaviour of the Transparency Portal's session screen (ADR-084, mockup 03_05).
//
// THIS SCREEN'S ONLY JOB IS TO BE CHECKABLE. It is where a reader is invited to verify what the
// platform says about their session, which makes it the one surface where a claim that cannot be
// checked costs the most — an unverifiable row discredits the true rows beside it. The mockup
// asserted four such things (a 3600s TTL, AES-256-GCM session encryption, a session id, Stratum-1
// NTP); ADR-084 replaced them with values traceable to a spec line. These tests pin the VALUES, not
// just the rows, because a row that renders with the wrong number still renders.
//
// THE TOKEN ID IS READ LOCALLY, NEVER FETCHED. Asking the server "what is my session" would be a
// request whose answer the client is already carrying — and on a transparency screen, a network call
// made to display a fact about privacy is itself the thing being disclosed.
//
// It is TRUNCATED for the same reason the mockup truncated its invented value: the full jti is a
// correlation handle, and this screen should not be where it is first screenshotted into a support
// chat. And it is ABSENT rather than blank when there is no token — an em dash in a value slot reads
// as a stored value being withheld, which is the opposite of what this screen exists to do.

import { render } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import { useAuthStore } from '../../../store/authStore';
import TransparencySessionScreen from '../transparency-session';

/** A token the app could really be holding: only the payload is read, and only for its claims. */
function tokenWith(payload: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return `eyJhbGciOiJSUzI1NiJ9.${body}.sig`;
}

function renderScreen() {
  return render(
    <I18nProvider>
      <TransparencySessionScreen />
    </I18nProvider>,
  );
}

describe('TransparencySessionScreen', () => {
  beforeEach(() => {
    useAuthStore.setState({ accessToken: null } as never);
  });

  it('renders the screen', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('transparency-session')).toBeTruthy();
  });

  // The three that survived the ADR-084 review because they describe real subsystems.
  it.each(['offlineQueue', 'rolePermissions', 'tokenRotation'])('explains %s', async (key) => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId(`session-card-${key}`)).toBeTruthy();
  });

  // §5.4.1 step 4 — fifteen minutes, not the mockup's 3600 seconds.
  it('states the access-token lifetime the platform actually issues', async () => {
    const { getByTestId, getByText } = await renderScreen();

    expect(getByTestId('session-access-ttl')).toBeTruthy();
    expect(getByText(/15/)).toBeTruthy();
  });

  it('states the refresh-token lifetime', async () => {
    const { getByTestId, getByText } = await renderScreen();

    expect(getByTestId('session-refresh-ttl')).toBeTruthy();
    expect(getByText(/7/)).toBeTruthy();
  });

  // §5.2 — TLS 1.3 in transit. AES-256-GCM is ADR-035's AT-REST issuer-key cipher, a different
  // subsystem, and naming it here would be the mockup's error restored.
  it('names the transport, and not the at-rest cipher of another subsystem', async () => {
    const { getByTestId, getByText, queryByText } = await renderScreen();

    expect(getByTestId('session-transport')).toBeTruthy();
    expect(getByText('TLS 1.3')).toBeTruthy();
    expect(queryByText(/AES-256-GCM/)).toBeNull();
  });

  // An em dash in a value slot reads as a value being withheld.
  it('shows no token row at all when the device holds no token', async () => {
    const { queryByTestId } = await renderScreen();

    expect(queryByTestId('session-token-id')).toBeNull();
  });

  // The full jti is a correlation handle; this is not where it gets screenshotted.
  it('shows the token id truncated when there is one', async () => {
    useAuthStore.setState({ accessToken: tokenWith({ jti: '9f8a000000002b1c' }) } as never);

    const { getByTestId, getByText, queryByText } = await renderScreen();

    expect(getByTestId('session-token-id')).toBeTruthy();
    expect(getByText('9f8a…2b1c')).toBeTruthy();
    expect(queryByText('9f8a000000002b1c')).toBeNull();
  });

  // A short id is returned unchanged rather than padded: a fake ellipsis would imply hidden
  // characters that are not there, on the one screen where that matters.
  it('does not pretend a short id is hiding something', async () => {
    useAuthStore.setState({ accessToken: tokenWith({ jti: 'abc123' }) } as never);

    const { getByText } = await renderScreen();

    expect(getByText('abc123')).toBeTruthy();
  });

  // A token carrying every other claim but this one: the row is a fact about the token, so with no
  // jti there is no fact to state.
  it('shows no token row when the token carries no jti', async () => {
    useAuthStore.setState({
      accessToken: tokenWith({ sub: 'u-1', role: 'SITE_WORKER' }),
    } as never);

    const { queryByTestId } = await renderScreen();

    expect(queryByTestId('session-token-id')).toBeNull();
  });

  // A jti that is not a string is not a jti. Nothing is invented from it.
  it('shows no token row when the jti is not a string', async () => {
    useAuthStore.setState({ accessToken: tokenWith({ jti: 12345 }) } as never);

    const { queryByTestId } = await renderScreen();

    expect(queryByTestId('session-token-id')).toBeNull();
  });

  // An unreadable token is a decode that returns nothing, not a screen that throws — this screen is
  // reachable from the policy, and a reader arriving with a stale token should still see the facts.
  it('still renders the facts when the token cannot be decoded', async () => {
    useAuthStore.setState({ accessToken: 'not-a-token' } as never);

    const { getByTestId, queryByTestId } = await renderScreen();

    expect(getByTestId('session-transport')).toBeTruthy();
    expect(queryByTestId('session-token-id')).toBeNull();
  });
});
