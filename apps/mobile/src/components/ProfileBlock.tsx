// ProfileBlock — THE PROJECT'S STANDARD FOR SHOWING WHO IS SIGNED IN (§32.7 "Drawer Profile Block",
// product-owner decision 2026-09-08).
//
// AVATAR · NAME · POSITION · ID, in that order and no other. The STATUS line below it is the
// caller's, because the two surfaces state different things there — the drawer says whether a second
// factor is enrolled, Account Settings says what the sync queue is doing — and both are passed in
// as children rather than branched on here.
//
// THE ORDER IS THE SPECIFICATION, NOT AN ACCIDENT OF LAYOUT. It descends by how often a line is
// read: a name identifies at a glance, a position gives that name meaning, an id is looked up
// perhaps twice a year. A reordered block renders perfectly — nothing throws and no query fails —
// so the sequence is its own only witness, which is why `NavigationDrawer.spec.tsx` pins it.
//
// ── WHY IT IS A COMPONENT AS OF 2026-09-10 ─────────────────────────────────────────────────────
//
// It headed one surface until that day. The CRM account-settings drawing opens on a profile header,
// and the standard is what such a header IS, so `<AccountSettings />` grew the same card — and the
// two copies were immediately 18 duplicated lines that the jscpd gate caught on the same run.
//
// That gate was right for a reason bigger than the duplication. The rule above says there is "no
// second SHAPE anywhere in the app"; two hand-maintained copies of one shape is exactly how a second
// shape appears, one prop at a time, and nothing would have failed when it did. Now there is one.
//
// NO ROLE TAG. The name line carried the role enum as a chip until 2026-09-08 and it was removed:
// the position line directly below already says what this person does, in the words a person uses,
// and the enum said it again in the words the system uses. The drawings still show the chip; this is
// a COMPOSITION ruling and ADR-085 gives it to the implementation.
//
// A NULL POSITION DRAWS NOTHING — no placeholder, no dash, no role. Null is the ordinary case: no
// route sets a position, so it arrives by seed or HR import, and an app running against a deployment
// older than migration `20260908000001` receives no such key at all. Both render the same way.
//
// THEME. The drawer's panel is pinned dark; Account Settings follows the user's theme. `variant`
// picks which palette the block's own type takes, so neither caller has to restyle it.

import { View, Text, StyleSheet } from 'react-native';
import { Avatar } from './Avatar';
import { shortId } from '../lib/shortId';
import { darkColors, fontFamily, spacing, typography } from '../theme/tokens';
import { usePalette } from '../theme/usePalette';

export function ProfileBlock({
  displayName,
  /** Pre-translated fallback for a session with no display name (QM-3). */
  fallbackName,
  /** `platform.users.position` (ADR-101). Null and empty both draw nothing. */
  position,
  /** Pre-translated "User ID" label (QM-3). */
  idLabel,
  /** `workforce.workers.employee_code`, or null — the short UUID stands in. */
  employeeCode,
  userId,
  /** `drawer` for the pinned-dark panel, `screen` to follow the user's theme. */
  variant,
  /** The status line, which differs per surface. Rendered directly below the block. */
  children,
  testIDPrefix,
}: {
  displayName: string | null | undefined;
  fallbackName: string;
  position: string | null | undefined;
  idLabel: string;
  employeeCode: string | null | undefined;
  userId: string | null | undefined;
  variant: 'drawer' | 'screen';
  children?: React.ReactNode;
  /** Prefixes the two testIDs — `drawer` gives `drawer-job-title` / `drawer-user-id`. */
  testIDPrefix: string;
}): React.JSX.Element {
  const p = usePalette();
  const ink = variant === 'drawer' ? darkColors.text : p.text;
  const muted = variant === 'drawer' ? darkColors.muted : p.muted;
  return (
    <>
      <View style={styles.row}>
        <Avatar variant={variant === 'drawer' ? 'dark' : 'light'} />
        <View style={styles.text}>
          <Text style={[styles.name, { color: ink }]} numberOfLines={1}>
            {displayName ?? fallbackName}
          </Text>
          {position == null || position === '' ? null : (
            <Text
              testID={`${testIDPrefix}-job-title`}
              style={[styles.position, { color: muted }]}
              numberOfLines={1}
            >
              {position}
            </Text>
          )}
          {/* MONOSPACED, as the mockups set it: an id is read character by character, and a
              proportional face makes 0/O and 1/l ambiguous exactly there. The code is REAL where
              there is one; office roles have no worker record and legitimately have none, so those
              fall back to a short form of the UUID (PO 2026-08-09). A display aid, never a key. */}
          <Text
            testID={`${testIDPrefix}-user-id`}
            style={[styles.id, { color: muted }]}
            numberOfLines={1}
          >
            {idLabel}: {employeeCode ?? shortId(userId)}
          </Text>
        </View>
      </View>
      {children}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1, gap: 2 },
  name: { flexShrink: 1, fontFamily: fontFamily.semibold, fontSize: typography.body.fontSize },
  position: { fontFamily: fontFamily.regular, fontSize: 11 },
  id: { fontFamily: 'monospace', fontSize: typography.caption.fontSize },
});
