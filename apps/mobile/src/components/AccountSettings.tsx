// Account settings — security, preferences, app info (all roles; master 3100).
//
// Rendered by `app/(app)/account-settings.tsx`, pushed from the navigation drawer's Settings row.
// It lived INSIDE the drawer for one build — the first shape of the 2026-08-09 "the drawer IS the
// profile" ruling — until the panel was carrying both navigation and settings with ~900px below the
// fold. Identity lives in the drawer and this screen is reached from it; `/profile` returned on
// 2026-09-13 as the READ-ONLY record the drawer's own profile card opens (spec §32.7).
//
// LAYOUT IS mockup/mobile/05_site_worker/05_profile/01_sw_account_settings: an uppercase section label
// over a bordered card, and inside it hairline-separated rows that all share one anatomy —
// leading icon, label, then either a value, a value + chevron, or a switch. That regularity is the
// point of the drawing, so <Row /> below is the only row this file knows how to draw.
//
// ── THREE GROUPS, AND A PROFILE HEAD (PO decision 2026-09-10) ──────────────────────────────────
//
// mockup/mobile/12_crm_manager/05_profile/01_account_settings regroups the same rows as ACCOUNT ·
// PREFERENCES · SYSTEM under a profile header carrying the sync state. That is what this screen is
// now, FOR EVERY ROLE — one component serves all twelve, and a per-role settings layout would be
// twelve screens to keep in step. `Security` and `About` are gone as group names: security is two
// rows of Account, and the build version is one row of System.
//
// NOTHING WAS DROPPED IN THE REGROUPING. Change Secure PIN, the theme switch and the version row
// are all still here — ADR-085 gives composition to the implementation, and it says in as many
// words that a drawing does not remove reviewed working capability.
//
// WHAT THE DRAWING ASKS FOR AND DOES NOT GET:
//
//   PERSONAL INFO row — omitted. The card directly above it IS the personal information it would
//     open, and a chevron onto the card six pixels above it is not a row. `/user-profile` is the
//     Tenant Admin looking at SOMEBODY ELSE, driven by params. Since 2026-09-13 the full record IS
//     a screen again — `/profile`, read-only — but it is entered from the DRAWER's profile card,
//     which is the one place identity lives; a second door one tap away would be the duplicate the
//     Privacy Policy row was moved to avoid.
//   "Last sync: 2 min ago" — not drawn. Nothing here records when the last flush finished; what
//     IS known is the current sync state, and that is what the head says instead, through the same
//     `useSyncPillView` precedence every other sync indicator in the app reads.
//   "2.4 GB" against Offline Data — replaced by the REAL on-disk size of the offline database
//     (`localDbSizeBytes()`, db/database.ts), shown against the §17.7 ceiling it is measured for.
//     The row REPORTS and does not manage: nothing in this app prunes that cache on request, and a
//     "Manage" chevron onto nothing would be the drawn control this project keeps refusing to ship.
//
// ── ONE SCREEN, AND ONE ROLE-CONDITIONAL BLOCK (PO decision 2026-09-10) ────────────────────────
//
// `mockup/mobile/role_viewer/05_profile/01_account_settings` groups the same rows differently again
// — Account Information · System Permissions · App Settings · Security · Security & Legal — one day
// after the CRM drawing set the grouping above. Escalated rather than followed: re-grouping a screen
// that serves all twelve roles to suit the twelfth would change it for the other eleven, and the
// header two paragraphs up is the argument against a per-role settings layout. The product owner
// chose to keep this screen and add the ONE block the Viewer drawing has that no other drawing does.
//
// SYSTEM PERMISSIONS renders only when the signed-in role is VIEWER. It is that role's drawing's own
// answer to a question only a read-only role asks — "what am I allowed to do here?" — and the three
// tiles it draws say READ ONLY, which is true of every grant §6.8 gives this role.
//
// WHAT THE VIEWER DRAWING ASKS FOR AND DOES NOT GET, beyond the grouping:
//   `ID: COS-8842-V` — already drawn, and REAL. <ProfileBlock /> prints the employee code, or the
//     short UUID where there is none. A formatted member id is not a column, and the line it would
//     have gone on is already occupied by one that is.
//   A `Viewer` ROLE CHIP beside the name — the profile block carried the role enum until 2026-09-08
//     and it was removed by decision: the position line says what the person does in a person's
//     words. §32.7 "Drawer Profile Block" states it, and this screen is its second surface.
//   A DISABLED Dark Mode switch with "Mandatory for field environments." — this app has a working
//     theme control on every role and ADR-085 says a drawing does not remove reviewed working
//     capability.
//   A "Security & Legal" GROUP with Privacy Policy and Terms of Service. The Privacy Policy is
//     already reachable post-auth from the navigation drawer, so a second entry point would be a
//     duplicate; the Terms of Use have no post-auth route at all (they live at
//     `app/(auth)/terms-of-use.tsx`), and adding one is a route, not a row — out of this round's
//     scope and reported rather than smuggled in.
//
// ── THE STITCH SCREEN, AND WHAT IT CHANGED (2026-09-13) ────────────────────────────────────────
//
// `stitch/screens/63c6dccafa734761a077835aabd70838` — "Account & Notification Settings - Site
// Engineer (Unified)". Despite the name it is EVERY ROLE's screen, by the same argument as the
// paragraph above: one component serves all twelve, and a per-role settings layout would be twelve
// screens to keep in step. It draws three groups — Application Settings · Notification Settings ·
// Security & Access — and this file now carries them in that order, with SYSTEM kept at the end.
//
// WHAT IT CHANGED:
//   Language and Theme became SEGMENTED controls. Both were misdrawn as something else before: the
//     language row showed the current language and a swap glyph, so the user had to infer that
//     tapping it meant "become the other one", and Theme was a "Dark" SWITCH, which makes light the
//     absence of a thing rather than the other of two. See <SegmentedControl />.
//   SECURITY & ACCESS is a new group. The MFA row and the biometric switch MOVED into it from
//     `Account`, which no longer exists as a group, and the Password row is new.
//   The biometric switch also moved OFF `/account-security`, where a second copy had been living.
//     One preference was settable in two places and stale in whichever you were not looking at.
//
// WHAT IT ASKS FOR AND DOES NOT GET (ADR-085 — style is the drawing's, composition is ours):
//   A THIRD THEME SEGMENT (`settings_brightness`, follow the system). `ThemeMode` is
//     `'dark' | 'light'`; there is no system mode in the store and adding one is a behaviour change,
//     not a restyle. PO decision E1, 2026-09-13: two modes, the drawing's shape.
//   A FIXED "SAVE CHANGES" FOOTER BAR. Every control here saves on change and always has — the bar
//     would be a button that does nothing, and worse, it would teach that nothing else took effect
//     until it was pressed. PO decision E4, 2026-09-13.
//   AN IN-CONTENT `Settings` H2. §32.7 names a screen once and the breadcrumb already reads
//     HOME › SETTINGS; `account-settings.tsx` says the same thing at the route.
//   32px-TALL SEGMENTS (`min-h-[32px]`). Under the 44px this project holds itself to (§32.7,
//     WCAG 2.2 AA), so the shape is followed and the height is not.
//   A `Push` NOTIFICATION CHANNEL and four topical switches with no event behind them — see
//     <NotificationSettings />, which owns that half of the screen.
//
// Palette-resolved, because it is a page now rather than the always-dark drawer panel.
//
// Offline-safe except two things, both of which report rather than pretend: the MFA row's target
// screen, and the Password row's request (which is not offline-queued — a reset link replayed hours
// later arrives already expired).

import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Switch, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { NotificationSettings } from './NotificationSettings';
import { ProfileBlock } from './ProfileBlock';
import { useThemeStore } from '../store/themeStore';
import { useBiometricStore } from '../store/biometricStore';
import { CosRole } from '@cos/types';
import { useAuthStore } from '../store/authStore';
import { useSyncPillView } from '../hooks/useSyncPillView';
import { getMe, requestMyPasswordResetEmail } from '../api/users';
import { SegmentedControl } from './SegmentedControl';
import { formatDate } from '../i18n';
import { localDbSizeBytes } from '../db/database';
import { MAX_LOCAL_DB_BYTES } from '../sync/localDbLimit';
import { formatBytes } from '../lib/formatBytes';
import { VIEWER_PERMISSION_TILES } from '../lib/mockupFigures';
import { useI18n } from '../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';
import { usePalette, type Palette } from '../theme/usePalette';

type IconName = keyof typeof MaterialIcons.glyphMap;

/**
 * Whether the MFA ENROLMENT SCREEN exists in this build.
 *
 * The row is drawn either way (mockup 05_profile, PO 2026-08-09) — hiding it left the SECURITY
 * section a single toggle and made a documented feature look absent. What the flag changes is where
 * tapping it goes: to the enrolment screen when the build has one, or to a plain "not available yet"
 * when it does not.
 */
const MFA_ENROLLMENT_ENABLED = process.env.EXPO_PUBLIC_FF_S1_AUTH_MFA_ENROLLMENT === '1';

/**
 * One settings row — the mockup's single row anatomy.
 *
 * `value` renders as trailing text, `onPress` adds the chevron and makes it a button, `toggle`
 * replaces both with a switch. A row is a button ONLY when it has somewhere to go, so a row with a
 * switch never announces as one to a screen reader.
 */
function Row({
  testID,
  icon,
  label,
  description,
  value,
  valueTone,
  onPress,
  trailingIcon = 'chevron-right',
  trailingTone,
  toggle,
  trailing,
  action,
}: {
  testID?: string;
  icon: IconName;
  label: string;
  /** A second line under the label. For explanations — a trailing `value` competes with the label
   *  for the same row and squeezes it to nothing when the text is a full sentence. */
  description?: string;
  value?: string;
  valueTone?: 'muted' | 'success';
  onPress?: () => void;
  trailingIcon?: IconName;
  /** Ink for `trailingIcon`. Default is the muted chevron grey; `success` is the drawing's green
   *  tick, which says the state is GOOD and not merely set. */
  trailingTone?: 'success';
  toggle?: { on: boolean; onChange: (next: boolean) => void; disabled?: boolean };
  /**
   * An arbitrary trailing control — a segmented control, a glyph. Takes the place of the value and
   * the chevron, and NEVER combines with `onPress`: a row whose trailing edge is itself a control
   * cannot also be one, or a tap near the edge does two different things depending on the pixel.
   */
  trailing?: React.ReactNode;
  /**
   * A trailing WORD that acts — the drawing's blue `Change` on the Password row.
   *
   * Distinct from `onPress` (which makes the whole row a button with a chevron): here the row
   * carries two lines of information and one verb, and the verb is what is pressed. The label still
   * names the action for a screen reader, so "Password, Change" is what is announced rather than a
   * bare "Change".
   */
  action?: { label: string; onPress: () => void; disabled?: boolean };
}) {
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const body = (
    <>
      <View style={styles.rowLead}>
        <MaterialIcons name={icon} size={22} color={p.accent} />
        <View style={styles.rowLabelBlock}>
          <Text style={styles.rowLabel} numberOfLines={2}>
            {label}
          </Text>
          {description ? (
            <Text style={styles.rowDescription} numberOfLines={2}>
              {description}
            </Text>
          ) : null}
        </View>
      </View>
      <View style={styles.rowTail}>
        {value ? (
          <Text
            style={[styles.rowValue, valueTone === 'success' && styles.rowValueSuccess]}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
        {trailing ?? null}
        {action ? (
          <Pressable
            testID={testID ? `${testID}-action` : undefined}
            onPress={action.onPress}
            disabled={action.disabled}
            accessibilityRole="button"
            accessibilityLabel={`${label}, ${action.label}`}
            accessibilityState={{ disabled: action.disabled === true }}
            style={styles.rowAction}
          >
            <Text style={[styles.rowActionText, action.disabled === true && styles.rowActionOff]}>
              {action.label}
            </Text>
          </Pressable>
        ) : null}
        {toggle ? (
          <Switch
            testID={testID ? `${testID}-switch` : undefined}
            value={toggle.on}
            onValueChange={toggle.onChange}
            disabled={toggle.disabled}
            accessibilityLabel={label}
            trackColor={{ true: p.primary, false: p.border }}
          />
        ) : onPress ? (
          <MaterialIcons
            name={trailingIcon}
            size={20}
            color={trailingTone === 'success' ? p.success : p.muted}
          />
        ) : null}
      </View>
    </>
  );

  // No divider between rows (PO 2026-08-09). The mockup does draw one, but at
  // `border-outline-variant/10` — ten percent opacity, which is invisible at this size; ours was a
  // full-strength hairline and read as a table. The card's own border does the grouping.
  const style = styles.row;

  return onPress ? (
    <Pressable
      testID={testID}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={style}
    >
      {body}
    </Pressable>
  ) : (
    <View testID={testID} style={style}>
      {body}
    </View>
  );
}

/**
 * The palette tone for a sync state, keyed on the glyph the state already chose.
 *
 * `useSyncPillView` hardcodes the dark-shell colours — it was written for the top bar, which is
 * pinned dark. This screen follows the user's theme, and `--cos-dark-success` #10B981 measures
 * 2.5:1 on a white card, well under the 4.5:1 §20.8 gate for text. So the state comes from the hook
 * and only the ink is decided here. The glyph is the key rather than a second copy of the
 * precedence, which is the whole reason that hook exists.
 */
function syncTone(p: Palette, icon: string): string {
  if (icon === 'sync-problem') return p.danger;
  if (icon === 'sync' || icon === 'cloud-upload') return p.warning;
  return p.success;
}

function Section({ label, children }: { label: string; children: React.ReactNode }) {
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  return (
    <View style={styles.section}>
      <Text style={styles.sectionLabel}>{label}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export function AccountSettings() {
  const { t, locale, setLocale } = useI18n();
  const p = usePalette();
  const styles = useMemo(() => makeStyles(p), [p]);
  const router = useRouter();
  const mode = useThemeStore((s) => s.mode);
  const setMode = useThemeStore((s) => s.setMode);
  const available = useBiometricStore((s) => s.available);
  const enabled = useBiometricStore((s) => s.enabled);
  const setEnabled = useBiometricStore((s) => s.setEnabled);
  const displayName = useAuthStore((s) => s.displayName);
  const userId = useAuthStore((s) => s.userId);
  const role = useAuthStore((s) => s.role);
  const sync = useSyncPillView();
  const [busy, setBusy] = useState(false);
  /** The device declined the last attempt to turn the lock ON — see the biometric row. */
  const [refused, setRefused] = useState(false);

  /**
   * The head's own fields, and the MFA row's state.
   *
   * `GET /users/me` is the same call the drawer makes for the same block — position, employee code
   * and whether a second factor is enrolled. A failure leaves it null, and then the head falls back
   * to the short UUID and the MFA row simply carries no state word rather than claiming one.
   */
  const [me, setMe] = useState<{
    employeeCode: string | null;
    mfaEnabled: boolean;
    position: string | null;
    /**
     * WHETHER THIS ACCOUNT HAS A PASSWORD AT ALL, which is what decides the Password row.
     *
     * `email` non-empty means Path B — an email plus a Keycloak password credential. A Path A
     * account holds a phone number and `email = ''` by design (§5.4.4, one identifier per account
     * for its lifetime) and its Keycloak credential is a random UUID rewritten on every OTP
     * exchange, so there is nothing its owner knows or could change. `GET /users/me` has always
     * returned both fields, so nothing new was needed on the wire to tell them apart (ADR-104).
     */
    hasPassword: boolean;
    passwordChangedAt: string | null;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    getMe()
      .then((row) => {
        if (!cancelled) {
          setMe({
            employeeCode: row.employee_code ?? null,
            mfaEnabled: row.mfa_enabled === true,
            position: row.position ?? null,
            hasPassword: (row.email ?? '').trim() !== '',
            passwordChangedAt: row.password_changed_at ?? null,
          });
        }
      })
      .catch(() => {
        /* offline — the head keeps the short UUID, and the rows that report a fetched fact say
           nothing rather than guessing one: no MFA state, and no Password row at all (an account
           whose path is unknown must not be offered a reset that may not apply to it). */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Ask for the password-reset email, once, and report what happened in place.
   *
   * An Alert rather than a route: there is no screen to go to — the user continues in their mail
   * app. `busySend` blocks a second tap while the first is in flight, because a second action token
   * invalidates the first and a user who taps twice would be handed a link that is already dead.
   */
  const [sendingReset, setSendingReset] = useState(false);
  const onChangePassword = (): void => {
    if (sendingReset) return;
    setSendingReset(true);
    requestMyPasswordResetEmail()
      .then(({ email }) =>
        Alert.alert(t('profile.password.sentTitle'), t('profile.password.sentBody', { email })),
      )
      .catch(() => Alert.alert(t('profile.password.title'), t('profile.password.failed')))
      .finally(() => setSendingReset(false));
  };

  /**
   * The offline database's size on disk, or null where it cannot be measured.
   *
   * REAL: `PRAGMA page_count × page_size` on the open connection. Read once per mount — it is a
   * synchronous SQLite call, and a settings screen is not a place that needs it live. A build with
   * no database open throws rather than lying about a size, and then the row draws no figure.
   */
  const cacheBytes = useMemo<number | null>(() => {
    try {
      return localDbSizeBytes();
    } catch {
      return null;
    }
  }, []);

  // The REAL build version (app.json), read the way the login footer reads it. The mockup prints
  // "2.4.0-stable"; that is a drawing, and a version a user might quote in a support request is the
  // one thing here that must never be decorative.
  const appVersion = Constants.expoConfig?.version ?? '—';

  return (
    <View testID="account-settings" style={styles.root}>
      {/* THE PROFILE HEAD. The block is the project's standard (§32.7 "Drawer Profile Block") —
          AVATAR · NAME · POSITION · ID · STATUS, the same order and the same fields the drawer
          draws, because the standard says there is no per-role variant of it and this is the second
          surface that shows it. The drawing's photo avatar and its hardcoded "CRM Manager" line are
          NOT used: the avatar is the app's own, and the line under the name is `platform.users.
          position`, which is real and is null for most accounts. */}
      <View testID="account-profile-card" style={styles.profileCard}>
        <ProfileBlock
          variant="screen"
          testIDPrefix="settings"
          displayName={displayName}
          fallbackName={t('drawer.member')}
          position={me?.position}
          idLabel={t('profile.main.userId')}
          employeeCode={me?.employeeCode}
          userId={userId}
        />
        {/* THE REAL SYNC STATE, through the same precedence <SyncPill /> and <OverlaySyncPill />
            read — error > syncing > pending > synced — rather than the drawing's "Last sync: 2 min
            ago", which nothing here records. The hook's colours are the dark-shell tokens because
            its first caller was the top bar; this is a themed page, so the TONE is mapped from the
            state's own glyph and the LABEL and GLYPH come from the hook unchanged. Mapping the tone
            here rather than re-deriving the state is deliberate: the precedence exists once. */}
        <View testID="settings-sync-row" style={styles.syncRow}>
          <MaterialIcons name={sync.icon} size={16} color={syncTone(p, sync.icon)} />
          <Text style={[styles.syncText, { color: syncTone(p, sync.icon) }]} numberOfLines={1}>
            {sync.label}
          </Text>
        </View>
      </View>

      {/* ── APPLICATION SETTINGS ────────────────────────────────────────────────────────────────
          The Stitch screen's first group, and the reason both rows below are SEGMENTED rather than
          what they were: a row showing the current language with a swap glyph, and a "Dark mode"
          switch. Neither of these is an on/off — a switch makes light the ABSENCE of dark — and a
          picker screen to choose between two items is a screen too many. See <SegmentedControl />
          for the full argument and for why the segments are 44px where the drawing's are 32. */}
      <Section label={t('profile.main.appSection')}>
        <Row
          testID="locale-row"
          icon="language"
          label={t('profile.main.language')}
          trailing={
            <SegmentedControl
              testID="locale-segmented"
              accessibilityLabel={t('profile.main.language')}
              value={locale}
              onChange={(next) => setLocale(next)}
              options={[
                // TH first, as the drawing orders them.
                { value: 'th' as const, label: t('profile.main.thaiShort') },
                { value: 'en' as const, label: t('profile.main.englishShort') },
              ]}
            />
          }
        />
        {/* TWO MODES, NOT THE DRAWING'S THREE (PO decision E1, 2026-09-13). Its pill has a third
            `settings_brightness` button for "follow the system", and `ThemeMode` is
            `'dark' | 'light'` — there is no system mode in the store, nothing reads one, and adding
            one is a behaviour change rather than a restyle. The SHAPE is adopted; the third segment
            is not drawn, because a segment that cannot be selected is worse than one fewer. */}
        <Row
          testID="theme-row"
          icon="dark-mode"
          label={t('profile.main.theme')}
          trailing={
            <SegmentedControl
              testID="theme-segmented"
              accessibilityLabel={t('profile.main.theme')}
              value={mode}
              onChange={(next) => void setMode(next)}
              options={[
                { value: 'light' as const, label: t('profile.main.themeLight') },
                { value: 'dark' as const, label: t('profile.main.themeDarkShort') },
              ]}
            />
          }
        />
      </Section>

      {/* SYSTEM PERMISSIONS — VIEWER only. The three MODULES are the drawing's (Financials, BIM
          Models, Site Reports) and are registered as VIEWER_PERMISSION_TILES: `@cos/rbac` resolves
          permissions from the JWT role claim and no endpoint returns the effective matrix for the
          signed-in user, so this screen cannot read what it is showing. What it does NOT claim is
          that these three are the whole grant — §6.8 gives this role ten modules — and the caption
          under them is the drawing's own. */}
      {role === CosRole.VIEWER ? (
        <View testID="permissions-section" style={styles.section}>
          <Text style={styles.sectionLabel}>{t('profile.permissions.title')}</Text>
          <View style={styles.permissionGrid}>
            {VIEWER_PERMISSION_TILES.value.map((tile) => (
              <View
                key={tile.key}
                testID={`permission-tile-${tile.key}`}
                style={styles.permissionTile}
              >
                <View style={styles.permissionHead}>
                  <MaterialIcons name={tile.icon} size={20} color={p.muted} />
                  <View style={styles.permissionChip}>
                    <Text style={styles.permissionChipText}>
                      {t('profile.permissions.readOnly')}
                    </Text>
                  </View>
                </View>
                <Text style={styles.permissionLabel} numberOfLines={1}>
                  {t(`profile.permissions.module.${tile.key}`)}
                </Text>
              </View>
            ))}
          </View>
          <View style={styles.permissionNote}>
            <MaterialIcons name="info" size={14} color={p.muted} />
            <Text style={styles.permissionNoteText}>{t('profile.permissions.note')}</Text>
          </View>
        </View>
      ) : null}

      {/* Notification Settings — drawn INSIDE this screen by mockup 02_shared/03_account_settings
          (withdrawn 2026-08-16), and the one part of Account Settings that differs by role: it
          offers only the types §19.4 routes to the signed-in role. Its own component because it
          owns server state. */}
      <NotificationSettings />

      {/* ── SECURITY & ACCESS ───────────────────────────────────────────────────────────────────
          The Stitch screen's third group. Password · Two-Factor Authentication · Biometric, in its
          order. The first is new; the other two were already on this screen under `Account` and are
          MOVED here rather than duplicated — and the biometric switch was in TWO places until
          2026-09-13, here and on `/account-security`, which is a preference a user could set in one
          and see stale in the other. `/account-security` keeps the devices it is named for. */}
      <Section label={t('profile.main.securitySection')}>
        {/* PASSWORD — PATH B ONLY, and ABSENT rather than disabled on Path A (ADR-104).
            A phone/OTP account has no password its owner knows: `provisionPhoneUser` creates the
            Keycloak user with no credential and every OTP exchange writes a fresh random UUID. A
            disabled row would say "not now" where the truth is "never, on this account".
            Also absent while `me` is null — an unanswered fetch is not a Path B account. */}
        {me?.hasPassword === true ? (
          <Row
            testID="password-row"
            icon="lock"
            label={t('profile.password.title')}
            // The drawing's "Last changed 3 months ago". SILENT WHEN NULL, which is the ordinary
            // case and will stay so: the reset completes inside Keycloak and calls nothing back, so
            // only an admin temporary reset ever stamps the column. "Never" would be a claim about
            // the password; the truth is only that this service has not observed a change.
            description={
              me.passwordChangedAt === null
                ? undefined
                : t('profile.password.lastChanged', {
                    date: formatDate(me.passwordChangedAt, locale),
                  })
            }
            action={{
              label: t('profile.password.change'),
              onPress: onChangePassword,
              disabled: sendingReset,
            }}
          />
        ) : null}
        {/* TWO-FACTOR AUTHENTICATION — the row that was `profile-mfa-row` under Account. REAL:
            `platform.users.mfa_enabled`, silent until the fetch answers, because an unanswered
            fetch is not "not enrolled".
            THE DRAWING SHOWS NO ACTION on this row — a status line and a green tick. This build has
            a working enrolment screen behind a flag, and ADR-085 says a drawing does not remove
            reviewed working capability, so the row stays pressable and gains the drawing's status
            line and glyph. */}
        <Row
          testID="profile-mfa-row"
          icon="security"
          label={t('mfa.enroll.title')}
          description={
            me === null
              ? undefined
              : t('profile.main.mfaStatus', {
                  state: me.mfaEnabled ? t('profile.main.mfaOn') : t('profile.main.mfaOff'),
                })
          }
          trailingIcon={me?.mfaEnabled === true ? 'check-circle' : 'chevron-right'}
          trailingTone={me?.mfaEnabled === true ? 'success' : undefined}
          onPress={() =>
            MFA_ENROLLMENT_ENABLED
              ? router.push('/mfa-enrollment')
              : Alert.alert(t('mfa.enroll.title'), t('common.comingSoon'))
          }
        />
        {/* Biometric login. Disabled rather than hidden when the device has nothing enrolled: both
            drawings show the row, and hiding it would leave a worker wondering where it went. */}
        <Row
          testID="biometric-row"
          icon="fingerprint"
          label={t('profile.biometric.title')}
          // No standing explanatory line — the drawing's row is a label and a switch. The line
          // below appears ONLY after the device refused, and it is the report `/account-security`
          // used to make with an InfoCard: THE DEVICE'S ANSWER DECIDES, not the tap. A switch that
          // shows "on" for a lock that never engages is the worst kind of security UI, and moving
          // the control here must not lose the sentence that said so (ADR-085).
          description={refused ? t('accountSecurity.biometricUnavailableBody') : undefined}
          toggle={{
            on: enabled,
            disabled: !available || busy,
            onChange: (next) => {
              setBusy(true);
              // setEnabled awaits SecureStore and the biometric prompt and guards neither, so it
              // can reject — and `.finally()` would then reject too, with nobody listening. The
              // switch reads `enabled` from the store, so a failed enable already shows as the
              // toggle staying where it was; this only stops the rejection escaping.
              //
              // It RESOLVES false when the OS prompt was declined or nothing is enrolled, which is
              // a different outcome from throwing and the one the line above reports. Only an
              // attempt to turn the lock ON can be refused; switching off always succeeds.
              void Promise.resolve(setEnabled(next))
                .then((ok) => setRefused(next && ok === false))
                .catch(() => undefined)
                .finally(() => setBusy(false));
            },
          }}
        />
        {/* "Change Secure PIN" is kept from the mockup the product owner asked for on 2026-08-09;
            the Stitch screen does not draw it, and ADR-085 does not let a drawing remove a reviewed
            row. It REPORTS BEING UNAVAILABLE rather than opening anything: this product has no PIN
            — device unlock is the biometric row above, and there is no PIN column, no set/verify
            endpoint and no recovery path. Shipping a credential dialog with nothing behind it would
            be a security feature in name only. */}
        <Row
          testID="change-pin-row"
          icon="dialpad"
          label={t('profile.main.changePin')}
          onPress={() => Alert.alert(t('profile.main.changePin'), t('common.comingSoon'))}
        />
      </Section>

      {/* The Privacy Policy row left this card on 2026-08-14 for the drawer, where mockup
          02_shared/01_navigation_drawer drew it and where spec §32.7 (Bottom Navigation) puts
          account-level destinations — one screen should not be reachable from two doors one tap
          apart. That drawing was withdrawn on 2026-08-16 together with
          04_tenant_admin/05_navigation_drawer; the placement stands (ADR-085) and the drawer's
          rows live in lib/drawerLinks.ts. About keeps the version.

          "IT IS A DRAWER ROW NOW" WAS NOT TRUE WHEN THIS COMMENT WAS WRITTEN. Commit 44d46a40 had
          deleted the drawer's `PRIVACY_LINK` five days earlier (2026-08-09), so removing this row
          left the policy — and the Transparency Portal entered from it — with no route into them at
          all, for three days, against PDPA §23. Restored to SHARED_LINKS on 2026-08-17; the sentence
          above is now accurate, and drawerLinks.spec.ts holds it that way. */}
      <Section label={t('profile.main.systemSection')}>
        {/* REPORTS, does not manage — see the note at the head of this file. No chevron, no press:
            a row that cannot act must not look like it can. */}
        <Row
          testID="offline-data-row"
          icon="wifi-off"
          label={t('profile.main.offlineData')}
          description={t('profile.main.offlineDataDesc')}
          value={
            cacheBytes === null
              ? undefined
              : t('profile.main.offlineDataCeiling', {
                  used: formatBytes(cacheBytes),
                  cap: formatBytes(MAX_LOCAL_DB_BYTES),
                })
          }
        />
        <Row
          testID="profile-version"
          icon="info"
          label={t('profile.main.version')}
          value={appVersion}
        />
      </Section>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    root: { gap: spacing.md, paddingTop: spacing.sm },
    profileCard: {
      backgroundColor: p.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    syncRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      // `p.bg` until 2026-09-10, which is the page colour and therefore DARKER than the card it
      // sits on — the "reads as a hole" defect the product owner reported on three panels of the
      // CRM screens the same week. `surfaceSunk` is the step INTO a card rather than through it
      // (design-tokens.md: "NEITHER IS EVER --cos-dark-bg on a card").
      backgroundColor: p.surfaceSunk,
      borderRadius: radius.md,
      paddingHorizontal: spacing.sm,
      paddingVertical: 6,
    },
    syncText: { fontSize: 11, fontFamily: fontFamily.medium },
    section: { gap: spacing.xs },
    sectionLabel: {
      fontSize: 11,
      fontFamily: fontFamily.semibold,
      letterSpacing: 1,
      textTransform: 'uppercase',
      color: p.muted,
      marginLeft: spacing.xs,
    },
    card: {
      backgroundColor: p.surface,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      overflow: 'hidden',
    },
    // The permission tiles are a GRID rather than a card of rows — the one block on this screen
    // that is not the <Row /> anatomy, because the drawing draws it as two columns of squares.
    permissionGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    permissionTile: {
      // Two per row at any width: half the space, less half the gap. `flexGrow: 0` is the half that
      // matters — with it growing, the drawing's THIRD tile stretched to the full width on its own
      // row and stopped reading as one of a set of three. It stays half-width and left-aligned,
      // which is what the drawing shows.
      flexBasis: '48%',
      flexGrow: 0,
      gap: spacing.sm,
      padding: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      borderLeftColor: p.muted,
      backgroundColor: p.surface,
    },
    permissionHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
    },
    permissionChip: {
      paddingHorizontal: spacing.xs / 2,
      paddingVertical: 2,
      borderRadius: radius.xl,
      backgroundColor: p.surfaceBright,
    },
    permissionChipText: {
      fontSize: 10,
      fontFamily: fontFamily.semibold,
      letterSpacing: 0.5,
      color: p.muted,
      textTransform: 'uppercase',
    },
    permissionLabel: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    permissionNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs / 2,
      marginLeft: spacing.xs,
    },
    permissionNoteText: {
      flex: 1,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight,
    },
    row: {
      minHeight: touchTarget.formInput,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
    },
    rowLead: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    rowLabelBlock: { flex: 1, gap: 2 },
    rowLabel: {
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.regular,
      color: p.text,
    },
    rowDescription: {
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.regular,
      color: p.muted,
    },
    rowTail: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    rowValue: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.medium,
      color: p.muted,
      maxWidth: 140,
    },
    rowValueSuccess: { color: p.success },
    // The drawing's blue `Change` — a word that acts. Padded to a 44px target in both directions
    // without a border or a fill, because it sits INSIDE a row that is already a surface (§32.7).
    rowAction: {
      minHeight: touchTarget.iconButton,
      minWidth: touchTarget.iconButton,
      paddingHorizontal: spacing.xs,
      alignItems: 'center',
      justifyContent: 'center',
    },
    rowActionText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      color: p.primary,
    },
    rowActionOff: { color: p.muted },
  });
