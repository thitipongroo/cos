import { useUiStore } from '../uiStore';

describe('uiStore (navigation drawer)', () => {
  beforeEach(() => {
    useUiStore.setState({ drawerOpen: false });
  });

  it('defaults to a closed drawer', () => {
    expect(useUiStore.getState().drawerOpen).toBe(false);
  });

  it('openDrawer opens the drawer', () => {
    useUiStore.getState().openDrawer();
    expect(useUiStore.getState().drawerOpen).toBe(true);
  });

  it('closeDrawer closes the drawer', () => {
    useUiStore.setState({ drawerOpen: true });
    useUiStore.getState().closeDrawer();
    expect(useUiStore.getState().drawerOpen).toBe(false);
  });
});
