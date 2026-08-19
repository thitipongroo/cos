// First render test in apps/mobile — see jest.render.config.ts for why the project exists and how
// it is wired. Everything under src/components and src/app was previously unreachable from jest
// (jest.config.ts stubs react-native, and collectCoverageFrom excludes both trees).
//
// NOTE: @testing-library/react-native 14 returns a PROMISE from render — `const { getByTestId } =
// render(...)` yields undefined queries, and the `screen` singleton is only populated once that
// promise settles. Every render below is awaited for that reason.

import { render } from '@testing-library/react-native';
import { I18nProvider } from '../../i18n';
import { StatusChip } from '../StatusChip';

async function renderChip(label: string) {
  return render(
    <I18nProvider>
      <StatusChip label={label} testID="chip" />
    </I18nProvider>,
  );
}

describe('StatusChip', () => {
  it('renders a chip for a known status', async () => {
    const { getByTestId } = await renderChip('DONE');
    expect(getByTestId('chip')).toBeTruthy();
  });

  it('renders a chip for an unknown status rather than failing', async () => {
    const { getByTestId } = await renderChip('NOT_A_REAL_STATUS');
    expect(getByTestId('chip')).toBeTruthy();
  });
});
