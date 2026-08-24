import { useInviteRoleStore } from '../inviteRoleStore';

describe('inviteRoleStore (roles-selection hand-off)', () => {
  beforeEach(() => {
    useInviteRoleStore.setState({ pendingRole: null });
  });

  it('has no pending role by default', () => {
    expect(useInviteRoleStore.getState().pendingRole).toBeNull();
  });

  it('setPendingRole stores the confirmed role', () => {
    useInviteRoleStore.getState().setPendingRole('PROJECT_MANAGER');
    expect(useInviteRoleStore.getState().pendingRole).toBe('PROJECT_MANAGER');
  });

  it('clearPendingRole resets it once consumed', () => {
    useInviteRoleStore.getState().setPendingRole('FINANCE');
    useInviteRoleStore.getState().clearPendingRole();
    expect(useInviteRoleStore.getState().pendingRole).toBeNull();
  });
});
