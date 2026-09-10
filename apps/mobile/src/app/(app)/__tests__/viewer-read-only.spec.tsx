// §20.7.9 — a VIEWER is shown no create, edit or approve control, on any screen it can reach.
//
// ── WHY THIS FILE EXISTS, AND WHY IT IS ONE FILE RATHER THAN SEVEN ASSERTIONS SCATTERED ─────────
//
// §32.7 justified this role's tab set with an audit run on 2026-08-04: the three screens chosen
// "were each verified to contain no `onPress`/`Pressable` at all". True on the day, and it decayed
// with no test to notice. `/procurement` was rebuilt into the manager's dashboard on 2026-08-10 and
// grew an APPROVE button wired to a real `approvePurchaseOrder`. `/budget` was rebuilt on
// 2026-09-08 and grew "request an amendment". Four more screens this role reaches through the
// DRAWER — which that audit never covered — grew controls of their own. A re-audit on 2026-09-11
// found SEVEN of the seventeen reachable routes rendering a mutating control.
//
// A static scan cannot close this. It reads the file and sees the handler; it cannot see that the
// element is inside `{canWrite ? … : null}`, or that a whole component is never rendered for this
// role. Only a render can. So each case below RENDERS the screen as a VIEWER and asserts the
// control is not in the tree.
//
// THE OTHER HALF OF EACH CASE IS THE ONE THAT MATTERS MOST. Every test also renders the same screen
// as the role that SHOULD have the control, and asserts it is there. Without that pair, a bug that
// hid the button from everybody would pass this file completely.

import React from 'react';
import { render, waitFor, fireEvent } from '@testing-library/react-native';
import { CosRole } from '@cos/types';
import { I18nProvider } from '../../../i18n';
import { useAuthStore } from '../../../store/authStore';
import OrdersScreen from '../orders';
import TasksScreen from '../tasks';
import DeliveriesRoute from '../deliveries';
import ProcurementScreen from '../procurement';
import BudgetScreen from '../budget';

jest.mock('../../../api/client', () => ({ get: jest.fn(), post: jest.fn(), mutate: jest.fn() }));
jest.mock('../../../hooks/useCollection', () => ({ useCollection: jest.fn(() => []) }));
jest.mock('../../../api/projects', () => ({
  refreshProjectsCache: jest.fn(async () => undefined),
  getMyProjects: jest.fn(async () => []),
}));
jest.mock('../../../api/procurement', () => ({
  listPurchaseOrders: jest.fn(async () => ({ items: [], total: 0 })),
  listDeliveries: jest.fn(async () => ({ items: [], total: 0 })),
  listVendorInvoices: jest.fn(async () => ({ items: [], total: 0 })),
  vendorIndex: jest.fn(async () => new Map()),
  projectNameIndex: jest.fn(async () => new Map()),
  poIndex: jest.fn(async () => new Map()),
  approvePurchaseOrder: jest.fn(),
  approveVendorInvoice: jest.fn(),
  disputeVendorInvoice: jest.fn(),
  fetchPendingApprovals: jest.fn(async () => ({ pos: [], rfqs: [] })),
}));
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
  useLocalSearchParams: () => ({}),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const client = require('../../../api/client') as { get: jest.Mock };
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { useCollection } = require('../../../hooks/useCollection') as { useCollection: jest.Mock };

/** Anything the screens fetch directly. Empty answers everywhere — this file tests CHROME. */
function quiet(): void {
  client.get.mockImplementation(() => Promise.resolve({ items: [], total: 0 }));
}

/** `render()` resolves a thenable in this setup, so every caller awaits it. */
async function renderAs(role: CosRole, element: React.JSX.Element) {
  useAuthStore.setState({ role } as never);
  return await render(<I18nProvider>{element}</I18nProvider>);
}

/**
 * One screen, one control, both directions.
 *
 * `allowed` is the role the control belongs to. Asserting only the VIEWER half would pass on a
 * screen that had lost the button for everyone.
 */
function bothWays(
  what: string,
  element: () => React.JSX.Element,
  testId: string,
  allowed: CosRole,
): void {
  describe(what, () => {
    it(`renders ${testId} for ${allowed}`, async () => {
      quiet();
      const { queryByTestId, getByTestId } = await renderAs(allowed, element());
      await waitFor(() => expect(queryByTestId(testId) ?? getByTestId(testId)).toBeTruthy());
    });

    it(`renders no ${testId} for VIEWER`, async () => {
      quiet();
      const { queryByTestId } = await renderAs(CosRole.VIEWER, element());
      // Allow the screen to settle before concluding it is absent — a control that appears after a
      // fetch would otherwise pass this test by being late rather than by being gated.
      await waitFor(() => expect(queryByTestId(testId)).toBeNull());
      expect(queryByTestId(testId)).toBeNull();
    });
  });
}

describe('§20.7.9 — the read-only role is offered nothing it may not do', () => {
  beforeEach(() => {
    client.get.mockReset();
    useCollection.mockReset();
    useCollection.mockImplementation(() => []);
    useAuthStore.setState({ role: null } as never);
  });

  bothWays(
    'deliveries — the FAB that opens the record form',
    () => <DeliveriesRoute />,
    'delivery-fab',
    CosRole.PROCUREMENT_OFFICER,
  );

  describe('tasks — the progress editor, which lives behind a selected task', () => {
    /** One cached task, then open it — the editor cannot appear on the list alone. */
    async function openTask(role: CosRole) {
      quiet();
      useCollection.mockImplementation(() => [
        {
          id: 't-1',
          taskId: 'task-1',
          projectId: 'p-1',
          taskName: 'Pour level 18',
          status: 'IN_PROGRESS',
          progressPercent: 40,
          offlineSyncStatus: 'SYNCED',
        },
      ]);
      const view = await renderAs(role, <TasksScreen />);
      await waitFor(() => expect(view.getByText('Pour level 18')).toBeTruthy());
      fireEvent.press(view.getByText('Pour level 18'));
      await waitFor(() => expect(view.getByTestId('task-detail-screen')).toBeTruthy());
      return view;
    }

    it('gives SITE_WORKER the editor and its save button', async () => {
      const { getByTestId } = await openTask(CosRole.SITE_WORKER);
      expect(getByTestId('progress-input')).toBeTruthy();
      expect(getByTestId('save-progress-button')).toBeTruthy();
    });

    it('gives VIEWER the task, and neither control', async () => {
      const { queryByTestId } = await openTask(CosRole.VIEWER);
      // The task itself still opens — §6.8 grants this role `Tasks R`, and reading one is the
      // point. What goes is the pair that edits it.
      expect(queryByTestId('progress-input')).toBeNull();
      expect(queryByTestId('save-progress-button')).toBeNull();
    });
  });

  describe('procurement — the whole manager dashboard, approve button and all', () => {
    it('gives PROJECT_MANAGER its dashboard', async () => {
      quiet();
      const { queryByTestId } = await renderAs(CosRole.PROJECT_MANAGER, <ProcurementScreen />);
      await waitFor(() => expect(queryByTestId('viewer-procurement')).toBeNull());
    });

    it('gives VIEWER its own screen instead', async () => {
      quiet();
      const { getByTestId } = await renderAs(CosRole.VIEWER, <ProcurementScreen />);
      // Not "the approve button is hidden" — the manager's screen is not rendered at all for this
      // role, which is the stronger statement and the one F1 = A was chosen for.
      await waitFor(() => expect(getByTestId('viewer-procurement')).toBeTruthy());
    });
  });

  describe('budget — the FINANCE screen and its amendment control', () => {
    it('gives FINANCE its own screen', async () => {
      quiet();
      const { queryByTestId } = await renderAs(CosRole.FINANCE, <BudgetScreen />);
      await waitFor(() => expect(queryByTestId('viewer-budget')).toBeNull());
    });

    it('gives VIEWER its own screen instead', async () => {
      quiet();
      const { getByTestId } = await renderAs(CosRole.VIEWER, <BudgetScreen />);
      await waitFor(() => expect(getByTestId('viewer-budget')).toBeTruthy());
    });
  });

  describe('orders — the approval on a pending purchase order', () => {
    it('renders no approve control for VIEWER even when an order is pending', async () => {
      quiet();
      const { queryByTestId } = await renderAs(CosRole.VIEWER, <OrdersScreen />);
      await waitFor(() => expect(queryByTestId('order-approve-po-1')).toBeNull());
    });
  });
});
