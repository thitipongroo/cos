describe('lastRoute (E2E deep-link helper)', () => {
  let mod: typeof import('../lastRoute');

  beforeEach(async () => {
    // Reset the module-level `lastAppPath` singleton between tests for isolation.
    jest.resetModules();
    mod = await import('../lastRoute');
  });

  it('returns the default home path before anything is recorded', () => {
    expect(mod.getLastAppPath()).toBe('/(app)/home');
  });

  it('records a normal in-app path', () => {
    mod.setLastAppPath('/(app)/inspections');
    expect(mod.getLastAppPath()).toBe('/(app)/inspections');
  });

  it('ignores an empty path (falsy branch — keeps the previous value)', () => {
    mod.setLastAppPath('');
    expect(mod.getLastAppPath()).toBe('/(app)/home');
  });

  it('ignores e2e routes so the deep link never returns into itself', () => {
    mod.setLastAppPath('/(app)/e2e/network');
    expect(mod.getLastAppPath()).toBe('/(app)/home');
  });
});
