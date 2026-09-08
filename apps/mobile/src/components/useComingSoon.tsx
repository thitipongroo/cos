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
//
// IT LIVES IN `components/` AND IS NAMED `.tsx`, WITH NO JSX IN IT. That is deliberate filing, not
// an accident. `src/lib/**` is pure logic measured by the node-environment suite at 100% lines, and
// a hook that calls `Alert.alert` cannot be rendered there — it was written into `lib/` on
// 2026-09-08 and CI caught it the same day at 99.53%. The render suite measures `src/components/
// **/*.tsx` and every screen's spec already presses a control that calls this, so here it is
// covered by the tests that actually exercise it. A `.ts` file in this directory would be measured
// by neither suite, which is the shape of dodging a threshold rather than meeting it.

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
