// Plan CV (product owner 2026-11-20): a sign-out the user chooses forgets the active project, then ends the session.
const order: string[] = [];
const clear = jest.fn(async () => {
  order.push('clear');
});
const logout = jest.fn(async () => {
  order.push('logout');
});
const setState = jest.fn(() => {
  order.push('forget');
});
jest.mock('../projectStore', () => ({
  useProjectStore: { getState: () => ({ clear }), setState },
}));
jest.mock('../authStore', () => ({ useAuthStore: { getState: () => ({ logout }) } }));

import { signOutByChoice } from '../signOut';

describe('signOutByChoice', () => {
  beforeEach(() => {
    order.length = 0;
    jest.clearAllMocks();
  });

  it('forgets the project in memory, signs out, then removes the stored copy', async () => {
    await signOutByChoice();
    expect(order).toEqual(['forget', 'logout', 'clear']);
    expect(setState).toHaveBeenCalledWith({ active: null, pickerOpen: false });
  });

  it('a storage failure removing the stored copy does not fail the sign-out', async () => {
    clear.mockRejectedValueOnce(new Error('keychain unavailable'));
    await expect(signOutByChoice()).resolves.toBeUndefined();
    expect(logout).toHaveBeenCalledTimes(1);
  });
});
