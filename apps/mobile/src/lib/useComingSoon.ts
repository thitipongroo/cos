// The "coming soon" dialog, defined once.
//
// The product owner's convention since 2026-09-04 is that a control the drawings show but the
// platform cannot perform is DRAWN and says so when pressed, rather than being left out of the
// screen or wired to a button that fails. Six screens had written the same four-line `useCallback`
// for it — budget, invoices, payments, rfqs, orders and the procurement dashboard — and jscpd was
// counting it, so it lives here.
//
// The KEY, not the words. The caller passes the i18n key of the thing it cannot do, and the body is
// always `more.comingSoon`; that is what keeps six screens saying it the same way.

import { useCallback } from 'react';
import { Alert } from 'react-native';
import { useT } from '../i18n';

export function useComingSoon(): (labelKey: string) => void {
  const t = useT();
  return useCallback(
    (labelKey: string) => {
      Alert.alert(t(labelKey), t('more.comingSoon'));
    },
    [t],
  );
}
