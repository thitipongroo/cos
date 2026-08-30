// Behaviour of the executive portfolio, pinned before its row is memoized.
//
// Two sources meet in each row: the project comes from the local cache and its health badge from
// /analytics/executive, joined by projectId. That join is what a row memoized on the wrong props
// gets wrong — one project's "at risk" badge beside another project's name — and no assertion that
// merely looks for text on screen would notice.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import PortfolioScreen from '../portfolio';

jest.mock('../../../api/client', () => ({ get: jest.fn() }));
jest.mock('../../../hooks/useCollection', () => ({ useCollection: jest.fn(() => []) }));
jest.mock('../../../api/projects', () => ({
  refreshProjectsCache: jest.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useCollection } = require('../../../hooks/useCollection') as { useCollection: jest.Mock };

const HEALTHY = {
  id: 'p-1',
  projectId: 'proj-1',
  projectCode: 'RVT-01',
  projectName: 'Riverside Tower',
  status: 'ACTIVE',
};
const AT_RISK = {
  id: 'p-2',
  projectId: 'proj-2',
  projectCode: 'HBR-02',
  projectName: 'Harbour Works',
  status: 'ACTIVE',
};

const EXEC_ROWS = [
  { projectId: 'proj-1', utilizationPct: 62, atRisk: 0 },
  { projectId: 'proj-2', utilizationPct: 118, atRisk: 1 },
];

function renderScreen() {
  return render(
    <I18nProvider>
      <PortfolioScreen />
    </I18nProvider>,
  );
}

describe('PortfolioScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    useCollection.mockReset();
    useCollection.mockReturnValue([HEALTHY, AT_RISK]);
    client.get.mockResolvedValue(EXEC_ROWS);
  });

  it('renders one row per cached project', async () => {
    const { getAllByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('portfolio-item')).toHaveLength(2));
    expect(getByText('Riverside Tower')).toBeTruthy();
    expect(getByText('Harbour Works')).toBeTruthy();
  });

  it('puts each health badge on the project it belongs to', async () => {
    const { getAllByTestId, getByText } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('portfolio-item')).toHaveLength(2));
    // proj-1 is healthy, so it shows its utilisation; proj-2 is flagged instead of showing 118%.
    expect(getByText('62%')).toBeTruthy();
    expect(() => getByText('118%')).toThrow();
  });

  it('opens the health detail of the project that was tapped', async () => {
    const { getByText, getByTestId } = await renderScreen();

    await waitFor(() => expect(getByText('Harbour Works')).toBeTruthy());
    await fireEvent.press(getByText('Harbour Works'));

    await waitFor(() => expect(getByTestId('portfolio-health')).toBeTruthy());
    expect(getByTestId('health-at-risk')).toBeTruthy();
  });

  it('still lists the projects when the health request fails offline', async () => {
    client.get.mockRejectedValue(new Error('offline'));

    const { getAllByTestId } = await renderScreen();

    await waitFor(() => expect(getAllByTestId('portfolio-item')).toHaveLength(2));
  });
});
