// ProfileBlock — THE PROJECT'S STANDARD FOR SHOWING WHO IS SIGNED IN (§32.7 "Drawer Profile Block",
// product-owner decision 2026-09-08).
//
// AVATAR · NAME · POSITION · ID, in that order and no other. No status line: the drawer's went on
// 2026-09-11, and the `children` slot that carried Account Settings' sync row went with that screen's
// head on 2026-09-14.
//
// THE ORDER IS THE SPECIFICATION, NOT AN ACCIDENT OF LAYOUT. It descends by how often a line is
// read: a name identifies at a glance, a position gives that name meaning, an id is looked up
// perhaps twice a year. A reordered block renders perfectly — nothing throws and no query fails —
// so the sequence is its own only witness, which is why `NavigationDrawer.spec.tsx` pins it.
//
// ── WHY IT IS A COMPONENT, WITH ONE CALLER ─────────────────────────────────────────────────────
//
// It was extracted on 2026-09-10, when `<AccountSettings />` grew a profile head from the CRM
// account-settings drawing and the two copies were 18 duplicated lines the jscpd gate caught on the
// same run. That head was REMOVED on 2026-09-14 (product-owner decision — the Stitch screen that
// replaced the drawing has none), leaving the navigation drawer as the only caller.
//
// It stays a component anyway. The rule above says there is "no second SHAPE anywhere in the app",
// and the next surface that wants to say who is signed in should reach for this rather than grow a
// copy. What went with the second caller is what only it used: the `screen` variant, which followed
// the user's theme, and the `children` slot its sync row came through. A branch kept for nobody is
// a branch nobody tests — the same reasoning that removed `ReadOnlyField`'s `note` on 2026-09-13.
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
// THEME. Pinned dark, because the drawer's panel is. A caller on a themed surface would bring the
// `variant` back, and would bring a test for it with it.

import { View, Text, StyleSheet } from 'react-native';
import { Avatar } from './Avatar';
import { shortId } from '../lib/shortId';
import { darkColors, fontFamily, spacing, typography } from '../theme/tokens';

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
  testIDPrefix,
  trailingReserve,
}: {
  displayName: string | null | undefined;
  fallbackName: string;
  position: string | null | undefined;
  idLabel: string;
  employeeCode: string | null | undefined;
  userId: string | null | undefined;
  /** Prefixes the two testIDs — `drawer` gives `drawer-job-title` / `drawer-user-id`. */
  testIDPrefix: string;
  /**
   * Width to keep clear on the right of the PROSE lines, for a control the caller draws over the
   * block — the drawer's chevron is the only one (added 2026-09-11).
   *
   * IT DOES NOT APPLY TO THE ID LINE, and that is the whole point of the prop rather than padding on
   * the caller's card. Reserving the column on the card truncated the id to `User ID: 061A6A…`,
   * measured on `02-shared/03-navigation-drawer/01-site-engineer.png`: the id is 17 monospace
   * characters and needs 342 of the 372 px the text column has, so it cannot give up 105 px. A name
   * or a job title losing its tail to `…` is legible; an id losing its tail is a different id.
   *
   * Vertically the chevron only ever reaches the prose: it is centred on the block, so with a
   * position line it sits beside that line, and without one it sits between the name and the id.
   */
  trailingReserve?: number;
}): React.JSX.Element {
  const ink = darkColors.text;
  const muted = darkColors.muted;
  return (
    <View style={styles.row}>
      <Avatar variant="dark" />
      <View style={styles.text}>
        <Text
          style={[styles.name, { color: ink }, { paddingRight: trailingReserve ?? 0 }]}
          numberOfLines={1}
        >
          {displayName ?? fallbackName}
        </Text>
        {position == null || position === '' ? null : (
          <Text
            testID={`${testIDPrefix}-job-title`}
            style={[styles.position, { color: muted }, { paddingRight: trailingReserve ?? 0 }]}
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
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  text: { flex: 1, gap: 2 },
  name: { flexShrink: 1, fontFamily: fontFamily.semibold, fontSize: typography.body.fontSize },
  position: { fontFamily: fontFamily.regular, fontSize: 11 },
  id: { fontFamily: 'monospace', fontSize: typography.caption.fontSize },
});
