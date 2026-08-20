// Behaviour of the EXECUTIVE half of /reports — the AI executive summary.
//
// ONE ROUTE, TWO SCREENS. `/reports` is a list of site reports for the engineer and a generator for
// the executive, chosen on the role claim. The split is asserted here because the failure is silent:
// an executive who fell through to the engineer's branch would get a working screen — the wrong one,
// listing another role's work under their own tab.
//
// A 503 IS NOT AN ERROR HERE. The LLM provider is still the Phase 11 stub, so "unavailable" is the
// honest and expected answer, and it must read as "not yet" rather than as something the executive
// broke. Every other failure keeps the error wording — collapsing the two would hide a real outage
// behind a message saying the feature is merely not built.
//
// THE LOW-CONFIDENCE CAVEAT IS ABOVE THE SUMMARY, NOT AFTER IT. A caveat read after the text is read
// by someone who has already believed the text. Same honest-data rule the loading states follow:
// nothing is presented more certainly than it is.
//
// AND THE SUMMARY MUST BE A STRING. `content.executive_summary` is whatever the model returned; a
// non-string rendered would put "[object Object]" in front of a board member.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CosRole } from '@cos/types';
import { I18nProvider } from '../../../i18n';
import { useAuthStore } from '../../../store/authStore';
import ReportsScreen from '../reports';

jest.mock('../../../api/client', () => ({ get: jest.fn(), post: jest.fn(), mutate: jest.fn() }));
jest.mock('../../../api/projects', () => ({ refreshProjectsCache: () => Promise.resolve() }));
jest.mock('../../../hooks/useCollection', () => ({
  useCollection: () => [{ projectId: 'proj-1', projectCode: 'PRJ-1' }],
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock; post: jest.Mock };

/** The token the screen reads `tenant_id` out of — authStore holds no tenant of its own. */
function tokenWith(claims: Record<string, unknown>): string {
  const body = Buffer.from(JSON.stringify(claims), 'utf8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
  return 'eyJhbGciOiJSUzI1NiJ9.' + body + '.sig';
}

/** An axios-shaped rejection, since the screen asks `axios.isAxiosError` before reading a status. */
function httpError(status: number): Error {
  return Object.assign(new Error('HTTP ' + String(status)), {
    isAxiosError: true as const,
    response: { status },
  });
}

function renderScreen() {
  return render(
    <I18nProvider>
      <ReportsScreen />
    </I18nProvider>,
  );
}

async function generate() {
  const utils = await renderScreen();
  await fireEvent.press(utils.getByTestId('project-option-proj-1'));
  await fireEvent.press(utils.getByTestId('generate-report-button'));
  return utils;
}

describe('ReportsScreen (EXECUTIVE)', () => {
  beforeEach(() => {
    client.get.mockReset();
    client.post.mockReset();
    client.get.mockResolvedValue({ items: [], total: 0 });
    useAuthStore.setState({
      role: CosRole.EXECUTIVE,
      userId: 'user-exec',
      accessToken: tokenWith({ tenant_id: 'tenant-9' }),
    } as never);
  });

  // The failure this guards is silent: the wrong screen still works.
  it('gives the executive the generator, not the engineer list', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    expect(getByTestId('exec-reports-screen')).toBeTruthy();
    expect(queryByTestId('reports-screen')).toBeNull();
  });

  it('gives every other role the list', async () => {
    useAuthStore.setState({ role: CosRole.SITE_ENGINEER } as never);

    const { getByTestId, queryByTestId } = await renderScreen();

    expect(getByTestId('reports-screen')).toBeTruthy();
    expect(queryByTestId('exec-reports-screen')).toBeNull();
  });

  // A summary of no project is a request whose answer is undefined, so the control says so rather
  // than sending it and showing whatever comes back.
  it('will not generate before a project is chosen', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('generate-report-button').props.accessibilityState.disabled).toBe(true);

    await fireEvent.press(getByTestId('generate-report-button'));

    expect(client.post).not.toHaveBeenCalled();
  });

  it('generates for the project that was chosen', async () => {
    client.post.mockResolvedValue({ content: { executive_summary: 'All sites on schedule.' } });

    const { getByTestId } = await generate();

    await waitFor(() => expect(getByTestId('report-summary')).toBeTruthy());
    expect(client.post).toHaveBeenCalledWith('/ai/reports/executive-summary', {
      project_id: 'proj-1',
      tenant_id: 'tenant-9',
      generated_by: 'user-exec',
    });
  });

  // The tenant is read from the VERIFIED token claims, never from anything the client can set.
  it('sends no tenant when the token carries no claim, rather than inventing one', async () => {
    useAuthStore.setState({ accessToken: tokenWith({ sub: 'u' }) } as never);
    client.post.mockResolvedValue({ content: { executive_summary: 'x' } });

    const { getByTestId } = await generate();

    await waitFor(() => expect(getByTestId('report-summary')).toBeTruthy());
    expect(client.post.mock.calls[0][1]).toMatchObject({ tenant_id: '' });
  });

  it('attributes the generation to the system when no user is known', async () => {
    useAuthStore.setState({ userId: null } as never);
    client.post.mockResolvedValue({ content: { executive_summary: 'x' } });

    const { getByTestId } = await generate();

    await waitFor(() => expect(getByTestId('report-summary')).toBeTruthy());
    expect(client.post.mock.calls[0][1]).toMatchObject({ generated_by: 'system' });
  });

  // A second press while one is in flight is a second billed generation of the same answer.
  //
  // The request is left UNSETTLED on purpose, and the presses are not awaited: awaiting `fireEvent`
  // hands control to a flush that will not finish while the handler's promise is pending, so the
  // test would time out on the very state it is trying to observe.
  it('blocks a second press while one is in flight', async () => {
    client.post.mockReturnValue(new Promise(() => undefined));

    const { getByTestId } = await renderScreen();
    await fireEvent.press(getByTestId('project-option-proj-1'));

    void fireEvent.press(getByTestId('generate-report-button'));
    await waitFor(() => expect(client.post).toHaveBeenCalledTimes(1));

    expect(getByTestId('generate-report-button').props.accessibilityState.disabled).toBe(true);

    void fireEvent.press(getByTestId('generate-report-button'));

    expect(client.post).toHaveBeenCalledTimes(1);
  });

  it('shows the summary the model returned', async () => {
    client.post.mockResolvedValue({
      content: { executive_summary: 'Riverside is two days ahead.' },
    });

    const { getByText } = await generate();

    await waitFor(() => expect(getByText('Riverside is two days ahead.')).toBeTruthy());
  });

  // "[object Object]" in front of a board member.
  it('shows no summary card when the model returned something that is not text', async () => {
    client.post.mockResolvedValue({ content: { executive_summary: { text: 'nope' } } });

    const { queryByTestId } = await generate();

    await waitFor(() => expect(client.post).toHaveBeenCalled());
    expect(queryByTestId('report-summary')).toBeNull();
  });

  // 503 = the Phase 11 stub. "Not yet", not "you broke it".
  it('reads a 503 as not-yet-available rather than as a failure', async () => {
    client.post.mockRejectedValue(httpError(503));

    const { getByTestId } = await generate();

    await waitFor(() => expect(getByTestId('report-unavailable')).toBeTruthy());
  });

  // Collapsing the two would hide a real outage behind "the feature is not built".
  it('keeps a real failure distinct from the not-yet-built one', async () => {
    client.post.mockRejectedValue(httpError(500));

    const { queryByTestId } = await generate();

    await waitFor(() => expect(client.post).toHaveBeenCalled());
    expect(queryByTestId('report-unavailable')).toBeNull();
    expect(queryByTestId('report-summary')).toBeNull();
  });

  it('treats a failure that is not an HTTP one the same way', async () => {
    client.post.mockRejectedValue(new Error('socket hang up'));

    const { queryByTestId } = await generate();

    await waitFor(() => expect(client.post).toHaveBeenCalled());
    expect(queryByTestId('report-unavailable')).toBeNull();
  });

  // A caveat read AFTER the text is read by someone who already believed it.
  it('puts the low-confidence caveat above the summary', async () => {
    client.post.mockResolvedValue({
      content: { executive_summary: 'Margins may be slipping.' },
      low_confidence: true,
    });

    const { getByTestId, getByText, toJSON } = await generate();

    await waitFor(() => expect(getByTestId('report-summary')).toBeTruthy());
    expect(getByText('Margins may be slipping.')).toBeTruthy();

    const lines = spoken(toJSON());
    expect(lines.indexOf('Margins may be slipping.')).toBeGreaterThan(0);
  });

  it('says nothing about confidence when the model was confident', async () => {
    client.post.mockResolvedValue({
      content: { executive_summary: 'Margins are steady.' },
      low_confidence: false,
    });

    const { getByTestId, toJSON } = await generate();

    await waitFor(() => expect(getByTestId('report-summary')).toBeTruthy());

    const lines = spoken(toJSON());
    expect(lines.indexOf('Margins are steady.')).toBe(0);
  });
});

/** The summary card's own text, in the order it is read. */
function spoken(tree: unknown): string[] {
  const card = findCard(tree);
  return card === null ? [] : strings(card);
}

function findCard(node: unknown): unknown {
  if (!node || typeof node !== 'object') return null;
  const n = node as { props?: { testID?: string }; children?: unknown[] };
  if (n.props?.testID === 'report-summary') return node;
  for (const child of n.children ?? []) {
    const found = findCard(child);
    if (found !== null) return found;
  }
  return null;
}

function strings(node: unknown): string[] {
  if (typeof node === 'string') return [node];
  if (!node || typeof node !== 'object') return [];
  return ((node as { children?: unknown[] }).children ?? []).flatMap(strings);
}
