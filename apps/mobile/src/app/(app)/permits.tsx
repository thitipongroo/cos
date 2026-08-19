// Permits — the work-permit register and the Safety Officer's approval step.
//
// Reference mockup: `mockup/mobile/07_safety_officer/04_permit_management/01_sa_permit_dashboard/`.
//
// THIS FILE'S HEADER USED TO SAY "NO MOCKUP DRAWS THIS SCREEN", AND THAT WAS TRUE WHEN WRITTEN. The
// screen was built on 2026-08-13 in the house style of the role's other three because the product
// owner had chosen the bar `Home | Incidents | Checklists | Permits` knowing the drawing would follow.
// It followed the same day, on a PARALLEL BRANCH: the permit mockups landed in 82ad50c7 and reached
// this branch only at the merge 377c361a, which is AFTER the commit that built the screen
// (`git merge-base --is-ancestor 82ad50c7 d1011d84` → false). The old header anticipated exactly this
// and asked for the composition to be re-checked against the drawing rather than assumed; that
// re-check is this rewrite.
//
// WHY THE SLOT IS PERMITS. `20 §20.7.7` gives this role four pages — incidents, checklists, permits,
// compliance — and §6.4's "Permits" row grants it RW. It is also the only screen for the one duty
// master §9 assigns to this role alone: a permit is raised by a site worker or engineer, approved by
// the SAFETY_OFFICER, and finalised by the PM.
//
// WHAT THE DRAWING GAVE THIS SCREEN, AND THE FOUR PLACES IT COULD NOT BE FOLLOWED (ADR-085 makes the
// mockup authoritative for STYLE; each departure below is a data fact, not a preference):
//
//   TYPE TABS — the drawing has three (Work Permits · Safety Permits · Drawing Approvals). There are
//     FOUR permit types in the CHECK constraint and in CreatePermitDto, and the request form can file
//     all four, so a three-tab bar would make every ENTRY_PERMIT unreachable. Five tabs are drawn:
//     ALL plus the four. See PERMIT_TYPE_FILTERS in lib/safetyOfficer.ts.
//   THE PENDING PILL is KEPT beside them although the drawing has no such control. It is a real query
//     (`status` is an enum the endpoint filters on), it predates the drawing, and it answers the
//     question this role actually opens the screen with — what needs a decision from me. ADR-085: a
//     drawing does not remove reviewed working capability.
//   EXPIRY reads in DAYS, not the drawing's "04h 22m". `valid_until` is a Postgres DATE — the column
//     has no time part, so an hours-and-minutes countdown could only be manufactured.
//   "SYNCED 2M AGO" IS GONE. §17.4 lists no permit as offline-cached, so this screen has nothing to
//     say about a per-row sync age; the TopBar's <SyncPill /> already carries the app's sync state,
//     and a row claiming it synced two minutes ago would simply be false.
//
// DRAWN AND MARKED NOT-AVAILABLE (product-owner ruling 2026-08-13, the same treatment the role's
// other three screens already use): the "Safety Analysis" predictive banner and the per-card "AI
// Check" line — there is no safety AI surface in this platform (`/ai/reports/*` covers site,
// procurement, executive and delay-risk; SafetyVisionModel is Phase 23 and untrained, §22.6) and
// §22.3 forbids a placeholder reading as AI-derived — and the AUTO-REJECT countdown, which is a
// scheduled job this product does not have rather than a column it is missing.
//
// THE ONE RULE THE SERVER ENFORCES AND THIS SCREEN STATES UP FRONT: `PATCH /safety/permits/:id/
// approve` with `tier: 'SAFETY_OFFICER'` is REFUSED on a `SAFETY_PERMIT` — COS-SAFE-004, "Safety
// permits require PM (final) approval". So the Approve control is not drawn on those rows at all, and
// the row says why. Firing a request that can only 403 would teach the officer the rule one rejection
// at a time.
//
// BOTH DECISIONS ARE ONLINE-ONLY. `api/safety.ts` uses `patch()`, which never enqueues: an approval
// replayed hours later would act on a state the approver did not see, and the server rejects a second
// attempt anyway (COS-SAFE-003). §17.4 lists no permit entity as offline-writable either.
//
// NO IN-CONTENT PAGE TITLE — §32.7, held by `theme/__tests__/pageTitle.spec.ts`.

import { useCallback, useMemo, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Pressable,
  ScrollView,
  StyleSheet,
  Alert,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { approvePermit, listPermits, rejectPermit, type PermitRow } from '../../api/safety';
import {
  applyPermitFilters,
  canSafetyOfficerApprove,
  canSafetyOfficerReject,
  permitExpiry,
  permitStatusTone,
  PERMIT_TYPE_FILTERS,
  type PermitTypeFilter,
  type Tone,
} from '../../lib/safetyOfficer';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { ProjectContextBar } from '../../components/ProjectContextBar';
import { UnavailableNote } from '../../components/UnavailableNote';
import { useProjectStore } from '../../store/projectStore';
import { useI18n } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';
import { screenChrome } from '../../theme/screenStyles';
import { Fab } from '../../components/Fab';

export default function PermitsScreen(): React.JSX.Element {
  const router = useRouter();
  const projectId = useProjectStore((s) => s.active?.projectId ?? '');
  const { t, formatDate } = useI18n();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);

  const [permits, setPermits] = useState<PermitRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<PermitTypeFilter['id']>('all');
  const [pendingOnly, setPendingOnly] = useState(false);

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

  const visible = applyPermitFilters(permits, { type: typeFilter, pendingOnly });

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

  /** The drawing's EXPIRY cell, in the units the DATE column can actually support. */
  const expiryLabel = (permit: PermitRow): string => {
    const expiry = permitExpiry(permit.valid_until, new Date());
    if (expiry === null) return t('safety.permits.noValidity');
    if (expiry.state === 'today') return t('safety.permits.expiryToday');
    return t(
      expiry.state === 'remaining' ? 'safety.permits.expiryIn' : 'safety.permits.expiryOverdue',
      { days: String(expiry.days) },
    );
  };

  const expiryTone = (permit: PermitRow): string => {
    const expiry = permitExpiry(permit.valid_until, new Date());
    if (expiry === null) return p.muted;
    if (expiry.state === 'overdue') return p.danger;
    return expiry.state === 'today' ? p.warning : p.success;
  };

  return (
    <View testID="permits-screen" style={styles.root}>
      <ScrollView contentContainerStyle={styles.page}>
        <ProjectContextBar />

        {/* The drawing's "Safety Analysis" predictive banner — drawn, with no safety AI behind it. */}
        <UnavailableNote
          testID="permits-ai-unavailable"
          reason={t('safety.permits.aiUnavailable')}
        />

        {/* TYPE TABS — five, because the enum has four types (see the header). */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false}>
          <View style={styles.filterRow}>
            {PERMIT_TYPE_FILTERS.map((filter) => {
              const on = typeFilter === filter.id;
              return (
                <Pressable
                  key={filter.id}
                  testID={`permit-type-tab-${filter.id}`}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: on }}
                  onPress={() => setTypeFilter(filter.id)}
                  style={[
                    styles.filterButton,
                    {
                      backgroundColor: on ? p.primary : p.surface,
                      borderColor: on ? p.primary : p.border,
                    },
                  ]}
                >
                  <Text style={[styles.filterLabel, { color: on ? p.onPrimary : p.muted }]}>
                    {t(filter.labelKey)}
                  </Text>
                </Pressable>
              );
            })}
          </View>
        </ScrollView>

        {/* The status pill the drawing has no equivalent for, kept because it is what this role
            opens the screen to ask. Both values are real queries. */}
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
                  <View key={permit.permit_id} testID="permit-item" style={styles.card}>
                    {/* The drawing's full-width status strip along the top of the card. */}
                    <View style={[styles.accent, { backgroundColor: tone }]} />
                    <View style={styles.cardBody}>
                      <View style={styles.cardHead}>
                        <View style={styles.grow}>
                          <Text style={styles.eyebrow} numberOfLines={1}>
                            {t('safety.permits.idPrefix', { number: permit.permit_number })}
                          </Text>
                          <Text style={styles.title} numberOfLines={2}>
                            {t(`safety.permits.type.${permit.permit_type}`)}
                          </Text>
                        </View>
                        <View style={[styles.statusPill, { borderColor: tone }]}>
                          <Text style={[styles.statusText, { color: tone }]}>{permit.status}</Text>
                        </View>
                      </View>

                      {/* The drawing's two-column meta grid: CONTRACTOR | EXPIRY. */}
                      <View style={styles.metaRow}>
                        <View style={styles.grow}>
                          <Text style={styles.metaLabel}>{t('safety.permits.contractor')}</Text>
                          <Text style={styles.metaValue} numberOfLines={1}>
                            {permit.contractor_name ?? t('safety.permits.noContractor')}
                          </Text>
                        </View>
                        <View style={styles.metaRight}>
                          <Text style={styles.metaLabel}>{t('safety.permits.expiry')}</Text>
                          <Text style={[styles.metaValue, { color: expiryTone(permit) }]}>
                            {expiryLabel(permit)}
                          </Text>
                        </View>
                      </View>

                      {permit.valid_from !== null && permit.valid_until !== null ? (
                        <Text style={styles.muted}>
                          {t('safety.permits.validity', {
                            from: formatDate(permit.valid_from),
                            until: formatDate(permit.valid_until),
                          })}
                        </Text>
                      ) : null}

                      {/* The drawing prints a REASON on its revoked card, and now there is one. */}
                      {permit.revoke_reason !== null ? (
                        <View style={styles.metaRight}>
                          <Text style={styles.metaLabel}>{t('safety.permits.reason')}</Text>
                          <Text style={[styles.metaValue, { color: p.danger }]}>
                            {permit.revoke_reason}
                          </Text>
                        </View>
                      ) : null}

                      {permit.description !== null ? (
                        <Text style={styles.muted} numberOfLines={3}>
                          {permit.description}
                        </Text>
                      ) : null}

                      {/* Drawn on the drawing's pending card as "AI Check: Safety conflict detected",
                          and drawn here as what it is. Only on PENDING, where the drawing puts it. */}
                      {permit.status === 'PENDING' ? (
                        <UnavailableNote
                          testID={`permit-ai-check-${permit.permit_id}`}
                          variant="inline"
                          reason={t('safety.permits.aiCheckUnavailable')}
                        />
                      ) : null}

                      {/* master §9: a SAFETY_PERMIT is finalised by the PM, so this role is not
                          offered the control. Said before the tap, not as a 403 after it. */}
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
                  </View>
                );
              })
            )}
          </View>
        </LoadingBoundary>
      </ScrollView>

      {/* The drawing's FAB. It opens the request SCREEN now — the inline composer this screen used
          to unfold collected a type and a number, which is a fraction of what the form collects. */}
      <Fab
        testID="permit-fab"
        accessibilityLabel={t('safety.permits.create')}
        onPress={() => router.push('/permit-request')}
      />
    </View>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    ...screenChrome(p),
    filterRow: { flexDirection: 'row', gap: spacing.xs, paddingVertical: spacing.xs / 2 },
    // A BUTTON, not a badge — `badgeRadius.spec.ts` reads style NAMES, and a segmented control
    // called `pill` would be held to the status-pill radius.
    filterButton: {
      minHeight: touchTarget.secondaryButton,
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
      borderRadius: radius.md,
      borderWidth: 1,
    },
    filterLabel: { fontSize: typography.label.fontSize, fontFamily: fontFamily.semibold },
    feed: { gap: spacing.sm },
    card: {
      overflow: 'hidden',
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    // The drawing's `h-1` status strip. A TOP edge, not the leading one this screen used before the
    // drawing arrived.
    accent: { height: 4 },
    cardBody: { gap: spacing.xs, padding: spacing.sm },
    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
    eyebrow: {
      color: p.muted,
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
    metaRow: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs / 2 },
    metaRight: { alignItems: 'flex-end' },
    metaLabel: {
      color: p.muted,
      fontSize: 10,
      fontFamily: fontFamily.medium,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    metaValue: {
      color: p.text,
      fontSize: typography.label.fontSize,
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
  });
