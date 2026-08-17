// Support Center — POST-AUTH route (product-owner decision 2026-08-17).
//
// Opened by the signed-in TopBar's "?", which until that decision showed an
// `Alert.alert('Help & Support', 'coming soon')` because there was no in-app help surface to send
// anyone to. There was one — app/(auth)/support.tsx — but it could not be reached from here:
// AuthGate in app/_layout.tsx redirects an authenticated user out of the (auth) group
// (`isAuthenticated && inAuthGroup → /(app)/home`), so a push from a signed-in screen landed on Home.
// This route is the (app) twin that fixes that, exactly as app/(app)/privacy-policy.tsx does for the
// Privacy Policy (PO decision 2026-08-04).
//
//   The same bounce is why the drawer's Support row was removed in this change: `/support` had been
//   added to `SHARED_LINKS` on 2026-08-10 to give signed-in users a way to ask for help, and it had
//   never worked. The product owner ruled on 2026-08-17 that the "?" is the single post-auth entry
//   rather than restoring a second one — so there is now exactly one way in from each side.
//
// THE TWO ROUTES ARE DELIBERATELY NOT THE SAME SCREEN (PO decision 2026-08-17). Everything shared is
// in components/SupportCenterDocument.tsx. What this route adds, and why each piece is real rather
// than drawn:
//   - IDENTITY. The signed-in user's name and role, from authStore. Pre-auth cannot say who is
//     asking; here the person on the phone does not have to.
//   - ACTIVE PROJECT. From projectStore — the same answer the ProjectContextBar prints. Renders a
//     "none selected" line rather than a placeholder when the picker has not been answered.
//   - DIAGNOSTICS. Connection (useNetworkStatus), queued changes (syncStore) and unresolved
//     conflicts (offlineStore) — the three numbers a support call actually asks for, and the reason
//     the pre-auth FIELD ASSISTANT panel is NOT carried over: it exists to say something when the
//     app knows nothing else, and here the app knows these.
//   - ROLE MODULES. Derived from `drawerLinksFor(role)`, i.e. the §6.4 module matrix. It answers
//     "should I be able to see X?", which is the second most common support question after "it will
//     not sync". IT IS NOT A HELP-ARTICLE LIST — there is no `help_article`/`faq` table and no
//     search endpoint, which is also why Search stays disabled on BOTH routes (PO 2026-08-09,
//     re-affirmed 2026-08-17).
//
// WHAT IT DOES NOT ADD: a better phone number. `grep -i "support|hotline|emergency"` over
// backend/prisma/schema.prisma returns nothing — no support-desk, hotline or emergency-contact column
// exists for a tenant or a project — so signing in resolves nothing the deployment's
// EXPO_PUBLIC_SUPPORT_* variables do not already give, and the product owner ruled on 2026-08-17
// that this change adds no backend. Nor a ticket: no ticket table exists either.
//
// No app bar of its own, and no page title: <TopBar /> supplies the brand, the "?" that got here and
// the "<" back control, and Breadcrumb.tsx registers this path, which is what makes it a child
// screen (§32.7 "a screen is named ONCE"). It follows the user's theme rather than pinning dark —
// §32.7 pins only the pre-auth surfaces, which this is not.

import { useMemo } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MaterialIcons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { useT } from '../../i18n';
import { useAuthStore } from '../../store/authStore';
import { useProjectStore } from '../../store/projectStore';
import { useNetworkStatus } from '../../hooks/useNetworkStatus';
import { usePendingCount } from '../../hooks/usePendingCount';
import { useConflicts } from '../../hooks/useConflicts';
import { drawerLinksFor } from '../../lib/drawerLinks';
import { formatRole } from '../../lib/formatRole';
import { SupportCenterDocument, useBackendHealth } from '../../components/SupportCenterDocument';
import { usePalette, type Palette } from '../../theme/usePalette';
import { fontFamily, radius, spacing, typography } from '../../theme/tokens';

export default function SupportScreen(): React.JSX.Element {
  const insets = useSafeAreaInsets();
  const t = useT();
  const pal = usePalette();
  const styles = useMemo(() => makeStyles(pal), [pal]);

  const displayName = useAuthStore((s) => s.displayName);
  const role = useAuthStore((s) => s.role);
  const project = useProjectStore((s) => s.active);
  const { isOnline } = useNetworkStatus();
  const pending = usePendingCount();
  const conflicts = useConflicts();
  const { health, minutesAgo } = useBackendHealth();

  // The role's own modules, from the §6.4 matrix via drawerLinks — the single source the drawer
  // already derives from, so this list cannot drift from what the user can actually open.
  const modules = useMemo(() => drawerLinksFor(role), [role]);

  return (
    <View style={[styles.root, { backgroundColor: pal.bg }]}>
      <SupportCenterDocument
        testID="support"
        palette={pal}
        health={health}
        minutesAgo={minutesAgo}
        paddingBottom={insets.bottom + spacing.xl}
        header={
          <View testID="support-context" style={styles.card}>
            <Text style={styles.eyebrow}>{t('support.context.heading')}</Text>

            <View style={styles.row}>
              <MaterialIcons name="badge" size={20} color={pal.accent} />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{t('support.context.signedInAs')}</Text>
                {/* displayName is optional on the token (authStore keeps it nullable), so the name
                    falls back to the role rather than printing an empty line. */}
                <Text style={styles.rowValue}>
                  {displayName ?? (role === null ? '—' : formatRole(role))}
                </Text>
                {role !== null ? <Text style={styles.rowNote}>{formatRole(role)}</Text> : null}
              </View>
            </View>

            <View style={styles.row}>
              <MaterialIcons name="apartment" size={20} color={pal.accent} />
              <View style={styles.rowText}>
                <Text style={styles.rowLabel}>{t('support.context.project')}</Text>
                {project === null ? (
                  <Text style={styles.rowValue}>{t('support.context.noProject')}</Text>
                ) : (
                  <>
                    <Text style={styles.rowValue}>{project.projectName}</Text>
                    <Text style={styles.rowNote}>
                      {project.buildingName === null
                        ? project.projectCode
                        : `${project.projectCode} · ${project.buildingName}`}
                    </Text>
                  </>
                )}
              </View>
            </View>
          </View>
        }
        footer={
          <>
            <Text style={styles.sectionHeading}>{t('support.diagnostics.heading')}</Text>
            <View testID="support-diagnostics" style={styles.card}>
              <Text style={styles.cardNote}>{t('support.diagnostics.note')}</Text>

              <Stat
                styles={styles}
                label={t('support.diagnostics.connection')}
                value={
                  isOnline ? t('support.diagnostics.online') : t('support.diagnostics.offline')
                }
                tint={isOnline ? pal.success : pal.warning}
              />
              <Stat
                styles={styles}
                label={t('support.diagnostics.queued')}
                value={String(pending)}
                tint={pending > 0 ? pal.warning : pal.muted}
              />
              <Stat
                styles={styles}
                label={t('support.diagnostics.conflicts')}
                value={String(conflicts.length)}
                tint={conflicts.length > 0 ? pal.danger : pal.muted}
              />
              <Stat
                styles={styles}
                label={t('support.diagnostics.appVersion')}
                value={Constants.expoConfig?.version ?? '—'}
                tint={pal.muted}
              />
            </View>

            <Text style={styles.sectionHeading}>{t('support.modules.heading')}</Text>
            <View testID="support-modules" style={styles.card}>
              <Text style={styles.cardNote}>{t('support.modules.note')}</Text>
              <View style={styles.chipWrap}>
                {modules.map((link) => (
                  <View key={link.route} style={styles.moduleChip}>
                    <MaterialIcons name={link.icon} size={14} color={pal.muted} />
                    <Text style={styles.moduleChipText}>{t(link.labelKey)}</Text>
                  </View>
                ))}
              </View>
            </View>
          </>
        }
      />
    </View>
  );
}

/** One label/value line in the diagnostics card. */
function Stat({
  styles,
  label,
  value,
  tint,
}: {
  styles: ReturnType<typeof makeStyles>;
  label: string;
  value: string;
  tint: string;
}): React.JSX.Element {
  return (
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>{label}</Text>
      <Text style={[styles.statValue, { color: tint }]}>{value}</Text>
    </View>
  );
}

function makeStyles(pal: Palette) {
  return StyleSheet.create({
    root: { flex: 1 },

    card: {
      borderWidth: 1,
      borderColor: pal.border,
      borderRadius: radius.lg,
      backgroundColor: pal.surface,
      padding: spacing.md,
      gap: spacing.sm,
    },
    cardNote: {
      color: pal.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight * 1.15,
    },

    eyebrow: {
      color: pal.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },
    sectionHeading: {
      marginTop: spacing.sm,
      color: pal.muted,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 1.5,
      textTransform: 'uppercase',
    },

    row: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    rowText: { flex: 1 },
    rowLabel: {
      color: pal.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    rowValue: {
      color: pal.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.lineHeight,
    },
    rowNote: {
      color: pal.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    statRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    statLabel: {
      flex: 1,
      color: pal.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },
    statValue: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },

    chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    moduleChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      paddingHorizontal: spacing.xs,
      paddingVertical: 4,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: pal.border,
      backgroundColor: pal.elevated,
    },
    moduleChipText: {
      color: pal.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
  });
}
