// Behaviour of the role-permissions breakdown — what a role may do, shown before it is granted.
//
// This screen is read at the moment someone decides what a colleague will be able to do, so what it
// says has to be exactly what the server grants. The mapping is the part worth pinning:
//
//   `*:*`           → every resource, at FULL
//   `<res>:*`       → that resource at FULL
//   `<res>:approve` → FULL as well; approving is the strongest verb the matrix has
//   `<res>:write`   → RW
//   anything else   → R
//
// A resource the role has NO permission on is left out entirely rather than shown at R — listing it
// would say the role can read something it cannot.
//
// And a request that failed is not an empty permission set: an admin reading "this role can do
// nothing" and granting it anyway is the failure mode a silent catch would cause.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { I18nProvider } from '../../../i18n';
import RolePermissionsScreen from '../role-permissions';

const mockBack = jest.fn();
let mockParams: Record<string, string> = { role: 'SITE_ENGINEER' };

jest.mock('expo-router', () => ({
  useLocalSearchParams: () => mockParams,
  useRouter: () => ({ push: jest.fn(), back: mockBack, replace: jest.fn() }),
}));

jest.mock('../../../api/roles', () => ({
  ...jest.requireActual('../../../api/roles'),
  getRolePermissions: jest.fn(),
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const api = require('../../../api/roles') as { getRolePermissions: jest.Mock };

function renderScreen() {
  return render(
    <I18nProvider>
      <RolePermissionsScreen />
    </I18nProvider>,
  );
}

/** The level badge a resource card is showing. */
function levelOf(card: { children?: unknown }): string {
  const flat: string[] = [];
  const walk = (node: unknown): void => {
    if (typeof node === 'string') flat.push(node);
    else if (Array.isArray(node)) node.forEach(walk);
    else if (node && typeof node === 'object' && 'props' in node) {
      walk((node as { props: { children?: unknown } }).props.children);
    }
  };
  walk(card.children);
  return flat.find((s) => s === 'R' || s === 'RW' || s === 'FULL') ?? '';
}

describe('RolePermissionsScreen', () => {
  beforeEach(() => {
    mockBack.mockReset();
    mockParams = { role: 'SITE_ENGINEER' };
    api.getRolePermissions.mockReset();
    api.getRolePermissions.mockResolvedValue({ role: 'SITE_ENGINEER', permissions: [] });
  });

  it('asks the server what this role holds', async () => {
    await renderScreen();

    await waitFor(() => expect(api.getRolePermissions).toHaveBeenCalledWith('SITE_ENGINEER'));
  });

  it('lists a card per resource the role has any permission on', async () => {
    api.getRolePermissions.mockResolvedValue({
      role: 'SITE_ENGINEER',
      permissions: ['project:read', 'task:write'],
    });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('role-perm-project')).toBeTruthy());
    expect(getByTestId('role-perm-task')).toBeTruthy();
  });

  // Listing a resource at R when the role holds nothing on it would say it can read something it
  // cannot.
  it('leaves out a resource the role holds nothing on', async () => {
    api.getRolePermissions.mockResolvedValue({
      role: 'SITE_ENGINEER',
      permissions: ['project:read'],
    });

    const { getByTestId, queryByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('role-perm-project')).toBeTruthy());
    expect(queryByTestId('role-perm-finance')).toBeNull();
  });

  it('reads a write grant as RW', async () => {
    api.getRolePermissions.mockResolvedValue({
      role: 'SITE_ENGINEER',
      permissions: ['task:read', 'task:write'],
    });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('role-perm-task')).toBeTruthy());
    expect(levelOf(getByTestId('role-perm-task').props)).toBe('RW');
  });

  it('reads a read-only grant as R', async () => {
    api.getRolePermissions.mockResolvedValue({
      role: 'SITE_ENGINEER',
      permissions: ['task:read'],
    });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('role-perm-task')).toBeTruthy());
    expect(levelOf(getByTestId('role-perm-task').props)).toBe('R');
  });

  // Approving is the strongest verb the matrix has — it outranks write.
  it('reads an approve grant as FULL', async () => {
    api.getRolePermissions.mockResolvedValue({
      role: 'SAFETY_OFFICER',
      permissions: ['safety:read', 'safety:approve'],
    });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('role-perm-safety')).toBeTruthy());
    expect(levelOf(getByTestId('role-perm-safety').props)).toBe('FULL');
  });

  it('reads a resource wildcard as FULL', async () => {
    api.getRolePermissions.mockResolvedValue({
      role: 'FINANCE',
      permissions: ['finance:*'],
    });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('role-perm-finance')).toBeTruthy());
    expect(levelOf(getByTestId('role-perm-finance').props)).toBe('FULL');
  });

  it('reads the global wildcard as FULL on everything', async () => {
    api.getRolePermissions.mockResolvedValue({ role: 'TENANT_ADMIN', permissions: ['*:*'] });

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('role-perm-project')).toBeTruthy());
    expect(levelOf(getByTestId('role-perm-project').props)).toBe('FULL');
    expect(levelOf(getByTestId('role-perm-finance').props)).toBe('FULL');
  });

  // A failed request is not "this role can do nothing" — an admin who read that and granted anyway
  // is the reason this says which it is.
  it('reports a failure rather than an empty permission set', async () => {
    api.getRolePermissions.mockRejectedValue(new Error('offline'));

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('role-permissions-error')).toBeTruthy());
  });

  it('reports an error when the route named no role', async () => {
    mockParams = {};

    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('role-permissions-error')).toBeTruthy());
    expect(api.getRolePermissions).not.toHaveBeenCalled();
  });

  it('goes back to the invitation it was opened from', async () => {
    const { getByTestId } = await renderScreen();

    await waitFor(() => expect(getByTestId('role-permissions-back')).toBeTruthy());
    await fireEvent.press(getByTestId('role-permissions-back'));

    expect(mockBack).toHaveBeenCalledTimes(1);
  });
});
