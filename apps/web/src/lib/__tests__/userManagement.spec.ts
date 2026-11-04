import { userChangeErrorKey } from '../userManagement';

describe('userChangeErrorKey', () => {
  it('names the last-administrator guard', () => {
    expect(userChangeErrorKey({ code: 'COS-TADM-004' })).toBe('user.error.lastTenantAdmin');
  });

  it('names a user who is no longer in the tenant', () => {
    expect(userChangeErrorKey({ code: 'COS-USER-002', status: 404 })).toBe('user.error.notFound');
  });

  it('names the Path B role refusal', () => {
    expect(userChangeErrorKey({ code: 'COS-AUTH-002', status: 400 })).toBe(
      'user.role.pathBRequiresEmail',
    );
    // The same code on a 503 is the SMS provider, not a role refusal.
    expect(userChangeErrorKey({ code: 'COS-AUTH-002', status: 503 })).toBe(
      'settings.userChangeFailed',
    );
  });

  it.each([[{ code: 'COS-GENERAL-500' }], [{}], [null], [undefined]])(
    'falls back to the general message for %j',
    (error) => {
      expect(userChangeErrorKey(error)).toBe('settings.userChangeFailed');
    },
  );
});
