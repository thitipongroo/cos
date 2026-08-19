// Behaviour of the issue board, pinned before the row-memoization refactor.
//
// This screen reads the LOCAL Drizzle tables rather than the API, so the seam mocked here is
// useCollection — the hook the screens call — not the database. Mocking lower would mean asserting
// against a fake SQLite instead of against the screen.
//
// What these tests protect: the project scoping, the filter chips, and — most of all — the photo
// join. Each card is headed by the photo captured with THAT issue, matched on issueId; a row
// memoized on the wrong props draws one issue's defect photo above another issue's title, which no
// "the text is on screen" assertion would catch.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { CosRole } from '@cos/types';
import { I18nProvider } from '../../../i18n';
import { useAuthStore } from '../../../store/authStore';
import { useProjectStore } from '../../../store/projectStore';
import IssuesScreen from '../issues';

jest.mock('../../../hooks/useCollection', () => ({ useCollection: jest.fn() }));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useCollection } = require('../../../hooks/useCollection') as {
  useCollection: jest.Mock;
};

const PROJECT_ID = 'proj-1';

function issue(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'local-1',
    issueId: 'srv-1',
    projectId: PROJECT_ID,
    reportId: null,
    title: 'Cracked column on level 3',
    description: 'Cracked column on level 3',
    severity: 'MEDIUM',
    status: 'OPEN',
    issueType: 'DEFECT',
    createdAt: '2026-08-19T08:00:00Z',
    offlineSyncStatus: 'SYNCED',
    ...over,
  };
}

function photo(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 'photo-1',
    entityType: 'issue',
    entityId: 'srv-1',
    localPath: 'file:///photos/one.jpg',
    uploadStatus: 'PENDING',
    ...over,
  };
}

/** useCollection is called once per table; answer by table name. */
function withCollections(issues: unknown[], photos: unknown[] = []) {
  useCollection.mockImplementation((table: string) =>
    table === 'local_issues' ? issues : table === 'local_photos' ? photos : [],
  );
}

function renderScreen() {
  return render(
    <I18nProvider>
      <IssuesScreen />
    </I18nProvider>,
  );
}

describe('IssuesScreen', () => {
  beforeEach(() => {
    useCollection.mockReset();
    useAuthStore.setState({ role: CosRole.SITE_ENGINEER });
    useProjectStore.setState({
      active: { projectId: PROJECT_ID, projectName: 'Riverside Tower' },
    } as never);
  });

  it('renders one card per issue in the active project', async () => {
    withCollections([
      issue(),
      issue({ id: 'local-2', issueId: 'srv-2', title: 'Water ingress in basement' }),
    ]);

    const { getAllByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('issue-item')).toHaveLength(2));
    expect(getByText('Cracked column on level 3')).toBeTruthy();
    expect(getByText('Water ingress in basement')).toBeTruthy();
  });

  it('leaves out issues belonging to another project', async () => {
    withCollections([
      issue(),
      issue({ id: 'local-9', issueId: 'srv-9', projectId: 'other', title: 'Not this site' }),
    ]);

    const { getAllByTestId, queryByText } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('issue-item')).toHaveLength(1));
    expect(queryByText('Not this site')).toBeNull();
  });

  it('narrows the board to the chosen severity chip', async () => {
    withCollections([
      issue({ severity: 'CRITICAL', title: 'Scaffold collapse risk' }),
      issue({ id: 'local-2', issueId: 'srv-2', severity: 'LOW', title: 'Paint scuff' }),
    ]);

    const { getAllByTestId, getByTestId, queryByText } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('issue-item')).toHaveLength(2));

    fireEvent.press(getByTestId('issue-filter-critical'));

    await waitFor(() => expect(getAllByTestId('issue-item')).toHaveLength(1));
    expect(queryByText('Paint scuff')).toBeNull();
  });

  it('heads a card with the photo captured for that issue, and only that issue', async () => {
    withCollections(
      [issue(), issue({ id: 'local-2', issueId: 'srv-2', title: 'No photo on this one' })],
      [photo()],
    );

    const { getAllByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('issue-item')).toHaveLength(2));
    // The photo testID carries the LOCAL row id of the issue it belongs to.
    expect(queryByTestId('issue-photo-local-1')).toBeTruthy();
    expect(queryByTestId('issue-photo-local-2')).toBeNull();
  });

  it('gives SITE_WORKER the capture form instead of the board', async () => {
    useAuthStore.setState({ role: CosRole.SITE_WORKER });
    withCollections([issue()]);

    const { queryAllByTestId, getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('issues-screen')).toBeTruthy());
    expect(queryAllByTestId('issue-item')).toHaveLength(0);
  });
});
