// E2E-only route that absorbs the `cos://e2e/network?online=…` deep link.
//
// Detox toggles connectivity by opening that URL. expo-router treats the URL as a route and navigates
// to it; without this screen it lands on "Unmatched Route", wiping the screen under test. The network
// override itself is applied by the root layout's Linking listener (see app/_layout.tsx); this screen
// just renders nothing and immediately returns to the previous screen so the toggle is invisible.

import { useEffect } from 'react';
import { router } from 'expo-router';
import { getLastAppPath } from '../../lib/e2e/lastRoute';

export default function E2ENetwork() {
  useEffect(() => {
    // Return to the exact screen the test was on (e.g. the inspections tab), not just the default home
    // tab — opening this deep link resets navigation, so router.back() is unreliable here.
    router.replace(getLastAppPath() as never);
  }, []);
  return null;
}
