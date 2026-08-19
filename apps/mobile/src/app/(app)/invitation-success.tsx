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
import {
  darkColors,
  fontFamily,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';
import { formatRole } from '../../lib/formatRole';
import { darkScreen } from '../../theme/screenStyles';

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
    <View style={darkScreen.root} testID="invitation-success">
      <ScrollView style={darkScreen.fill} contentContainerStyle={darkScreen.content}>
        {/* Success indicator */}
        <View style={darkScreen.hero}>
          <View style={darkScreen.checkCircle}>
            <MaterialIcons name="check-circle" size={48} color={darkColors.success} />
          </View>
          <Text style={darkScreen.heading}>{t('invitationSuccess.heading')}</Text>
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
            <View style={darkScreen.divider} />
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
        <View style={darkScreen.aiPanel}>
          <View style={styles.aiHeaderRow}>
            <View style={styles.aiHeaderLeft}>
              <MaterialIcons name="auto-awesome" size={18} color={darkColors.cyan} />
              <Text style={darkScreen.aiTitleCompact}>{t('invitationSuccess.aiTitle')}</Text>
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
      <View style={darkScreen.footer}>
        <Pressable
          style={styles.secondaryBtn}
          onPress={() => router.replace('/invite-user')}
          testID="invitation-success-invite-another"
          accessibilityRole="button"
        >
          <Text style={darkScreen.secondaryText}>{t('invitationSuccess.inviteAnother')}</Text>
        </Pressable>
        <Pressable
          style={styles.primaryBtn}
          onPress={() => router.replace('/home')}
          testID="invitation-success-dashboard"
          accessibilityRole="button"
        >
          <Text style={darkScreen.primaryText}>{t('invitationSuccess.goToDashboard')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  accentLine: {
    width: 48,
    height: 4,
    borderRadius: radius.sm,
    backgroundColor: `${darkColors.success}80`,
  },

  card: {
    backgroundColor: darkColors.surface,
    borderRadius: radius.lg,
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

  aiHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.xs,
  },
  aiHeaderLeft: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  aiMeta: { fontFamily: fontFamily.bold, fontSize: 9, color: darkColors.muted, flexShrink: 1 },
  aiBody: { fontFamily: fontFamily.regular, fontSize: 13, lineHeight: 19, color: darkColors.muted },

  statusRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingHorizontal: 4 },
  statusDot: { width: 8, height: 8, borderRadius: radius.md, backgroundColor: darkColors.syncing },
  statusText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    color: darkColors.muted,
  },

  // In normal flow below the ScrollView (not absolute): this is a fixed-height terminal screen whose
  // content never scrolls, so an absolute footer only risked overlapping the last row (Status).
  secondaryBtn: {
    height: touchTarget.primaryButton + 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: darkColors.border,
  },
  primaryBtn: {
    height: touchTarget.primaryButton + 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    backgroundColor: darkColors.primary,
  },
});
