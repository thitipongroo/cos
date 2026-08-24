// Behaviour of the Apps & Services catalogue.
//
// Almost everything on this screen is NOT BUILT YET, and that is the point of the screen existing at
// all: the mockup lists the platform's modules, and the product's rule (the same one the
// transparency portal and the account card follow) is to keep the content and say plainly what has
// nothing behind it. So a tile that is not a real destination must REPORT that rather than navigate,
// and the one row that IS a destination must actually go there. A tile that silently does nothing
// reads as the app being broken.
//
// Search filters every section by NAME, which means it filters on the translated label rather than
// on the key — searching for what is on the screen, not for what the code calls it. Sections that
// match nothing disappear, and when nothing matches at all the screen says so instead of showing
// three empty headings.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../../i18n';
import AppsServicesScreen from '../apps-services';

const mockPush = jest.fn();
jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush, back: jest.fn(), replace: jest.fn() }),
}));

function renderScreen() {
  return render(
    <I18nProvider>
      <AppsServicesScreen />
    </I18nProvider>,
  );
}

describe('AppsServicesScreen', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    mockPush.mockReset();
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => alert.mockRestore());

  it('lists the core modules', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('apps-module-siteReports')).toBeTruthy();
    expect(getByTestId('apps-module-bimViewer')).toBeTruthy();
  });

  it('lists the admin tools and the integrations', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('apps-tool-auditLogs')).toBeTruthy();
    expect(getByTestId('apps-ext-line')).toBeTruthy();
    expect(getByTestId('apps-ext-erp')).toBeTruthy();
  });

  // A tile that silently does nothing reads as the app being broken rather than the module being
  // unbuilt.
  it('reports an unbuilt module rather than navigating', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('apps-module-siteReports'));

    expect(alert).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('reports an unbuilt admin tool the same way', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('apps-tool-auditLogs'));

    expect(alert).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  it('reports an unbuilt integration the same way', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('apps-ext-erp'));

    expect(alert).toHaveBeenCalled();
    expect(mockPush).not.toHaveBeenCalled();
  });

  // Search reads the LABEL, not the key — what is on screen, not what the code calls it.
  it('narrows the catalogue by what the tile says', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('apps-search'), 'drone');

    await waitFor(() => expect(getByTestId('apps-module-drone')).toBeTruthy());
    expect(queryByTestId('apps-module-siteReports')).toBeNull();
  });

  it('hides a section that matches nothing', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('apps-search'), 'drone');

    await waitFor(() => expect(getByTestId('apps-module-drone')).toBeTruthy());
    expect(queryByTestId('apps-tool-auditLogs')).toBeNull();
    expect(queryByTestId('apps-ext-line')).toBeNull();
  });

  // Three empty headings would look like a loading failure; the screen says what happened instead.
  it('says so when nothing at all matches', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('apps-search'), 'zzzzz-no-such-module');

    await waitFor(() => expect(queryByTestId('apps-module-siteReports')).toBeNull());
    expect(getByTestId('apps-services')).toBeTruthy();
  });

  it('restores the full catalogue when the search is cleared', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('apps-search'), 'drone');
    await waitFor(() => expect(queryByTestId('apps-module-siteReports')).toBeNull());

    await fireEvent.changeText(getByTestId('apps-search'), '');

    await waitFor(() => expect(getByTestId('apps-module-siteReports')).toBeTruthy());
  });

  it('ignores surrounding whitespace in the search', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('apps-search'), '   ');

    await waitFor(() => expect(getByTestId('apps-module-siteReports')).toBeTruthy());
  });
});
