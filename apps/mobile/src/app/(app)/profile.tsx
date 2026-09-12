// Profile — the signed-in user's own record, for every role.
//
// SOURCE DRAWING: stitch/screens/7367a77950f24c7e877c97aafc124350, "แก้ไขข้อมูลโปรไฟล์ - Site
// Engineer (Edit Profile)". Despite its name it is EVERY role's screen: the fields it draws are on
// `platform.users` for all twelve, and a per-role profile would be twelve screens to keep in step —
// the same argument the header of <AccountSettings /> makes about settings.
//
// ── IT READS. IT DOES NOT EDIT (product-owner decision E5, 2026-09-13) ─────────────────────────
//
// The drawing is an EDIT form: three text inputs, a SAVE PROFILE button and a CANCEL. Two of the
// three fields cannot be edited by anyone through this product, and the third has no route:
//
//   ชื่อ-นามสกุล    `platform.users.display_name`. No self-service write exists — `users/me` carries
//                   `GET` and `PATCH me/photo`, and §14's user-management writes are all
//                   @Roles(TENANT_ADMIN) and address SOMEBODY ELSE by path parameter.
//   รหัสพนักงาน     `workforce.workers.employee_code` — the EMPLOYER's identifier for the person,
//                   not the person's own. The drawing disables this input and says why in its own
//                   note, which this screen keeps.
//   เบอร์โทรศัพท์   `platform.users.phone_number` — THE PATH A LOGIN IDENTIFIER (E6). §5.4.4: an
//                   account carries exactly one identifier for its lifetime, and moving a person
//                   between paths means provisioning a new account. A field that edited this would
//                   be a field that could lock someone out of their own account.
//
// So the screen states who can change each thing rather than offering a control that cannot
// (§32.7 / ADR-085). A SAVE button over three fields that nothing writes is the drawn control this
// project keeps refusing to ship — the same treatment START SCAN and Change Secure PIN get.
//
// ── WHAT THE DRAWING ASKS FOR AND DOES NOT GET ────────────────────────────────────────────────
//
//   `SAVE PROFILE` / `CANCEL` — nothing to save. See above.
//   A HEADSHOT OF A WORKER IN A HARD HAT — §32.7:622 prohibits hard-hat imagery, and it was an
//     externally hosted image. <Avatar /> refuses it for the same reason and has since it was
//     written; this screen shows the account's own photo, or initials.
//   `Alex Rivers` / `Supervisor - Site A` / `SE-0942` / `+66 81 234 5678` — every one of these is
//     REAL here: display_name, position (ADR-101, null draws nothing), employee_code (null is the
//     common case — office roles have no worker record) and phone_number.
//   `SYNCED` + `ออนไลน์` AS TWO SEPARATE READINGS. This shell has one sync indicator and one
//     precedence (`useSyncPillView` — error > syncing > pending > synced); offline is not a fifth
//     state, it PRODUCES pending. Two indicators of one subject in one shell is what OfflineBanner
//     was deleted for, so the card carries the one state, in the drawing's accent-bar shape.
//   A SUPPRESSED BOTTOM NAV. The drawing's last line reads "BottomNavBar (Suppressed as per rules
//     for Transactional/Focused screens)" — and it gives its own reason: a transactional screen
//     hides the tabs so nobody wanders off mid-form and loses what they typed. THIS SCREEN IS NOT
//     TRANSACTIONAL. E5 made it read-only, so there is no half-finished input to protect, and the
//     rule the drawing invokes does not reach it. The bar stays, as it does on every other
//     post-auth screen (product-owner decision 2026-09-13, reversing plan item 3.6, which had
//     carried the drawing's line across without its reason).
//
// Palette-resolved — it follows the user's theme like every other post-auth screen.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, Image, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getMe } from '../../api/users';
import { initialsOf } from '../../lib/initials';
import { shortId } from '../../lib/shortId';
import { useAuthStore } from '../../store/authStore';
import { useSyncPillView } from '../../hooks/useSyncPillView';
import { useT } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, type Palette } from '../../theme/usePalette';

/** The drawing's 96px avatar (`w-24 h-24`). */
const AVATAR = 96;

type IconName = keyof typeof MaterialIcons.glyphMap;

/**
 * One read-only field — the drawing's input shape, without the input.
 *
 * It keeps the caption, the leading glyph, the bordered box and the note, because those are what
 * make it legible as one fact. What it drops is the caret and the focus ring: a box that looks
 * editable and is not is worse than a box that never claimed to be.
 *
 * `value` null or empty draws the EMPTY WORD the caller passes rather than a blank box — an absent
 * employee code is information ("no code issued"), and a gap is not.
 */
function ReadOnlyField({
  testID,
  icon,
  label,
  value,
  empty,
  note,
  styles,
  p,
}: {
  testID: string;
  icon: IconName;
  label: string;
  value: string | null | undefined;
  /** Pre-translated stand-in for a value the account genuinely does not have (QM-3). */
  empty: string;
  note?: string;
  styles: ReturnType<typeof makeStyles>;
  p: Palette;
}): React.JSX.Element {
  const shown = value != null && value.trim() !== '';
  return (
    <View testID={testID} style={styles.field}>
      <Text style={styles.fieldLabel}>{label}</Text>
      <View style={styles.fieldBox}>
        <MaterialIcons name={icon} size={20} color={p.muted} />
        <Text style={[styles.fieldValue, !shown && styles.fieldValueEmpty]} numberOfLines={1}>
          {shown ? value : empty}
        </Text>
      </View>
      {note ? <Text style={styles.fieldNote}>{note}</Text> : null}
    </View>
  );
}

export default function ProfileScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const displayName = useAuthStore((s) => s.displayName);
  const userId = useAuthStore((s) => s.userId);
  const sync = useSyncPillView();

  /**
   * The record itself. Null until `GET /users/me` answers, and null again if it fails — the screen
   * then falls back to the persisted session's name and the short UUID, exactly as the drawer does,
   * rather than showing a page of blanks.
   */
  const [me, setMe] = useState<{
    photoUrl: string | null;
    position: string | null;
    employeeCode: string | null;
    phoneNumber: string | null;
  } | null>(null);
  const [photoFailed, setPhotoFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((row) => {
        if (cancelled) return;
        setMe({
          photoUrl: row.photo_url,
          position: row.position ?? null,
          employeeCode: row.employee_code ?? null,
          phoneNumber: row.phone_number ?? null,
        });
      })
      .catch(() => {
        /* offline — the name comes from the persisted session and the id falls back to the UUID */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const showPhoto = me?.photoUrl != null && me.photoUrl !== '' && !photoFailed;

  return (
    <ScrollView
      testID="profile-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
    >
      {/* THE ONE SYNC STATE, in the drawing's accent-bar card. Colour and glyph come from
          `useSyncPillView`, which every other sync indicator in the app reads, so this screen cannot
          disagree with the top bar about what the queue is doing. */}
      <View
        testID="profile-sync-card"
        style={[styles.syncCard, { borderLeftColor: syncTone(p, sync.icon) }]}
      >
        <MaterialIcons name={sync.icon} size={18} color={syncTone(p, sync.icon)} />
        <Text style={[styles.syncText, { color: syncTone(p, sync.icon) }]} numberOfLines={1}>
          {sync.label}
        </Text>
      </View>

      <View testID="profile-avatar-block" style={styles.avatarBlock}>
        {showPhoto ? (
          <Image
            testID="profile-photo"
            source={{ uri: me!.photoUrl! }}
            style={styles.avatar}
            onError={() => setPhotoFailed(true)}
            accessibilityRole="image"
            accessibilityLabel={displayName ?? undefined}
          />
        ) : (
          // Initials, then a glyph — the same fallback ladder <Avatar /> walks, and for the same
          // reason: the drawing's stock headshot is not this person and §32.7 prohibits it anyway.
          <View testID="profile-initials" style={[styles.avatar, styles.avatarFallback]}>
            {initialsOf(displayName) ? (
              <Text style={styles.avatarInitials}>{initialsOf(displayName)}</Text>
            ) : (
              <MaterialIcons name="person" size={44} color={p.muted} />
            )}
          </View>
        )}
      </View>

      <View style={styles.identity}>
        <Text testID="profile-name" style={styles.name} numberOfLines={1}>
          {displayName ?? t('drawer.member')}
        </Text>
        {/* ADR-101: a null position draws NOTHING — no placeholder, no dash, no role enum. Null is
            the ordinary case, because no route sets one. */}
        {me?.position ? (
          <Text testID="profile-position" style={styles.position} numberOfLines={1}>
            {me.position}
          </Text>
        ) : null}
        {/* The drawing's `System Verified` chip. It says the ACCOUNT exists in the platform's own
            directory, which is true of every signed-in session by construction — and that is all it
            is allowed to mean here. It is NOT a claim about identity documents, a background check
            or a second factor; the second factor has its own row in Account Settings, which reports
            `platform.users.mfa_enabled` and says "not enrolled" when it is false. */}
        <View testID="profile-verified" style={styles.verifiedChip}>
          <MaterialIcons name="verified" size={14} color={p.success} />
          <Text style={styles.verifiedText}>{t('profile.view.systemVerified')}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <ReadOnlyField
          testID="profile-field-name"
          icon="person"
          label={t('profile.view.fullName')}
          value={displayName}
          empty={t('drawer.member')}
          note={t('profile.view.nameNote')}
          styles={styles}
          p={p}
        />
        <ReadOnlyField
          testID="profile-field-employee-code"
          icon="badge"
          label={t('profile.view.employeeId')}
          // NULL IS THE COMMON CASE, not an edge case: `workforce.workers.user_id` is nullable and
          // only site workers have a worker record. Office roles legitimately have no code, and
          // that must read as "no code issued" rather than as missing data.
          value={me?.employeeCode}
          empty={t('profile.view.noEmployeeId')}
          note={t('profile.view.employeeIdNote')}
          styles={styles}
          p={p}
        />
        <ReadOnlyField
          testID="profile-field-phone"
          icon="phone-iphone"
          label={t('profile.view.phone')}
          // Null on a Path B (email) account, which is not a gap either — that account signs in
          // with an email and never had a phone number on it.
          value={me?.phoneNumber}
          empty={t('profile.view.noPhone')}
          note={t('profile.view.phoneNote')}
          styles={styles}
          p={p}
        />
        <ReadOnlyField
          testID="profile-field-user-id"
          icon="fingerprint"
          label={t('profile.main.userId')}
          // Not on the drawing. It is on the drawer's standard block (§32.7 AVATAR · NAME ·
          // POSITION · ID) and it is the one line a support desk asks for, so a profile screen that
          // omitted it would send the user back to the drawer to read it.
          value={shortId(userId)}
          empty={t('profile.view.noPhone')}
          styles={styles}
          p={p}
        />
      </View>

      {/* WHO CAN CHANGE THIS, instead of a SAVE button that writes nothing. The drawing ends with
          SAVE PROFILE and CANCEL; this screen ends by naming the route a correction actually takes
          (§32.7 — a screen says what is possible, not what would be convenient). */}
      <View testID="profile-change-note" style={styles.noteCard}>
        <MaterialIcons name="info" size={16} color={p.muted} />
        <Text style={styles.noteText}>{t('profile.view.changeNote')}</Text>
      </View>
    </ScrollView>
  );
}

/**
 * The palette tone for a sync state, keyed on the glyph the state already chose.
 *
 * Same mapping, and the same reason, as <AccountSettings />: `useSyncPillView` carries the
 * dark-shell colours because its first caller was the pinned-dark top bar, and #10B981 measures
 * 2.5:1 on a white card — under the 4.5:1 §20.8 gate for text. The STATE comes from the hook; only
 * the ink is decided here, so the precedence still exists in exactly one place.
 */
function syncTone(p: Palette, icon: string): string {
  if (icon === 'sync-problem') return p.danger;
  if (icon === 'sync' || icon === 'cloud-upload') return p.warning;
  return p.success;
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    page: { padding: spacing.md, paddingBottom: spacing.xl, gap: spacing.md },
    syncCard: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      borderLeftWidth: 4,
      padding: spacing.sm,
    },
    syncText: { fontSize: typography.label.fontSize, fontFamily: fontFamily.semibold },
    avatarBlock: { alignItems: 'center' },
    avatar: {
      width: AVATAR,
      height: AVATAR,
      // Half the width — a circle, which is off the radius scale entirely (design-tokens.md).
      borderRadius: AVATAR / 2,
      borderWidth: 2,
      borderColor: p.border,
    },
    avatarFallback: {
      backgroundColor: p.surfaceBright,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarInitials: {
      fontSize: typography.hero.fontSize,
      fontFamily: fontFamily.bold,
      color: p.text,
    },
    identity: { alignItems: 'center', gap: spacing.xs / 2 },
    name: { fontSize: typography.title.fontSize, fontFamily: fontFamily.semibold, color: p.text },
    position: {
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },
    verifiedChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      marginTop: spacing.xs / 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl, // every status pill takes xl — design-tokens.md, one token
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceBright,
    },
    verifiedText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.medium,
      color: p.text,
    },
    card: {
      backgroundColor: p.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.md,
      gap: spacing.md,
    },
    field: { gap: spacing.xs / 2 },
    fieldLabel: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: p.muted,
    },
    fieldBox: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      // `formInput` even though nothing here is an input: the row must stay legible at the size the
      // drawing gives it, and shrinking a read-only field would make the card look like a summary
      // of the form rather than the record itself.
      minHeight: touchTarget.formInput,
      borderRadius: radius.lg, // inputs — §2.5
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceSunk,
      paddingHorizontal: spacing.sm,
    },
    fieldValue: {
      flex: 1,
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.regular,
      color: p.text,
    },
    fieldValueEmpty: { color: p.muted, fontFamily: fontFamily.regular },
    fieldNote: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },
    noteCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      paddingHorizontal: spacing.xs,
    },
    noteText: {
      flex: 1,
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.regular,
      lineHeight: typography.label.lineHeight,
      color: p.muted,
    },
  });
