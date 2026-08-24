// Behaviour of the breadcrumb strip.
//
// It shares a source of truth with the top bar's back chevron: BREADCRUMB_MAP is read by both, via
// `isChildRoute`. That is the whole design — adding a route to the map gives it a breadcrumb AND a
// Back control, and the two can never disagree about whether a screen has a parent. So this file
// asserts both halves of that pair on the same routes the TopBar spec asserts, and the invariant
// that ties them: the strip is present exactly when `isChildRoute` says so.
//
// The last crumb is WHERE YOU ARE, so it is not a link. A breadcrumb whose final segment navigates
// to the screen already on top pushes a duplicate of it, and the back chevron then walks through a
// copy of the same page.

import { render, fireEvent } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { Breadcrumb, isChildRoute } from '../Breadcrumb';

const mockPush = jest.fn();
let mockPathname = '/home';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
  usePathname: () => mockPathname,
}));

function renderCrumb(props: Record<string, unknown> = {}) {
  return render(
    <I18nProvider>
      <Breadcrumb {...props} />
    </I18nProvider>,
  );
}

describe('Breadcrumb', () => {
  beforeEach(() => {
    mockPush.mockReset();
    mockPathname = '/home';
  });

  it('draws nothing on a screen with no parent', async () => {
    const { queryByTestId } = await renderCrumb();

    expect(queryByTestId('breadcrumb')).toBeNull();
  });

  it('draws the trail on a pushed child screen', async () => {
    mockPathname = '/dashboard';

    const { getByTestId } = await renderCrumb();

    expect(getByTestId('breadcrumb')).toBeTruthy();
  });

  // THE PAIR. The chevron and the strip read the same map, so a route can never have one without
  // the other — which is exactly what would happen if either kept its own list.
  it('appears exactly where the back chevron does', async () => {
    for (const path of ['/home', '/dashboard', '/vendors', '/more']) {
      mockPathname = path;
      const { queryByTestId } = await renderCrumb();

      expect(queryByTestId('breadcrumb') !== null).toBe(isChildRoute(path));
    }
  });

  // /more is a TAB. A breadcrumb there would also hand it a Back control, and a tab with a Back
  // button offers to leave a screen the user selected rather than arrived at.
  it('draws nothing on the More tab', async () => {
    mockPathname = '/more';

    const { queryByTestId } = await renderCrumb();

    expect(queryByTestId('breadcrumb')).toBeNull();
  });

  // /select-project stopped being a route on 2026-08-11 and became an overlay.
  it('draws nothing for the project picker, which is no longer a route', async () => {
    mockPathname = '/select-project';

    const { queryByTestId } = await renderCrumb();

    expect(queryByTestId('breadcrumb')).toBeNull();
  });

  it('makes the parent crumb a link', async () => {
    mockPathname = '/dashboard';

    const { getByTestId } = await renderCrumb();

    expect(getByTestId('crumb-0').props.accessibilityRole).toBe('link');
  });

  it('jumps to the parent when the parent crumb is taken', async () => {
    mockPathname = '/dashboard';

    const { getByTestId } = await renderCrumb();
    await fireEvent.press(getByTestId('crumb-0'));

    expect(mockPush).toHaveBeenCalledWith('/home');
  });

  // WHERE YOU ARE is not somewhere to go: a link on the last crumb pushes a duplicate of the screen
  // already on top, and the back chevron then walks through a copy of the same page.
  it('leaves the last crumb unlinked', async () => {
    mockPathname = '/dashboard';

    const { getByTestId, queryByTestId } = await renderCrumb();

    expect(getByTestId('crumb-0')).toBeTruthy();
    expect(queryByTestId('crumb-1')).toBeNull();
  });

  it('renders on the dark shell as well as the light one', async () => {
    mockPathname = '/dashboard';

    const { getByTestId } = await renderCrumb({ variant: 'dark' });

    expect(getByTestId('breadcrumb')).toBeTruthy();
  });

  it('announces itself as a header', async () => {
    mockPathname = '/dashboard';

    const { getByTestId } = await renderCrumb();

    expect(getByTestId('breadcrumb').props.accessibilityRole).toBe('header');
  });
});
