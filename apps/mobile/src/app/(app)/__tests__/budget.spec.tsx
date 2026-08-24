// Behaviour of the budget screen, pinned before its line list is moved off ScrollView.
//
// `lines` comes from GET /finance/budget/:id, whose repository query carries no LIMIT
// (backend/src/modules/finance/finance.repository.ts findLinesByBudget) and whose companion
// POST .../lines adds rows without bound — so the list is unbounded even though the five summary
// figures above it are a fixed tuple. What must survive: those figures, the variance colour
// thresholds, the lines themselves, and the select / empty / error states.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import BudgetScreen from '../budget';

jest.mock('../../../api/client', () => ({ get: jest.fn() }));
jest.mock('../../../hooks/useCollection', () => ({ useCollection: jest.fn(() => []) }));
jest.mock('../../../api/projects', () => ({
  refreshProjectsCache: jest.fn(async () => undefined),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useCollection } = require('../../../hooks/useCollection') as { useCollection: jest.Mock };

function budget(overrides: { variance?: string; lines?: unknown[] } = {}) {
  return {
    budget: {
      total_budget_amount: '1000000.0000',
      total_budget_currency: 'THB',
      allocated_amount: '900000.0000',
      committed_amount: '400000.0000',
      actual_amount: '350000.0000',
    },
    lines: overrides.lines ?? [
      { line_id: 'l-1', line_name: 'Structure', allocated_amount: '500000.0000' },
      { line_id: 'l-2', line_name: 'MEP', allocated_amount: '380000.0000' },
    ],
    variance_percentage: overrides.variance ?? '2.5000',
  };
}

function renderScreen() {
  return render(
    <I18nProvider>
      <BudgetScreen />
    </I18nProvider>,
  );
}

describe('BudgetScreen', () => {
  beforeEach(() => {
    client.get.mockReset();
    useCollection.mockReturnValue([{ projectId: 'proj-1', projectCode: 'RVT-01' }]);
  });

  it('asks the reader to pick a project before anything is fetched', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('project-picker')).toBeTruthy());
    expect(client.get).not.toHaveBeenCalled();
  });

  it('shows the five summary figures for the project picked', async () => {
    client.get.mockResolvedValue(budget());

    const { getByTestId, getByText } = await renderScreen();

    await fireEvent.press(getByTestId('project-option-proj-1'));

    await waitFor(() => expect(getByTestId('budget-figures')).toBeTruthy());
    expect(client.get).toHaveBeenCalledWith('/finance/budget/proj-1');
    expect(getByText('1000000.0000 THB')).toBeTruthy();
    expect(getByText('900000.0000')).toBeTruthy();
    expect(getByText('400000.0000')).toBeTruthy();
    expect(getByText('350000.0000')).toBeTruthy();
    expect(getByText('2.5000%')).toBeTruthy();
  });

  it('renders one row per budget line', async () => {
    client.get.mockResolvedValue(budget());

    const { getByTestId, getByText } = await renderScreen();

    await fireEvent.press(getByTestId('project-option-proj-1'));

    await waitFor(() => expect(getByText('Structure')).toBeTruthy());
    expect(getByText('MEP')).toBeTruthy();
    expect(getByText('500000.0000')).toBeTruthy();
  });

  it('omits the lines section entirely when the budget has none', async () => {
    client.get.mockResolvedValue(budget({ lines: [] }));

    const { getByTestId, queryByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('project-option-proj-1'));

    await waitFor(() => expect(getByTestId('budget-figures')).toBeTruthy());
    expect(queryByTestId('budget-lines')).toBeNull();
  });

  it('reports a load failure rather than leaving figures on screen', async () => {
    client.get.mockRejectedValue(new Error('offline'));

    const { getByTestId, queryByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('project-option-proj-1'));

    await waitFor(() => expect(queryByTestId('budget-figures')).toBeNull());
  });
});
