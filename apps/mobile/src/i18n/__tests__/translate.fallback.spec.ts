// Fallback th→en (QM-3): th.json is mocked empty so the en message must be served.

jest.mock('../th.json', () => ({}));

import { statusLabel, translate } from '../translate';

describe('translate fallback th→en', () => {
  it('serves the en message when th lacks the key', () => {
    expect(translate('th', 'home.main.title')).toBe('Home');
  });

  it('serves the en ICU message when th lacks the key', () => {
    expect(translate('th', 'sync.statusBar.pending', { count: 2 })).toBe('2 changes pending');
  });

  it('statusLabel falls back to the en label', () => {
    expect(statusLabel('th', 'PENDING')).toBe('Pending');
  });
});
