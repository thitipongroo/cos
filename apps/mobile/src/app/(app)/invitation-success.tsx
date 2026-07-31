// Invitation success (mockup 04_tenant_admin/01_home/02_quick_action_button/02_invite_user/
// 04_invitation_success; §32.7 dark). Terminal screen shown after Invite-user's SEND INVITATION
// succeeds (createUser 201). Replaces the old success Alert.
//
// All summary values are the REAL data just submitted — the recipient contact exactly as entered (no
// masking, PO decision 2026-07-29), the chosen role, and the projects the admin actually picked (the
// row is hidden when none were, since createUser takes no project list). "Status: Awaiting response"
// is truthful — the invite is pending until the recipient verifies. The CORE_AI banner is kept as the
// mockup drew it, including "98% Confidence | RBAC policy v4.2" (PO decision 2026-07-29 — "full").
// No top bar of its own; the global TopBar shows the CONSTRUCTION OS wordmark (no Back — this is a
// terminal screen, reached via router.replace so there is no form to go back to).

import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useT } from '../../i18n';
import { darkColors, fontFamily, spacing, touchTarget, typography } from '../../theme/tokens';

/** SITE_ENGINEER → "Site Engineer" (mirrors invite-user / roles-selection). */
function formatRole(role: string): string {
  return role
    .split('_')
    .map((w) => w.charAt(0) + w.slice(1).toLowerCase())
    .join(' ');
}

export default function InvitationSuccessScreen(): React.JSX.Element {
  const t = useT();
  const router = useRouter();
  const params = useLocalSearchParams<{
    method: string;
    contact: string;
    role: string;
    projects: string;
  }>();
  const method = params.method === 'email' ? 'email' : 'phone';
  const contact = typeof params.contact === 'string' ? params.contact : '';
  const role = typeof params.role === 'string' ? params.role : '';
  const projects = typeof params.projects === 'string' ? params.projects : '';

  return (
    <View style={styles.root} testID="invitation-success">
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Success indicator */}
        <View style={styles.hero}>
          <View style={styles.checkCircle}>
            <MaterialIcons name="check-circle" size={48} color={darkColors.success} />
          </View>
          <Text style={styles.heading}>{t('invitationSuccess.heading')}</Text>
          <View style={styles.accentLine} />
        </View>

        {/* Summary card */}
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Text style={styles.cardHeaderText}>{t('invitationSuccess.summaryTitle')}</Text>
          </View>
          <View style={styles.cardBody}>
            <View style={styles.recipientRow}>
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('invitationSuccess.recipient')}</Text>
                <Text style={styles.recipientValue}>{contact}</Text>
              </View>
              <MaterialIcons
                name={method === 'phone' ? 'contact-phone' : 'alternate-email'}
                size={24}
                color={darkColors.primary}
              />
            </View>
            <View style={styles.divider} />
            <View style={styles.field}>
              <Text style={styles.fieldLabel}>{t('invitationSuccess.role')}</Text>
              <Text style={styles.fieldValue}>{formatRole(role)}</Text>
            </View>
            {projects !== '' ? (
              <View style={styles.field}>
                <Text style={styles.fieldLabel}>{t('invitationSuccess.projects')}</Text>
                <Text style={styles.fieldValue}>{projects}</Text>
              </View>
            ) : null}
          </View>
        </View>

        {/* CORE_AI transparency banner (kept as the mockup drew it — PO decision 2026-07-29) */}
        <View style={styles.aiPanel}>
          <View style={styles.aiHeaderRow}>
            <View style={styles.aiHeaderLeft}>
              <MaterialIcons name="auto-awesome" size={18} color={darkColors.cyan} />
              <Text style={styles.aiTitle}>{t('invitationSuccess.aiTitle')}</Text>
            </View>
            <Text style={styles.aiMeta}>{t('invitationSuccess.aiMeta')}</Text>
          </View>
          <Text style={styles.aiBody}>{t('invitationSuccess.aiBody')}</Text>
        </View>

        {/* Status */}
        <View style={styles.statusRow}>
          <View style={styles.statusDot} />
          <Text style={styles.statusText}>{t('invitationSuccess.status')}</Text>
        </View>
      </ScrollView>

      {/* Footer actions */}
      <View style={styles.footer}>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => router.replace('/invite-user')}
          testID="invitation-success-invite-another"
          accessibilityRole="button"
        >
          <Text style={styles.secondaryText}>{t('invitationSuccess.inviteAnother')}</Text>
        </Pressable>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => router.replace('/home')}
          testID="invitation-success-dashboard"
          accessibilityRole="button"
        >
          <Text style={styles.primaryText}>{t('invitationSuccess.goToDashboard')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  scroll: { flex: 1 },
  content: { padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md },

  hero: { alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.md },
  checkCircle: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: `${darkColors.success}1A`,
    borderWidth: 1,
    borderColor: `${darkColors.success}4D`,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: spacing.md,
  },
  heading: {
    fontFamily: fontFamily.bold,
    fontSize: typography.hero.fontSize,
    textTransform: 'uppercase',
    color: darkColors.text,
    textAlign: 'center',
    marginBottom: spacing.sm,
  },
  accentLine: { width: 48, height: 4, borderRadius: 2, backgroundColor: `${darkColors.success}80` },

  card: {
    backgroundColor: darkColors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: darkColors.border,
    overflow: 'hidden',
  },
  cardHeader: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    backgroundColor: darkColors.elevated,
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
  },
  cardHeaderText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    color: darkColors.text,
  },
  cardBody: { padding: spacing.md, gap: spacing.md },
  recipientRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  field: { gap: 4, flex: 1, minWidth: 0 },
  fieldLabel: {
    fontFamily: fontFamily.medium,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: darkColors.muted,
  },
  recipientValue: {
    fontFamily: fontFamily.bold,
    fontSize: typography.title.fontSize,
    color: darkColors.text,
  },
  fieldValue: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
  },
  divider: { height: 1, backgroundColor: darkColors.border },

  aiPanel: {
    backgroundColor: `${darkColors.cyan}0D`,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.cyan,
    borderRadius: 12,
    padding: spacing.md,
    gap: spacing.xs,
  },
  aiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  aiHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  aiTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 1.5,
    color: darkColors.cyan,
  },
  aiMeta: { fontFamily: fontFamily.bold, fontSize: 9, color: darkColors.muted, flexShrink: 1 },
  aiBody: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19, color: darkColors.muted },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: 4 },
  statusDot: { width: 8, height: 8, borderRadius: 4, backgroundColor: darkColors.syncing },
  statusText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: darkColors.muted,
  },

  // In normal flow below the ScrollView (not absolute): this is a fixed-height terminal screen whose
  // content never scrolls, so an absolute footer only risked overlapping the last row (Status).
  footer: {
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: darkColors.surface,
    borderTopWidth: 1,
    borderTopColor: darkColors.border,
  },
  secondaryBtn: {
    height: touchTarget.primaryButton + 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: darkColors.border,
  },
  secondaryText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: darkColors.text,
  },
  primaryBtn: {
    height: touchTarget.primaryButton + 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 12,
    backgroundColor: darkColors.primary,
  },
  primaryText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: darkColors.onPrimary,
  },
});
