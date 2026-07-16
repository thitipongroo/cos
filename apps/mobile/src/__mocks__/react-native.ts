// Jest mock for 'react-native' — only the non-UI APIs used by unit-tested modules
// (src/i18n/direction.ts reads I18nManager.isRTL; src/lib/deviceTrust.ts reads Platform). UI
// components are covered by Detox.

export const I18nManager = {
  isRTL: false,
};

export const Platform: { OS: string; constants?: { Model?: string } } = {
  OS: 'android',
  constants: { Model: 'Test Device' },
};
