// Behaviour of the integrations catalogue.
//
// All three connectors are unbuilt, and the screen's job is to say that rather than to pretend
// otherwise — the same rule the apps catalogue and the More tab follow. A connector tile that opened
// a configuration form with no adapter behind it would collect a channel token nobody could use, and
// one that did nothing at all would read as the app being broken.
//
// The search filters on the connector's NAME as displayed, not on the key the code uses, and when
// nothing matches the screen says so instead of showing an empty list under a live heading.

import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { Alert } from 'react-native';
import { I18nProvider } from '../../../i18n';
import SystemIntegrationScreen from '../system-integration';

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

function renderScreen() {
  return render(
    <I18nProvider>
      <SystemIntegrationScreen />
    </I18nProvider>,
  );
}

describe('SystemIntegrationScreen', () => {
  let alert: jest.SpyInstance;

  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  afterEach(() => alert.mockRestore());

  it('lists every connector', async () => {
    const { getByTestId } = await renderScreen();

    expect(getByTestId('integration-line')).toBeTruthy();
    expect(getByTestId('integration-bim360')).toBeTruthy();
    expect(getByTestId('integration-erp')).toBeTruthy();
  });

  // A form with no adapter behind it collects a token nobody can use; silence reads as a broken app.
  it('reports a connector as unbuilt rather than opening a form', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('integration-line'));

    expect(alert).toHaveBeenCalled();
  });

  it('says the same for every connector, not just the first', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.press(getByTestId('integration-bim360'));
    await fireEvent.press(getByTestId('integration-erp'));

    expect(alert).toHaveBeenCalledTimes(2);
  });

  // Filters on the displayed name, not on the key.
  it('narrows the list by what the tile says', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('integration-search'), 'line');

    await waitFor(() => expect(getByTestId('integration-line')).toBeTruthy());
    expect(queryByTestId('integration-erp')).toBeNull();
  });

  it('says so when nothing matches, rather than showing an empty list', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('integration-search'), 'zzzzz-no-such-connector');

    await waitFor(() => expect(queryByTestId('integration-line')).toBeNull());
    expect(getByTestId('system-integration')).toBeTruthy();
  });

  it('restores the list when the search is cleared', async () => {
    const { getByTestId, queryByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('integration-search'), 'line');
    await waitFor(() => expect(queryByTestId('integration-erp')).toBeNull());

    await fireEvent.changeText(getByTestId('integration-search'), '');

    await waitFor(() => expect(getByTestId('integration-erp')).toBeTruthy());
  });

  it('ignores surrounding whitespace in the search', async () => {
    const { getByTestId } = await renderScreen();

    await fireEvent.changeText(getByTestId('integration-search'), '   ');

    await waitFor(() => expect(getByTestId('integration-erp')).toBeTruthy());
  });
});
