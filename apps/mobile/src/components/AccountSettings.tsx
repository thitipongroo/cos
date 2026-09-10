// Account settings — security, preferences, app info (all roles; master 3100).
//
// Rendered by `app/(app)/account-settings.tsx`, pushed from the navigation drawer's Settings row.
// It lived INSIDE the drawer for one build — the first shape of the 2026-08-09 "the drawer IS the
// profile" ruling — until the panel was carrying both navigation and settings with ~900px below the
// fold. There is still no `/profile` route: identity lives in the drawer, this is reached from it.
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
//     open, and this product has no editable self-profile: `/profile` was deleted on 2026-08-09
//     when the drawer became the profile, and `/user-profile` is the Tenant Admin looking at
//     SOMEBODY ELSE, driven by params. A chevron onto the card six pixels above it is not a row.
//   "Last sync: 2 min ago" — not drawn. Nothing here records when the last flush finished; what
//     IS known is the current sync state, and that is what the head says instead, through the same
//     `useSyncPillView` precedence every other sync indicator in the app reads.
//   "2.4 GB" against Offline Data — replaced by the REAL on-disk size of the offline database
//     (`localDbSizeBytes()`, db/database.ts), shown against the §17.7 ceiling it is measured for.
//     The row REPORTS and does not manage: nothing in this app prunes that cache on request, and a
//     "Manage" chevron onto nothing would be the drawn control this project keeps refusing to ship.
//
// Palette-resolved, because it is a page now rather than the always-dark drawer panel.
//
// Offline-safe: everything here is local state except the MFA row's target screen.

import { useEffect, useMemo, useState } from 'react';
import { View, Text, Pressable, Switch, Alert, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { NotificationSettings } from './NotificationSettings';
import { ProfileBlock } from './ProfileBlock';
import { useThemeStore } from '../store/themeStore';
import { useBiometricStore } from '../store/biometricStore';
import { useAuthStore } from '../store/authStore';
import { useSyncPillView } from '../hooks/useSyncPillView';
import { getMe } from '../api/users';
import { localDbSizeBytes } from '../db/database';
import { MAX_LOCAL_DB_BYTES } from '../sync/localDbLimit';
import { formatBytes } from '../lib/formatBytes';
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
  toggle,
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
  toggle?: { on: boolean; onChange: (next: boolean) => void; disabled?: boolean };
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
          <MaterialIcons name={trailingIcon} size={20} color={p.muted} />
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
  const sync = useSyncPillView();
  const [busy, setBusy] = useState(false);

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
          });
        }
      })
      .catch(() => {
        /* offline — the head keeps the short UUID and the MFA row says nothing it cannot see */
      });
    return () => {
      cancelled = true;
    };
  }, []);

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

      <Section label={t('profile.main.accountSection')}>
        <Row
          testID="profile-mfa-row"
          icon="shield"
          label={t('mfa.enroll.title')}
          // REAL: `platform.users.mfa_enabled`. Silent until the answer is known — an unanswered
          // fetch is not "not enrolled".
          value={
            me === null
              ? undefined
              : me.mfaEnabled
                ? t('profile.main.mfaOn')
                : t('profile.main.mfaOff')
          }
          valueTone={me?.mfaEnabled === true ? 'success' : 'muted'}
          onPress={() =>
            MFA_ENROLLMENT_ENABLED
              ? router.push('/mfa-enrollment')
              : Alert.alert(t('mfa.enroll.title'), t('common.comingSoon'))
          }
        />
        {/* Biometric login. Disabled rather than hidden when the device has nothing enrolled: the
            mockup shows the row, and hiding it would leave a worker wondering where it went. */}
        <Row
          testID="biometric-row"
          icon="fingerprint"
          label={t('profile.biometric.title')}
          // No explanatory line — the mockup's row is a label and a switch, nothing else (PO
          // 2026-08-09). When the device cannot do it the switch is simply disabled; the OS is where
          // a biometric gets enrolled, and this row is not the place to teach that.
          toggle={{
            on: enabled,
            disabled: !available || busy,
            onChange: (next) => {
              setBusy(true);
              // setEnabled awaits SecureStore and the biometric prompt and guards neither, so it
              // can reject — and `.finally()` would then reject too, with nobody listening. The
              // switch reads `enabled` from the store, so a failed enable already shows as the
              // toggle staying where it was; this only stops the rejection escaping.
              void Promise.resolve(setEnabled(next))
                .catch(() => undefined)
                .finally(() => setBusy(false));
            },
          }}
        />
        {/* "Change Secure PIN" is drawn because the mockup draws it and the product owner asked for
            it on 2026-08-09. It REPORTS BEING UNAVAILABLE rather than opening anything: this product
            has no PIN — device unlock is the biometric row above, and there is no PIN column, no
            set/verify endpoint and no recovery path. Shipping a credential dialog with nothing
            behind it would be a security feature in name only, so this is the same treatment START
            SCAN and the directory's chat button get. */}
        <Row
          testID="change-pin-row"
          icon="dialpad"
          label={t('profile.main.changePin')}
          onPress={() => Alert.alert(t('profile.main.changePin'), t('common.comingSoon'))}
        />
      </Section>

      <Section label={t('profile.main.preferencesSection')}>
        {/* The mockup shows the current language with a chevron. With exactly two locales a picker
            screen would be a screen to choose between two items, so the row TOGGLES and names what
            it will switch to — the chevron is dropped for a swap glyph, which is what it does. */}
        <Row
          testID="locale-row"
          icon="language"
          label={t('profile.main.language')}
          value={locale === 'th' ? t('profile.main.thai') : t('profile.main.english')}
          trailingIcon="swap-horiz"
          onPress={() => setLocale(locale === 'th' ? 'en' : 'th')}
        />
        {/* The row that pushed /notification-preferences was removed on 2026-08-14: that screen is
            the TENANT_ADMIN panel, reached from its Settings tab. Every role's own notification
            settings are the <NotificationSettings /> section below, which mockup
            02_shared/03_account_settings drew inside this screen rather than behind a row (that
            drawing was withdrawn 2026-08-16 — see the NotificationSettings header; ADR-085). */}
        <Row
          testID="theme-row"
          icon="dark-mode"
          label={t('profile.main.themeDark')}
          toggle={{
            on: mode === 'dark',
            onChange: (next) => void setMode(next ? 'dark' : 'light'),
          }}
        />
      </Section>

      {/* Notification Settings — drawn INSIDE this screen by mockup 02_shared/03_account_settings
          (withdrawn 2026-08-16), and the one part of Account Settings that differs by role: it
          offers only the types §19.4 routes to the signed-in role. Its own component because it
          owns server state. */}
      <NotificationSettings />

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
      backgroundColor: p.bg,
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
  });
