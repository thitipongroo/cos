// Jest mock for 'react-native' — only the non-UI APIs used by unit-tested modules
// (src/i18n/direction.ts reads I18nManager.isRTL). UI components are covered by Detox.

export const I18nManager = {
  isRTL: false,
};
