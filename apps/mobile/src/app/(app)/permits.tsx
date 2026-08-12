// Permits — work-permit register and the Safety Officer's approval step.
//
// NO MOCKUP DRAWS THIS SCREEN. It is built in the house style of the role's other three
// (`mockup/mobile/07_safety_officer/**`) — the Active Project bar, the filter pill row, the
// left-accented cards — because the product owner chose the bar
// `Home | Incidents | Checklists | Permits` on 2026-08-13 knowing the drawing would follow later.
// When it arrives, ADR-085 makes it authoritative for STYLE; the composition here should be
// re-checked against it rather than assumed.
//
// WHY THE SLOT IS PERMITS AND NOT SOMETHING ELSE. `20 §20.7.7` gives this role exactly four pages —
// incidents, checklists, permits, compliance — and §6.4's "Permits" row grants it RW. It is also the
// only screen for the one duty master §9 assigns to this role alone: a permit is raised by a site
// worker or engineer, approved by the SAFETY_OFFICER, and finalised by the PM. Until today the role
// had no mobile surface for the step it owns.
//
// THE ONE RULE THE SERVER ENFORCES AND THIS SCREEN STATES UP FRONT: `PATCH /safety/permits/:id/
// approve` with `tier: 'SAFETY_OFFICER'` is REFUSED on a `SAFETY_PERMIT` — COS-SAFE-004, "Safety
// permits require PM (final) approval". So the Approve control is not drawn on those rows at all,
// and the row says why. Firing a request that can only 403 and reporting the failure afterwards
// would teach the officer the rule one rejection at a time.
//
// BOTH DECISIONS ARE ONLINE-ONLY. `api/safety.ts` uses `patch()`, which never enqueues: an approval
// replayed hours later would act on a state the approver did not see, and the server rejects a
// second attempt anyway (COS-SAFE-003, "only PENDING permits can be approved"). §17.4 lists no
// permit entity as offline-writable either.
//
// NO IN-CONTENT PAGE TITLE — §32.7, held by `theme/__tests__/pageTitle.spec.ts`.

import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useFocusEffect } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import {
  approvePermit,
  createPermit,
  listPermits,
  rejectPermit,
  type PermitRow,
  type PermitType,
} from '../../api/safety';
import {
  canSafetyOfficerApprove,
  canSafetyOfficerReject,
  permitStatusTone,
  sortPermits,
  type Tone,
} from '../../lib/safetyOfficer';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { ProjectContextBar } from '../../components/ProjectContextBar';
import { useProjectStore } from '../../store/projectStore';
import { useI18n } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';

/** The four §11 permit types, in the order the DTO's enum lists them. */
const PERMIT_TYPES: readonly PermitType[] = [
  'WORK_PERMIT',
  'SAFETY_PERMIT',
  'DRAWING_APPROVAL',
  'ENTRY_PERMIT',
];

export default function PermitsScreen(): React.JSX.Element {
  const projectId = useProjectStore((s) => s.active?.projectId ?? '');
  const { t, formatDate } = useI18n();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);

  const [permits, setPermits] = useState<PermitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingOnly, setPendingOnly] = useState(false);
  const [composing, setComposing] = useState(false);
  const [permitType, setPermitType] = useState<PermitType>('WORK_PERMIT');
  const [permitNumber, setPermitNumber] = useState('');

  const load = useCallback(() => {
    let cancelled = false;
    setLoading(true);
    listPermits(projectId ? { projectId } : undefined)
      .then((rows) => {
        if (!cancelled) setPermits(rows);
      })
      .catch(() => {
        /* offline — keep the last list; permits are not cached locally (§17.4) */
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useFocusEffect(load);

  const toneColour = (tone: Tone): string => {
    if (tone === 'danger') return p.danger;
    if (tone === 'warning') return p.warning;
    if (tone === 'success') return p.success;
    return p.muted;
  };

  const visible = sortPermits(
    pendingOnly ? permits.filter((permit) => permit.status === 'PENDING') : permits,
  );
  const canSubmit = projectId !== '' && permitNumber.trim() !== '';

  /** One shared handler — approve and reject differ only in which call they make. */
  const decide = (permit: PermitRow, approve: boolean): void => {
    const call = approve ? approvePermit(permit.permit_id) : rejectPermit(permit.permit_id);
    void call
      .then(() => load())
      .catch(() => {
        Alert.alert(
          t(approve ? 'safety.permits.approve' : 'safety.permits.reject'),
          t('safety.permits.decisionFailed'),
        );
      });
  };

  const onCreate = (): void => {
    void createPermit({
      project_id: projectId,
      permit_type: permitType,
      permit_number: permitNumber.trim(),
    })
      .then(() => {
        setPermitNumber('');
        setComposing(false);
        load();
      })
      .catch(() => {
        Alert.alert(t('safety.permits.create'), t('safety.permits.createFailed'));
      });
  };

  const validity = (permit: PermitRow): string =>
    permit.valid_from && permit.valid_until
      ? t('safety.permits.validity', {
          from: formatDate(permit.valid_from),
          until: formatDate(permit.valid_until),
        })
      : t('safety.permits.noValidity');

  return (
    <View testID="permits-screen" style={styles.root}>
      <ScrollView contentContainerStyle={styles.page}>
        <ProjectContextBar />

        {/* Both pills are real queries — `status` is an enum the endpoint filters on. */}
        <View style={styles.filterRow}>
          {[false, true].map((only) => (
            <Pressable
              key={only ? 'pending' : 'all'}
              testID={`permit-filter-${only ? 'pending' : 'all'}`}
              accessibilityRole="radio"
              accessibilityState={{ selected: pendingOnly === only }}
              onPress={() => setPendingOnly(only)}
              style={[
                styles.filterButton,
                {
                  backgroundColor: pendingOnly === only ? p.primary : p.surface,
                  borderColor: pendingOnly === only ? p.primary : p.border,
                },
              ]}
            >
              <Text
                style={[
                  styles.filterLabel,
                  { color: pendingOnly === only ? p.onPrimary : p.muted },
                ]}
              >
                {t(only ? 'safety.permits.filterPending' : 'safety.permits.filterAll')}
              </Text>
            </Pressable>
          ))}
        </View>

        {composing ? (
          <View testID="permit-composer" style={styles.composer}>
            <Text style={styles.fieldLabel}>{t('safety.permits.typeLabel')}</Text>
            <View style={styles.typeRow}>
              {PERMIT_TYPES.map((type) => {
                const on = permitType === type;
                return (
                  <TouchableOpacity
                    key={type}
                    testID={`permit-type-${type}`}
                    accessibilityRole="radio"
                    accessibilityState={{ selected: on }}
                    onPress={() => setPermitType(type)}
                    style={[
                      styles.typeOption,
                      {
                        borderColor: on ? p.primary : p.border,
                        backgroundColor: on ? p.primary : p.surface,
                      },
                    ]}
                  >
                    <Text style={[styles.filterLabel, { color: on ? p.onPrimary : p.muted }]}>
                      {t(`safety.permits.type.${type}`)}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <TextInput
              testID="permit-number-input"
              style={styles.input}
              placeholder={t('safety.permits.numberPlaceholder')}
              placeholderTextColor={p.muted}
              value={permitNumber}
              onChangeText={setPermitNumber}
            />
            {/* Validity dates are optional on the DTO and this form does not collect them — there is
                no date control in the app's component set (§32.7), and inventing one here would be a
                new pattern introduced on the screen least able to justify it. */}
            <Text style={styles.muted}>{t('safety.permits.validityOmitted')}</Text>
            {projectId === '' ? (
              <Text testID="permit-needs-project" style={styles.muted}>
                {t('safety.permits.needsProject')}
              </Text>
            ) : null}
            <TouchableOpacity
              testID="create-permit-button"
              accessibilityRole="button"
              accessibilityLabel={t('safety.permits.create')}
              onPress={onCreate}
              disabled={!canSubmit}
              style={[styles.primaryButton, !canSubmit && styles.disabled]}
            >
              <Text style={styles.primaryButtonText}>{t('safety.permits.create')}</Text>
            </TouchableOpacity>
          </View>
        ) : null}

        <LoadingBoundary loading={loading} variant="list" theme={isDark ? 'dark' : 'light'}>
          <View testID="permit-list" style={styles.feed}>
            {visible.length === 0 ? (
              <Text style={styles.muted}>{t('safety.permits.empty')}</Text>
            ) : (
              visible.map((permit) => {
                const tone = toneColour(permitStatusTone(permit.status));
                const approvable = canSafetyOfficerApprove(permit);
                const rejectable = canSafetyOfficerReject(permit);
                return (
                  <View
                    key={permit.permit_id}
                    testID="permit-item"
                    style={[styles.card, { borderLeftColor: tone }]}
                  >
                    <View style={styles.cardHead}>
                      <Text style={[styles.eyebrow, { color: tone }]}>
                        {t(`safety.permits.type.${permit.permit_type}`)}
                      </Text>
                      <View style={[styles.statusPill, { borderColor: tone }]}>
                        <Text style={[styles.statusText, { color: tone }]}>{permit.status}</Text>
                      </View>
                    </View>
                    <Text style={styles.title} numberOfLines={1}>
                      {permit.permit_number}
                    </Text>
                    <Text style={styles.muted}>{validity(permit)}</Text>

                    {/* master §9: a SAFETY_PERMIT is finalised by the PM, so this role is not offered
                        the control. Said before the tap, not as a 403 after it. */}
                    {permit.status === 'PENDING' && !approvable ? (
                      <View style={styles.noticeRow}>
                        <MaterialIcons name="info-outline" size={16} color={p.muted} />
                        <Text style={styles.muted} numberOfLines={2}>
                          {t('safety.permits.pmFinal')}
                        </Text>
                      </View>
                    ) : null}

                    {rejectable ? (
                      <View style={styles.actionRow}>
                        {approvable ? (
                          <TouchableOpacity
                            testID={`permit-approve-${permit.permit_id}`}
                            accessibilityRole="button"
                            accessibilityLabel={t('safety.permits.approve')}
                            onPress={() => decide(permit, true)}
                            style={[styles.action, { borderColor: p.success }]}
                          >
                            <MaterialIcons name="check" size={16} color={p.success} />
                            <Text style={[styles.actionText, { color: p.success }]}>
                              {t('safety.permits.approve')}
                            </Text>
                          </TouchableOpacity>
                        ) : null}
                        <TouchableOpacity
                          testID={`permit-reject-${permit.permit_id}`}
                          accessibilityRole="button"
                          accessibilityLabel={t('safety.permits.reject')}
                          onPress={() => decide(permit, false)}
                          style={[styles.action, { borderColor: p.danger }]}
                        >
                          <MaterialIcons name="close" size={16} color={p.danger} />
                          <Text style={[styles.actionText, { color: p.danger }]}>
                            {t('safety.permits.reject')}
                          </Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </View>
                );
              })
            )}
          </View>
        </LoadingBoundary>
      </ScrollView>

      <TouchableOpacity
        testID="permit-fab"
        accessibilityRole="button"
        accessibilityLabel={t(composing ? 'common.back' : 'safety.permits.create')}
        onPress={() => setComposing((open) => !open)}
        style={[styles.fab, { backgroundColor: p.primary }]}
      >
        <MaterialIcons name={composing ? 'close' : 'add'} size={28} color={p.onPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: p.bg },
    page: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl * 3 },
    filterRow: { flexDirection: 'row', gap: spacing.xs },
    // A BUTTON, not a badge — see the same note on the incidents screen. `badgeRadius.spec.ts` reads
    // style NAMES, and a segmented control called `pill` would be held to the status-pill radius.
    filterButton: {
      minHeight: touchTarget.secondaryButton,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    filterLabel: { fontSize: typography.label.fontSize, fontFamily: fontFamily.semibold },
    composer: {
      gap: spacing.sm,
      padding: spacing.md,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    typeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
    // NOT `typeChip` — that name is a documented exception in `badgeRadius.spec.ts` pinned to
    // `radius.lg` for the Site Worker's 48px issue-category CARD. This is a small selection chip and
    // takes the pill radius, like the severity chips beside it.
    typeOption: {
      minHeight: touchTarget.secondaryButton,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    input: {
      minHeight: touchTarget.formInput,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.md,
      backgroundColor: p.elevated,
      color: p.text,
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.regular,
    },
    fieldLabel: {
      color: p.muted,
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    primaryButton: {
      minHeight: touchTarget.primaryButton + 4,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.md,
      backgroundColor: p.primary,
    },
    primaryButtonText: {
      color: p.onPrimary,
      fontSize: typography.body.fontSize,
      fontFamily: fontFamily.semibold,
      textTransform: 'uppercase',
    },
    disabled: { opacity: 0.5 },
    feed: { gap: spacing.sm },
    card: {
      gap: spacing.xs / 2,
      padding: spacing.sm,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      backgroundColor: p.surface,
    },
    cardHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    eyebrow: {
      fontSize: 10,
      fontFamily: fontFamily.bold,
      letterSpacing: 1.2,
      textTransform: 'uppercase',
    },
    statusPill: {
      borderWidth: 1,
      borderRadius: radius.xl,
      paddingHorizontal: spacing.xs,
      paddingVertical: 1,
    },
    statusText: { fontSize: 10, fontFamily: fontFamily.bold, letterSpacing: 0.5 },
    title: {
      color: p.text,
      fontSize: typography.caption.fontSize,
      fontFamily: fontFamily.semibold,
    },
    noticeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      marginTop: spacing.xs / 2,
    },
    actionRow: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs },
    action: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs / 2,
      minHeight: touchTarget.secondaryButton,
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    actionText: {
      fontSize: typography.label.fontSize,
      fontFamily: fontFamily.semibold,
      textTransform: 'uppercase',
    },
    muted: { color: p.muted, fontSize: typography.label.fontSize, fontFamily: fontFamily.regular },
    fab: {
      position: 'absolute',
      right: spacing.md,
      bottom: spacing.xl,
      width: 56,
      height: 56,
      borderRadius: 999,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.45,
      shadowRadius: 12,
      elevation: 8,
    },
  });
