// Invite user (mockups 04_tenant_admin/01_home/02_quick_action_button/02_invite_user/
// {01_invite_user_via_phone,02_invite_user_via_email}; §32.7 dark — one screen, phone/email toggle,
// covers both). Reached from the Quick Commands overlay's "Invite New User".
//
// Real, wired: SEND INVITATION calls POST /users (createUser, TENANT_ADMIN §14.3) with the chosen
// method — Path A phone (E.164, default) or Path B email — the selected role, and the recipient's name.
// A **Full name** field is added on top of the mockup because the backend requires display_name; the
// mockup collected only a contact + role (PO decision 2026-07-29). Roles are the real assignable
// CosRole set (everything except the cross-tenant SYSTEM_ADMIN). This screen renders NO top bar of its
// own — it uses the app's global TopBar (brand · SYNCED pill · bell), which for this route also shows a
// Back arrow + a Help "?" (PO decision 2026-07-29 — a second "INVITE USER" bar was a duplicate header).
// ASSIGN PROJECTS is a UI-only search over the tenant's projects — createUser does not take a project
// list, so it is applied afterwards, not submitted here. The CORE_AI panel keeps its "94% CONFIDENCE"
// badge but its copy is role-aware without the mockup's fabricated permission specifics (PO 2026-07-29).

import { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  ScrollView,
  TextInput,
  Pressable,
  ActivityIndicator,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { CosRole } from '@cos/types';
import { createUser } from '../../api/users';
import { getMyProjects, type MyProject } from '../../api/projects';
import { useInviteRoleStore } from '../../store/inviteRoleStore';
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

type Method = 'phone' | 'email';

// Assignable roles (POST /users rejects SYSTEM_ADMIN — a cross-tenant platform role). Field-facing
// roles first so the default four cover the common invites; the rest expand behind "Show more".
const ROLES: CosRole[] = [
  CosRole.SITE_ENGINEER,
  CosRole.SITE_WORKER,
  CosRole.PROJECT_MANAGER,
  CosRole.EXECUTIVE,
  CosRole.FINANCE,
  CosRole.PROCUREMENT_OFFICER,
  CosRole.PROC_MANAGER,
  CosRole.SAFETY_OFFICER,
  CosRole.CRM_SALES_MANAGER,
  CosRole.TENANT_ADMIN,
  CosRole.VIEWER,
];
const DEFAULT_VISIBLE = 4;

export default function InviteUserScreen(): React.JSX.Element {
  const t = useT();
  const router = useRouter();

  const [method, setMethod] = useState<Method>('phone');
  const [name, setName] = useState('');
  const [contact, setContact] = useState('');
  const [role, setRole] = useState<CosRole | null>(null);
  const [sending, setSending] = useState(false);

  const [projects, setProjects] = useState<MyProject[]>([]);
  const [projQuery, setProjQuery] = useState('');
  const [picked, setPicked] = useState<MyProject[]>([]);

  // Role chosen on the full-screen roles-selection picker (mockup 03) is handed back via this store;
  // apply it to the form, then clear so it isn't re-applied on the next render.
  const pendingRole = useInviteRoleStore((s) => s.pendingRole);
  const clearPendingRole = useInviteRoleStore((s) => s.clearPendingRole);
  useEffect(() => {
    if (pendingRole) {
      setRole(pendingRole as CosRole);
      clearPendingRole();
    }
  }, [pendingRole, clearPendingRole]);

  useEffect(() => {
    let active = true;
    getMyProjects()
      .then((p) => active && setProjects(p))
      .catch(() => active && setProjects([]));
    return () => {
      active = false;
    };
  }, []);

  const visibleRoles = ROLES.slice(0, DEFAULT_VISIBLE);
  const projectMatches = useMemo(() => {
    const q = projQuery.trim().toLowerCase();
    if (q === '') return [];
    const pickedIds = new Set(picked.map((p) => p.project_id));
    return projects
      .filter((p) => !pickedIds.has(p.project_id) && p.project_name.toLowerCase().includes(q))
      .slice(0, 6);
  }, [projQuery, projects, picked]);

  // Switching method clears the contact field so a phone number never lingers in the email input.
  const changeMethod = (m: Method): void => {
    if (m === method) return;
    setMethod(m);
    setContact('');
  };
  const back = (): void => router.back();
  // Open the role-permissions breakdown for the selected role (mockup 02_role_permissions). It needs a
  // role to describe, so prompt to pick one first when none is selected.
  const viewPermissions = (): void => {
    if (role === null) {
      Alert.alert(t('inviteUser.permTitle'), t('inviteUser.errRole'));
      return;
    }
    router.push({ pathname: '/role-permissions', params: { role } });
  };

  const onSend = (): void => {
    if (sending) return;
    const nm = name.trim();
    if (nm === '') return void Alert.alert(t('inviteUser.title'), t('inviteUser.errName'));
    if (role === null) return void Alert.alert(t('inviteUser.title'), t('inviteUser.errRole'));

    let payload: Parameters<typeof createUser>[0];
    let contactDisplay = ''; // shown verbatim on the success screen (no masking — PO 2026-07-29)
    if (method === 'phone') {
      const e164 = '+66' + contact.replace(/\D/g, '').replace(/^0/, '');
      if (!/^\+[1-9]\d{7,14}$/.test(e164)) {
        return void Alert.alert(t('inviteUser.title'), t('inviteUser.errPhone'));
      }
      payload = { display_name: nm, role, phone_number: e164 };
      contactDisplay = e164;
    } else {
      const em = contact.trim();
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) {
        return void Alert.alert(t('inviteUser.title'), t('inviteUser.errEmail'));
      }
      payload = { display_name: nm, role, email: em };
      contactDisplay = em;
    }

    setSending(true);
    createUser(payload)
      .then(() => {
        // Success → the confirmation screen (mockup 04_invitation_success), carrying the real submitted
        // data. router.replace so Back / the form is gone; the success screen owns what happens next.
        router.replace({
          pathname: '/invitation-success',
          params: {
            method,
            contact: contactDisplay,
            role,
            projects: picked.map((p) => p.project_name).join(', '),
          },
        });
      })
      .catch((err: unknown) => {
        // 409 → identity already exists; anything else is a generic failure.
        const conflict = String((err as { message?: string })?.message ?? '').includes('409');
        Alert.alert(
          t('inviteUser.errorTitle'),
          conflict ? t('inviteUser.conflictBody') : t('inviteUser.errorBody'),
        );
      })
      .finally(() => setSending(false));
  };

  return (
    // The screen relies on the app's global TopBar (§32.7 — brand · SYNCED pill · bell · avatar, with a
    // Back arrow + Help "?" for this route). It renders no header of its own: a second "INVITE USER" bar
    // stacked under the global one was a duplicate top bar (PO decision 2026-07-29 — remove it, move Help
    // next to the bell). Help + Back now live in TopBar; CANCEL / the Back arrow both router.back() home.
    <View style={styles.root} testID="invite-user">
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {/* Method toggle */}
        <View style={styles.sectionHeaderRow}>
          <Text style={styles.sectionLabel}>{t('inviteUser.methodLabel')}</Text>
          <Text style={styles.sectionHint}>{t('inviteUser.pathSelection')}</Text>
        </View>
        <View style={styles.toggle}>
          <Pressable
            style={[styles.toggleBtn, method === 'phone' && styles.toggleActive]}
            onPress={() => changeMethod('phone')}
            testID="invite-method-phone"
            accessibilityRole="button"
          >
            <Text style={[styles.toggleText, method === 'phone' && styles.toggleTextActive]}>
              {t('inviteUser.phoneTab')}
            </Text>
          </Pressable>
          <Pressable
            style={[styles.toggleBtn, method === 'email' && styles.toggleActive]}
            onPress={() => changeMethod('email')}
            testID="invite-method-email"
            accessibilityRole="button"
          >
            <Text style={[styles.toggleText, method === 'email' && styles.toggleTextActive]}>
              {t('inviteUser.emailTab')}
            </Text>
          </Pressable>
        </View>

        {/* Full name (required by POST /users) */}
        <Text style={[styles.sectionLabel, styles.spaced]}>{t('inviteUser.nameLabel')}</Text>
        <View style={styles.inputWrap}>
          <MaterialIcons name="badge" size={20} color={darkColors.cyan} style={styles.inputIcon} />
          <TextInput
            testID="invite-name"
            style={styles.input}
            value={name}
            onChangeText={setName}
            placeholder={t('inviteUser.namePlaceholder')}
            placeholderTextColor={darkColors.muted}
          />
        </View>

        {/* Contact detail */}
        <Text style={[styles.sectionLabel, styles.spaced]}>{t('inviteUser.contactLabel')}</Text>
        <View style={styles.inputWrap}>
          <MaterialIcons
            name={method === 'phone' ? 'call' : 'mail'}
            size={20}
            color={darkColors.cyan}
            style={styles.inputIcon}
          />
          {method === 'phone' ? <Text style={styles.dial}>+66</Text> : null}
          <TextInput
            testID="invite-contact"
            style={styles.input}
            value={contact}
            onChangeText={setContact}
            placeholder={
              method === 'phone'
                ? t('inviteUser.phonePlaceholder')
                : t('inviteUser.emailPlaceholder')
            }
            placeholderTextColor={darkColors.muted}
            keyboardType={method === 'phone' ? 'phone-pad' : 'email-address'}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>
        <Text style={styles.helper}>
          {method === 'phone' ? t('inviteUser.otpHelper') : t('inviteUser.emailHelper')}
        </Text>

        {/* Role assignment */}
        <View style={[styles.sectionHeaderRow, styles.spaced]}>
          <Text style={styles.sectionLabel}>{t('inviteUser.roleLabel')}</Text>
          <Pressable onPress={viewPermissions} testID="invite-view-permissions">
            <Text style={styles.link}>{t('inviteUser.viewPermissions')}</Text>
          </Pressable>
        </View>
        <View style={styles.roleList}>
          {visibleRoles.map((r) => {
            const selected = role === r;
            return (
              <Pressable
                key={r}
                style={[styles.roleCard, selected && styles.roleCardActive]}
                onPress={() => setRole(r)}
                testID={`invite-role-${r}`}
                accessibilityRole="radio"
                accessibilityState={{ selected }}
              >
                <View style={styles.roleTop}>
                  <Text style={styles.roleName}>{formatRole(r)}</Text>
                  <MaterialIcons
                    name={selected ? 'check-circle' : 'radio-button-unchecked'}
                    size={18}
                    color={selected ? darkColors.cyan : darkColors.muted}
                  />
                </View>
                <Text style={styles.roleDesc}>{t(`inviteUser.roleDesc.${r}`)}</Text>
              </Pressable>
            );
          })}
        </View>
        {ROLES.length > DEFAULT_VISIBLE ? (
          <Pressable
            style={styles.showMore}
            onPress={() =>
              router.push({ pathname: '/roles-selection', params: { role: role ?? '' } })
            }
            testID="invite-show-more-roles"
          >
            <Text style={styles.showMoreText}>
              {t('inviteUser.showMore', { count: ROLES.length - DEFAULT_VISIBLE })}
            </Text>
          </Pressable>
        ) : null}

        {/* Assign projects (UI-only — createUser takes no project list) */}
        <Text style={[styles.sectionLabel, styles.spaced]}>{t('inviteUser.projectsLabel')}</Text>
        <View style={styles.inputWrap}>
          <MaterialIcons
            name="search"
            size={20}
            color={darkColors.muted}
            style={styles.inputIcon}
          />
          <TextInput
            testID="invite-project-search"
            style={styles.input}
            value={projQuery}
            onChangeText={setProjQuery}
            placeholder={t('inviteUser.projectSearch')}
            placeholderTextColor={darkColors.muted}
            autoCorrect={false}
          />
        </View>
        {projectMatches.length > 0 ? (
          <View style={styles.matches}>
            {projectMatches.map((p) => (
              <Pressable
                key={p.project_id}
                style={styles.match}
                onPress={() => {
                  setPicked((cur) => [...cur, p]);
                  setProjQuery('');
                }}
              >
                <MaterialIcons name="add" size={16} color={darkColors.cyan} />
                <Text style={styles.matchText}>{p.project_name}</Text>
              </Pressable>
            ))}
          </View>
        ) : null}
        {picked.length > 0 ? (
          <View style={styles.chips}>
            {picked.map((p) => (
              <View key={p.project_id} style={styles.chip}>
                <Text style={styles.chipText}>{p.project_name}</Text>
                <Pressable
                  onPress={() =>
                    setPicked((cur) => cur.filter((x) => x.project_id !== p.project_id))
                  }
                  accessibilityLabel={t('inviteUser.cancel')}
                >
                  <MaterialIcons name="close" size={14} color={darkColors.muted} />
                </Pressable>
              </View>
            ))}
          </View>
        ) : (
          <Text style={styles.helper}>{t('inviteUser.projectsNote')}</Text>
        )}

        {/* AI assistant panel (mockup — kept as designed) */}
        <View style={styles.aiPanel}>
          <View style={styles.aiLeft}>
            <MaterialIcons name="auto-awesome" size={22} color={darkColors.cyan} />
            <View style={styles.aiBadge}>
              <Text style={styles.aiBadgeText}>{t('inviteUser.aiConfidence')}</Text>
            </View>
          </View>
          <View style={styles.aiBody}>
            <Text style={styles.aiTitle}>{t('inviteUser.aiTitle')}</Text>
            {/* Role-aware, but no fabricated permission specifics (PO decision 2026-07-29 — name the
                selected role, drop the mockup's invented "approval rights for Payouts/Daily Reports"). */}
            <Text style={styles.aiText}>
              {role
                ? t('inviteUser.aiBodyRole', { role: formatRole(role) })
                : t('inviteUser.aiBody')}
            </Text>
          </View>
        </View>
      </ScrollView>

      {/* Footer */}
      <View style={styles.footer}>
        <Pressable
          style={[styles.sendBtn, sending && styles.sendBtnBusy]}
          onPress={onSend}
          disabled={sending}
          testID="invite-send"
          accessibilityRole="button"
        >
          {sending ? (
            <ActivityIndicator color={darkColors.onPrimary} />
          ) : (
            <>
              <Text style={styles.sendText}>{t('inviteUser.send')}</Text>
              <MaterialIcons name="send" size={20} color={darkColors.onPrimary} />
            </>
          )}
        </Pressable>
        <Pressable style={styles.cancelBtn} onPress={back} testID="invite-cancel">
          <Text style={styles.cancelText}>{t('inviteUser.cancel')}</Text>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  // paddingBottom clears the absolute footer (~164px: two buttons + padding) with a comfortable margin
  // so the last card (CORE_AI) can scroll fully clear of it instead of sitting under its edge.
  content: { padding: spacing.lg, paddingBottom: 210 },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  sectionLabel: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    letterSpacing: 0.5,
    color: darkColors.muted,
    marginBottom: spacing.sm,
  },
  sectionHint: {
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: darkColors.muted,
    opacity: 0.6,
    marginBottom: spacing.sm,
  },
  spaced: { marginTop: spacing.lg },
  toggle: {
    flexDirection: 'row',
    backgroundColor: darkColors.bg,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: darkColors.border,
    padding: 4,
    gap: 4,
  },
  toggleBtn: {
    flex: 1,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  toggleActive: {
    backgroundColor: `${darkColors.cyan}22`,
    borderWidth: 1,
    borderColor: `${darkColors.cyan}55`,
  },
  toggleText: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    color: darkColors.muted,
  },
  toggleTextActive: { color: darkColors.cyan },

  inputWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: darkColors.surface,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: darkColors.border,
    paddingHorizontal: spacing.md,
    height: touchTarget.formInput,
  },
  inputIcon: { marginRight: spacing.xs },
  dial: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
    color: darkColors.text,
    marginRight: spacing.xs,
  },
  input: {
    flex: 1,
    color: darkColors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.body.fontSize,
  },
  helper: { fontFamily: fontFamily.regular, fontSize: 11, color: darkColors.muted, marginTop: 6 },
  link: {
    fontFamily: fontFamily.semibold,
    fontSize: 11,
    color: darkColors.cyan,
    marginBottom: spacing.sm,
  },

  roleList: { gap: spacing.sm },
  roleCard: {
    backgroundColor: darkColors.surface,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderLeftWidth: 3,
    borderLeftColor: 'transparent',
    padding: spacing.md,
  },
  roleCardActive: { borderLeftColor: darkColors.cyan, backgroundColor: darkColors.elevated },
  roleTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  roleName: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    color: darkColors.primary,
  },
  roleDesc: {
    fontFamily: fontFamily.regular,
    fontSize: 12,
    lineHeight: 18,
    color: darkColors.muted,
  },
  showMore: { alignItems: 'center', paddingVertical: spacing.sm, marginTop: 4 },
  showMoreText: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: darkColors.muted,
  },

  matches: { marginTop: spacing.xs, gap: 2 },
  match: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, paddingVertical: 8 },
  matchText: {
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    color: darkColors.text,
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs, marginTop: spacing.xs },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    backgroundColor: darkColors.elevated,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: darkColors.border,
    paddingHorizontal: spacing.sm,
    paddingVertical: 6,
  },
  chipText: { fontFamily: fontFamily.regular, fontSize: 12, color: darkColors.text },

  aiPanel: {
    flexDirection: 'row',
    gap: spacing.md,
    marginTop: spacing.xl,
    backgroundColor: `${darkColors.cyan}0D`,
    borderLeftWidth: 4,
    borderLeftColor: darkColors.cyan,
    borderRadius: radius.xl,
    padding: spacing.md,
  },
  aiLeft: { alignItems: 'center', gap: spacing.xs },
  aiBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: radius.md,
    backgroundColor: `${darkColors.cyan}22`,
    borderWidth: 1,
    borderColor: `${darkColors.cyan}55`,
  },
  aiBadgeText: { fontFamily: fontFamily.bold, fontSize: 9, color: darkColors.cyan },
  aiBody: { flex: 1, gap: 4 },
  aiTitle: {
    fontFamily: fontFamily.bold,
    fontSize: 11,
    letterSpacing: 0.5,
    color: darkColors.cyan,
  },
  aiText: {
    fontFamily: fontFamily.medium,
    fontSize: 13,
    lineHeight: 18,
    color: `${darkColors.cyan}E6`,
  },

  footer: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    padding: spacing.lg,
    gap: spacing.sm,
    backgroundColor: darkColors.surface,
    borderTopWidth: 1,
    borderTopColor: darkColors.border,
  },
  sendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
    height: touchTarget.primaryButton + 8,
    borderRadius: radius.md,
    backgroundColor: darkColors.primary,
  },
  sendBtnBusy: { opacity: 0.7 },
  sendText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 0.5,
    color: darkColors.onPrimary,
  },
  cancelBtn: {
    height: touchTarget.primaryButton + 8,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: darkColors.border,
  },
  cancelText: {
    fontFamily: fontFamily.bold,
    fontSize: typography.label.fontSize,
    letterSpacing: 1,
    textTransform: 'uppercase',
    color: darkColors.muted,
  },
});
