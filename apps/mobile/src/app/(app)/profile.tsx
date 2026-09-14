// Profile — the signed-in user's own record, for every role.
//
// SOURCE DRAWING: stitch/screens/7367a77950f24c7e877c97aafc124350, "แก้ไขข้อมูลโปรไฟล์ - Site
// Engineer (Edit Profile)". Despite its name it is EVERY role's screen: the fields it draws are on
// `platform.users` for all twelve, and a per-role profile would be twelve screens to keep in step —
// the same argument the header of <AccountSettings /> makes about settings.
//
// ── IT READS. IT DOES NOT EDIT (product-owner decision E5, 2026-09-13) ─────────────────────────
//
// The drawing is an EDIT form: three text inputs, a SAVE PROFILE button and a CANCEL. Neither field
// this screen keeps can be edited by anyone through this product:
//
//   ชื่อ-นามสกุล    `platform.users.display_name`. No self-service write exists — `users/me` carries
//                   `GET` and `PATCH me/photo`, and §14's user-management writes are all
//                   @Roles(TENANT_ADMIN) and address SOMEBODY ELSE by path parameter.
//   เบอร์โทรศัพท์   `platform.users.phone_number` — THE PATH A LOGIN IDENTIFIER (E6). §5.4.4: an
//                   account carries exactly one identifier for its lifetime, and moving a person
//                   between paths means provisioning a new account. A field that edited this would
//                   be a field that could lock someone out of their own account.
//
// A SAVE button over fields that nothing writes is the drawn control this project keeps refusing to
// ship — the same treatment START SCAN and Change Secure PIN get.
//
// ── STRIPPED ON 2026-09-13, AT THE PRODUCT OWNER'S REQUEST ────────────────────────────────────
//
// Three things left the screen the day it was built, after they were seen in a capture. All three
// reverse what the plan of that morning approved, and two depart from the drawing — recorded here
// because ADR-085 asks a deviation to carry its reason, and "the drawing draws it" was the reason
// each of them was there.
//
//   THE NOTE UNDER EVERY FIELD. Three lines: who could change the name, why the employee code is
//     fixed (`*ไม่สามารถแก้ไขรหัสพนักงานได้`, printed verbatim from the drawing) and why the phone
//     number is (§5.4.4 / E6, said to the user in words). Every one of those facts is still true —
//     the screen has stopped stating them. How much a read-only record should explain itself is a
//     product judgement, and it is the product owner's.
//   THE `EMPLOYEE ID` FIELD, which the drawing draws. **No information left the product**, and that
//     was checked rather than assumed: `<ProfileBlock />` prints `workforce.workers.employee_code`
//     on the navigation drawer — `{idLabel}: {employeeCode ?? shortId(userId)}` — the surface this
//     screen is opened from. (It was on the Account Settings head too, until that head was removed
//     on 2026-09-14.) `getMe` is no longer read for it here either; see the state below.
//   THE CLOSING "These details come from your account record" LINE. What it bought was the second
//     half of "say who can do it rather than showing a dead control". The FIRST half stands — there
//     is still no SAVE button — but the screen no longer names who to ask.
//
// THE PHOTO IS THE EXCEPTION, and it is a real one. `แก้ไขรูปภาพ` picks an image, uploads it to the
// File Service and points `platform.users.photo_url` at the permanent image URL (ADR-105) — a URL
// that had to be built for this, because the only one that service could previously issue expired
// after an hour. It saves on pick; there is no SAVE button for one control.
//
// ── WHAT THE DRAWING ASKS FOR AND DOES NOT GET ────────────────────────────────────────────────
//
//   `SAVE PROFILE` / `CANCEL` — nothing to save. See above.
//   A HEADSHOT OF A WORKER IN A HARD HAT — §32.7:622 prohibits hard-hat imagery, and it was an
//     externally hosted image. <Avatar /> refuses it for the same reason and has since it was
//     written; this screen shows the account's own photo, or initials.
//   `Alex Rivers` / `Supervisor - Site A` / `+66 81 234 5678` — every one of these is REAL here:
//     display_name, position (ADR-101, null draws nothing) and phone_number. `SE-0942` is not: the
//     EMPLOYEE ID field it belonged to was removed on 2026-09-13, see above.
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
import { View, Text, Image, Pressable, Alert, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { formatNationalPhone } from '@cos/ui-logic';
import { getMe, uploadMyPhoto } from '../../api/users';
import { fileImageSource } from '../../lib/fileImageSource';
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
 * It keeps the caption, the leading glyph and the bordered box, because those are what make it
 * legible as one fact. What it drops is the caret and the focus ring: a box that looks editable and
 * is not is worse than a box that never claimed to be.
 *
 * NO EXPLANATORY NOTE. It carried one until 2026-09-13 — one line under each box saying who could
 * change the value and why it was fixed. The product owner removed all three. The facts have not
 * changed; the screen has simply stopped stating them, which is a judgement about how much a
 * read-only record should explain itself and is the product owner's to make.
 *
 * `value` null or empty draws the EMPTY WORD the caller passes rather than a blank box — a Path B
 * account with no phone number is information ("not set"), and a gap is not.
 */
function ReadOnlyField({
  testID,
  icon,
  label,
  value,
  empty,
  styles,
  p,
}: {
  testID: string;
  icon: IconName;
  label: string;
  value: string | null | undefined;
  /** Pre-translated stand-in for a value the account genuinely does not have (QM-3). */
  empty: string;
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
  // `employee_code` is NOT read here any more. It left with the EMPLOYEE ID field on 2026-09-13,
  // and fetching a value nothing renders is how a screen grows a field it does not have.
  // The code is still on screen elsewhere: <ProfileBlock /> prints it on the navigation drawer, so
  // removing the field cost the product no information.
  const [me, setMe] = useState<{
    photoUrl: string | null;
    position: string | null;
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

  const [uploading, setUploading] = useState(false);

  const showPhoto = me?.photoUrl != null && me.photoUrl !== '' && !photoFailed;

  /**
   * แก้ไขรูปภาพ — pick an image, upload it, point the account at it.
   *
   * THE ONE THING ON THIS SCREEN A USER CAN CHANGE (product-owner decision E5: read-only except the
   * photo). Everything else here is somebody else's to write.
   *
   * `canceled` is the ordinary outcome, not an error — a user who opens the library and thinks
   * better of it gets silence, never a dialog.
   */
  const onChangePhoto = async (): Promise<void> => {
    if (uploading) return;
    // The library, not the camera. `expo-image-picker` offers the OS's own picker, which already
    // has a "take a photo" affordance on both platforms, so this is the door to both without this
    // screen having to draw a chooser of its own.
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      // A square crop, because every surface that draws this renders it in a circle — cropping at
      // pick time is the only point where the user can decide WHICH square.
      allowsEditing: true,
      aspect: [1, 1],
      // The image route caps at the File Service's 20 MB for an image, and an avatar is drawn at
      // 96px. Re-encoding at 0.7 keeps a face legible at any size this app shows it and keeps a
      // modern phone's 8 MB capture from being uploaded to be displayed as a thumbnail.
      quality: 0.7,
    });
    if (picked.canceled) return;
    const uri = picked.assets[0]?.uri;
    if (uri == null) return;

    setUploading(true);
    try {
      const { photo_url } = await uploadMyPhoto(uri);
      setMe((was) => (was === null ? was : { ...was, photoUrl: photo_url }));
      // A NEW UPLOAD IS PENDING_SCAN FOR A MOMENT and the image route refuses anything not CLEAN
      // (409), so the fresh URL may 404/409 for a beat. Clearing the failure flag lets the <Image>
      // try again on the next render rather than staying stuck on the initials.
      setPhotoFailed(false);
    } catch {
      Alert.alert(t('profile.view.photoFailedTitle'), t('profile.view.photoFailedBody'));
    } finally {
      setUploading(false);
    }
  };

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
            // THE TOKEN RIDES ALONG (ADR-105). The stored URL is the File Service's permanent image
            // route, which authenticates per request rather than carrying a signature that expires —
            // so a bare `{ uri }` here would be a 401 and a blank face. `fileImageSource` attaches
            // the header only for this deployment's own API, never for an arbitrary stored string.
            source={fileImageSource(me!.photoUrl)!}
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
        <Pressable
          testID="profile-change-photo"
          onPress={() => void onChangePhoto()}
          disabled={uploading}
          accessibilityRole="button"
          accessibilityLabel={t('profile.view.changePhoto')}
          accessibilityState={{ disabled: uploading, busy: uploading }}
          style={styles.changePhoto}
        >
          <Text style={[styles.changePhotoText, uploading && styles.changePhotoBusy]}>
            {uploading ? t('profile.view.photoUploading') : t('profile.view.changePhoto')}
          </Text>
        </Pressable>
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
          styles={styles}
          p={p}
        />
        <ReadOnlyField
          testID="profile-field-phone"
          icon="phone-iphone"
          label={t('profile.view.phone')}
          // FORMATTED PER §20.5 — `+66811000009` reads `(+66) 081-100-0009`, the number a Thai
          // reader recognises from their own handset, over the dial code that says which country
          // the platform filed it under. The same call `transparency-identity.tsx` and
          // `user-profile.tsx` already make; this screen was the one printing raw E.164.
          //
          // IT REFUSES RATHER THAN GUESSES, and that is why nothing is written here. §20.5 groups
          // only `+66`, so a Singapore number — eight national digits and NO trunk '0' — comes back
          // UNCHANGED instead of being forced into a ten-digit mask. A number rendered wrong is
          // worse than one rendered plainly: the reader cannot tell a regrouping from a typo in
          // their own record.
          //
          // Null on a Path B (email) account, which is not a gap either — that account signs in
          // with an email and never had a phone number on it.
          value={me?.phoneNumber == null ? null : formatNationalPhone(me.phoneNumber)}
          empty={t('profile.view.noPhone')}
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
          // A signed-in session always has a user id, so this stand-in is unreachable in practice —
          // it exists because the prop is required, and `noPhone` is reused rather than adding a
          // seventh key for a string nobody can see.
          empty={t('profile.view.noPhone')}
          styles={styles}
          p={p}
        />
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
    avatarBlock: { alignItems: 'center', gap: spacing.xs },
    // The drawing's uppercase blue caption under the avatar. A 44px target in both directions
    // without a border or a fill, because it sits on the page rather than inside a control.
    changePhoto: {
      minHeight: touchTarget.iconButton,
      minWidth: touchTarget.iconButton,
      paddingHorizontal: spacing.sm,
      alignItems: 'center',
      justifyContent: 'center',
    },
    changePhotoText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: p.primary,
    },
    changePhotoBusy: { color: p.muted },
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
  });
