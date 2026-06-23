import {
  isE2EEnabled,
  getForcedOnline,
  setForcedOnline,
  subscribeNetworkOverride,
  __resetNetworkOverrideForTests,
} from '../networkOverride';

describe('networkOverride (E2E network hook)', () => {
  const original = process.env['EXPO_PUBLIC_E2E'];

  afterEach(() => {
    __resetNetworkOverrideForTests();
    if (original === undefined) delete process.env['EXPO_PUBLIC_E2E'];
    else process.env['EXPO_PUBLIC_E2E'] = original;
  });

  it('is completely inert in production (EXPO_PUBLIC_E2E unset)', () => {
    delete process.env['EXPO_PUBLIC_E2E'];
    expect(isE2EEnabled()).toBe(false);

    let notified = 0;
    const unsub = subscribeNetworkOverride(() => {
      notified += 1;
    });
    setForcedOnline(false);

    expect(getForcedOnline()).toBeNull(); // never overrides real NetInfo
    expect(notified).toBe(0); // subscribe is a no-op
    unsub();
  });

  it('forces/clears online state and notifies subscribers when E2E is enabled', () => {
    process.env['EXPO_PUBLIC_E2E'] = '1';
    expect(isE2EEnabled()).toBe(true);

    let notified = 0;
    const unsub = subscribeNetworkOverride(() => {
      notified += 1;
    });

    setForcedOnline(false);
    expect(getForcedOnline()).toBe(false);

    setForcedOnline(true);
    expect(getForcedOnline()).toBe(true);

    setForcedOnline(null); // clear → fall back to real NetInfo
    expect(getForcedOnline()).toBeNull();

    expect(notified).toBe(3);

    unsub();
    setForcedOnline(false);
    expect(notified).toBe(3); // no notification after unsubscribe
  });
});
