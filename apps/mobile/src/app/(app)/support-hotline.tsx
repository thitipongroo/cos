// IT Support Hotline — POST-AUTH route (mockup/mobile/01_authen/05_get_help/02_hotline_details).
//
// The twin of `app/(auth)/support-hotline.tsx`, and it exists for the reason every such pair in this
// app exists: AuthGate in `app/_layout.tsx` redirects an authenticated user out of the `(auth)` group
// (`isAuthenticated && inAuthGroup → /(app)/home`), so a signed-in push to the pre-auth route lands
// on Home. Same answer as `app/(app)/privacy-policy.tsx` and `app/(app)/support.tsx`.
//
// NO APP BAR AND NO PAGE TITLE OF ITS OWN — <TopBar /> supplies the brand and the "<" back control,
// and `Breadcrumb.tsx` registers this path, which is what makes it a child screen (§32.7 "a screen
// is named ONCE"). This is why it has less chrome than its pre-auth twin rather than more.
//
// It follows the user's theme; §32.7 pins only the pre-auth surfaces, which this is not.
//
// NOTHING IS ADDED BY SIGNING IN — and unlike the Support Centre pair, that is the whole of it here.
// The Support Centre's post-auth route adds identity, active project and diagnostics because a
// support CALL asks for them. This screen is the number, the hours and the checklist: none of the
// three resolves differently for a signed-in caller today, because `GET /api/v1/support/desk` is not
// written, so both routes render the same document.
//
// WHAT WOULD CHANGE THAT is already in the schema and named in `lib/mockupFigures.ts`:
// `tenant_support_desks` is the per-tenant override that only a signed-in caller can be scoped to
// (ADR-093 §1), so once the endpoint exists this route reads a merged desk and the pre-auth one
// reads the platform default alone.

import { View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SupportHotlineDocument } from '../../components/SupportHotlineDocument';
import { usePalette } from '../../theme/usePalette';
import { spacing } from '../../theme/tokens';

export default function SupportHotlineScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const palette = usePalette();

  return (
    <View style={{ flex: 1, backgroundColor: palette.bg }}>
      <SupportHotlineDocument palette={palette} paddingBottom={insets.bottom + spacing.xl} />
    </View>
  );
}
