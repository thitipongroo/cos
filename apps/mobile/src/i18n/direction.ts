// RTL support (QM-3) — layout direction comes from React Native's I18nManager.

import { I18nManager } from 'react-native';

export const isRTL: boolean = I18nManager.isRTL;
