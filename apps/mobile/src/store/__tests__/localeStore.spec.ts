jest.mock('expo-secure-store', () => ({
  setItemAsync: jest.fn().mockResolvedValue(undefined),
  getItemAsync: jest.fn().mockResolvedValue(null),
  deleteItemAsync: jest.fn().mockResolvedValue(undefined),
}));

import * as SecureStore from 'expo-secure-store';
import { useLocaleStore } from '../localeStore';

describe('localeStore (QM-3)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useLocaleStore.setState({ locale: 'th' });
  });

  it('defaults to th', () => {
    expect(useLocaleStore.getState().locale).toBe('th');
  });

  it('setLocale updates state and persists the choice', async () => {
    await useLocaleStore.getState().setLocale('en');
    expect(useLocaleStore.getState().locale).toBe('en');
    expect(SecureStore.setItemAsync).toHaveBeenCalledWith('cos_locale', 'en');
  });

  it('hydrate restores a persisted locale', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('en');
    await useLocaleStore.getState().hydrate();
    expect(useLocaleStore.getState().locale).toBe('en');
  });

  it('hydrate keeps the default when nothing is stored', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue(null);
    await useLocaleStore.getState().hydrate();
    expect(useLocaleStore.getState().locale).toBe('th');
  });

  it('hydrate ignores an unsupported stored value', async () => {
    (SecureStore.getItemAsync as jest.Mock).mockResolvedValue('fr');
    await useLocaleStore.getState().hydrate();
    expect(useLocaleStore.getState().locale).toBe('th');
  });
});
