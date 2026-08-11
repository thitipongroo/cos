// Which site am I on today — an OVERLAY, not a page
// (mockup 05_site_worker/01_home/00_sw_project_selection).
//
// IT WAS A ROUTE FOR ONE BUILD, AND THAT WAS THE WRONG SHAPE (PO decision 2026-08-11: "ต้องการให้
// เป็น overlay แบบเดียวกับ quick action"). A route gets the app's shared TopBar, whose leading
// control is a back chevron, and the shell had to keep redirecting the worker back into it — a loop
// they can see and feel. An overlay has no chevron to answer for.
//
// ALWAYS CLOSEABLE (PO decision 2026-08-11, revising the same day's first cut). It shipped with no
// close control until a site was chosen, on the reasoning that the question has to be answered. The
// product owner's call is that it does not: closing with nothing chosen leaves the app on Home with
// nothing to show, which is an honest empty screen and a state the worker can get themselves out of
// by tapping the bar. A modal with no way out is worse than an empty page — it is the only screen in
// the app you cannot leave, and it would trap anyone who opened the app to check something else.
//
// So closing means "never mind", in both directions:
//   a site already chosen → it stays chosen; the screens behind carry on showing it
//   no site chosen yet    → nothing is selected, and Home shows its empty state
//
// Chrome copied from <QuickActionsMenu />, deliberately: these are the same surface to the person
// using them, opened from the same bar, and two overlays in one role that draw their headers
// differently read as two different apps. Dark on both themes, as that one is — an overlay is not
// the page under it.
//
// ONLY THE WORKER'S OWN PROJECTS. `GET /projects/mine` is JWT-scoped to `project_members`, so the
// list is the sites this person is actually assigned to — not every site in the tenant. A picker
// offering a project someone cannot open would be a list of doors that do not turn.
//
// THE STATUS CHIP IS THE PROJECT'S OWN: `ProjectStatus` is DRAFT · ACTIVE · ON_HOLD · COMPLETED ·
// CANCELLED, and the tone comes from lib/projectStatusTone.ts so this sheet, the manager's project
// cards and StatusChip cannot disagree about what green means.
//
// The drawing's location line under each name is the project's BUILDING (PO decision 2026-08-11).
// There is no zone field on a project or a membership; the building is the narrowest real location
// the data has, and a project without one shows its code instead of an invented place.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Modal,
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { getMyProjects, type MyProject } from '../api/projects';
import { projectStatusTone } from '../lib/projectStatusTone';
import { useAuthStore } from '../store/authStore';
import { useProjectStore } from '../store/projectStore';
import { useI18n } from '../i18n';
import { BrandLogo } from './BrandLogo';
import { OverlaySyncPill } from './OverlaySyncPill';
import { darkColors, fontFamily, radius, spacing, touchTarget, typography } from '../theme/tokens';

/**
 * The picker overlay.
 *
 * Mounted once, in the Site Worker's shell. It decides for itself whether it is up and whether it
 * can be closed, from the store — so the context bar, the quick-actions sheet and the shell all ask
 * for the same thing in the same way and cannot disagree about which case they are in.
 */
export function SelectProjectSheet(): React.JSX.Element {
  // `statusLabel` is the same helper StatusChip uses, so a status reads one way across the app —
  // and never as the raw enum, which is what this list printed at first ("ON_HOLD").
  const { t, statusLabel } = useI18n();

  const active = useProjectStore((s) => s.active);
  const select = useProjectStore((s) => s.select);
  const pickerOpen = useProjectStore((s) => s.pickerOpen);
  const closePicker = useProjectStore((s) => s.closePicker);
  const openPicker = useProjectStore((s) => s.openPicker);

  // OFFERED ONCE, NOT HELD OPEN. A worker with no site chosen is shown the picker the first time
  // this mounts — every Site Worker screen is reachable directly, from a tab, a notification or the
  // E2E deep link, so the offer is made in the shell rather than on Home. After that it is theirs to
  // open: re-raising it on every render would make the close button do nothing, which is the
  // no-way-out modal by another name.
  const offered = useRef(false);
  useEffect(() => {
    if (offered.current) return;
    offered.current = true;
    if (active === null) openPicker();
  }, [active, openPicker]);

  const visible = pickerOpen;

  const [projects, setProjects] = useState<MyProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);
  const [query, setQuery] = useState('');

  // KEYED ON THE ACCESS TOKEN, not on mount alone.
  //
  // The shell shows this the moment the role is known, which can be before the token has been
  // written to the store — the request then goes out unauthenticated, comes back 401, and the sheet
  // (which never loses focus, being the first thing shown) had nothing to make it try again. It
  // failed the same way twice in a row on the capture rig before the cause was found. Re-running
  // when the token arrives fixes the race itself rather than bolting a retry on top of it.
  const token = useAuthStore((s) => s.accessToken);

  useEffect(() => {
    if (!visible) return;
    let cancelled = false;
    setFailed(false);
    getMyProjects()
      .then((rows) => {
        if (!cancelled) setProjects(rows);
      })
      .catch(() => {
        // The list is the whole sheet, so a failure must not read as "you are on no sites".
        if (!cancelled) setFailed(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [token, visible]);

  // Name or code, case-insensitively — a worker searching types either.
  const shown = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (needle === '') return projects;
    return projects.filter(
      (row) =>
        row.project_name.toLowerCase().includes(needle) ||
        row.project_code.toLowerCase().includes(needle),
    );
  }, [projects, query]);

  /**
   * A site that is not running cannot be entered (PO decision 2026-08-11).
   *
   * The drawing greys the On Hold card and this makes that mean something: work has stopped there,
   * so there is no shift to log, no task to progress and no checklist to sign. The card still
   * appears — a worker assigned to a paused site should see that it is paused, not that it vanished.
   */
  const selectable = (status: string): boolean => projectStatusTone(status) === 'success';

  const choose = useCallback(
    (row: MyProject) => {
      void select({
        projectId: row.project_id,
        projectCode: row.project_code,
        projectName: row.project_name,
        buildingName: row.building_name ?? null,
      });
      // No navigation: `select` closes the sheet, and whatever screen was underneath is now showing
      // the site just chosen. The route version had to `replace('/home')` here, which threw away
      // wherever the worker actually was.
    },
    [select],
  );

  const toneColor = (status: string): string => {
    const tone = projectStatusTone(status);
    return tone === 'success'
      ? darkColors.success
      : tone === 'warning'
        ? darkColors.warning
        : darkColors.muted;
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      // Android's back gesture closes it, the same as the X — the two are the same intent.
      onRequestClose={closePicker}
    >
      <View style={styles.root} testID="select-project-screen">
        <View style={styles.topbar}>
          <BrandLogo variant="dark" height={26} />
          <View style={styles.topRight}>
            <OverlaySyncPill testID="select-project-sync-pill" />
            <Pressable
              testID="select-project-close"
              onPress={closePicker}
              accessibilityRole="button"
              accessibilityLabel={t('quickAdd.close')}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              style={styles.closeBtn}
            >
              <MaterialIcons name="close" size={24} color={darkColors.primary} />
            </Pressable>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.search}>
            <MaterialIcons name="search" size={20} color={darkColors.muted} />
            <TextInput
              testID="select-project-search"
              value={query}
              onChangeText={setQuery}
              placeholder={t('project.select.searchPlaceholder')}
              placeholderTextColor={darkColors.muted}
              style={styles.searchInput}
              accessibilityLabel={t('project.select.searchPlaceholder')}
            />
          </View>

          {loading ? (
            <ActivityIndicator testID="select-project-loading" color={darkColors.primary} />
          ) : null}

          {!loading && failed ? (
            <Text testID="select-project-failed" style={styles.notice}>
              {t('project.select.loadFailed')}
            </Text>
          ) : null}

          {!loading && !failed && projects.length === 0 ? (
            <Text testID="select-project-empty" style={styles.notice}>
              {t('project.select.none')}
            </Text>
          ) : null}

          {!loading && !failed && projects.length > 0 && shown.length === 0 ? (
            <Text testID="select-project-no-match" style={styles.notice}>
              {t('project.select.noMatch', { query: query.trim() })}
            </Text>
          ) : null}

          {shown.map((row) => {
            const current = active?.projectId === row.project_id;
            return (
              <Pressable
                key={row.project_id}
                testID={`select-project-${row.project_id}`}
                accessibilityRole="button"
                accessibilityLabel={row.project_name}
                disabled={!selectable(row.status)}
                accessibilityState={{ disabled: !selectable(row.status) }}
                onPress={() => choose(row)}
                style={[
                  styles.card,
                  { borderLeftColor: current ? darkColors.accent : darkColors.border },
                  !selectable(row.status) && styles.cardDisabled,
                ]}
              >
                <View style={styles.cardBody}>
                  <View style={styles.cardHead}>
                    {current ? (
                      <View style={styles.currentChip}>
                        <Text style={styles.currentText}>{t('project.select.current')}</Text>
                      </View>
                    ) : null}
                    <Text style={styles.code}>{row.project_code}</Text>
                  </View>
                  <Text style={styles.name} numberOfLines={1}>
                    {row.project_name}
                  </Text>
                  <View style={styles.locationRow}>
                    <MaterialIcons name="location-on" size={14} color={darkColors.muted} />
                    <Text style={styles.location} numberOfLines={1}>
                      {row.building_name ?? row.project_code}
                    </Text>
                  </View>
                </View>

                <View style={styles.statusBlock}>
                  <Text style={styles.statusLabel}>{t('project.select.status')}</Text>
                  {/* The drawing's status glyph: a tick for a running site, a clock for a paused one. */}
                  <View style={styles.statusRow}>
                    <MaterialIcons
                      name={selectable(row.status) ? 'check-circle' : 'schedule'}
                      size={14}
                      color={toneColor(row.status)}
                    />
                    <Text style={[styles.status, { color: toneColor(row.status) }]}>
                      {statusLabel(row.status)}
                    </Text>
                  </View>
                </View>
                {/* NO ARROW on a paused site (PO decision 2026-08-11). The card cannot be entered,
                    and an arrow is a promise that it can — a dimmed one still points somewhere. */}
                {selectable(row.status) ? (
                  <MaterialIcons name="arrow-forward" size={20} color={darkColors.muted} />
                ) : null}
              </Pressable>
            );
          })}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: darkColors.bg },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    paddingTop: spacing.xl,
    paddingBottom: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: darkColors.border,
  },
  topRight: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  closeBtn: { padding: spacing.xs },

  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },

  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touchTarget.secondaryButton,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: darkColors.border,
    backgroundColor: darkColors.surface,
  },
  searchInput: {
    flex: 1,
    color: darkColors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    paddingVertical: spacing.xs,
  },

  notice: {
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },

  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderLeftWidth: 4,
    backgroundColor: darkColors.surface,
  },
  cardBody: { flex: 1, gap: spacing.xs / 2 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  currentChip: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
    borderRadius: radius.xl,
    backgroundColor: darkColors.accent,
  },
  currentText: {
    color: darkColors.bg,
    fontFamily: fontFamily.bold,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  code: {
    color: darkColors.muted,
    fontFamily: fontFamily.medium,
    fontSize: typography.label.fontSize,
  },
  name: {
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
  },
  locationRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  location: {
    flex: 1,
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
  },

  // Dimmed, not hidden: a paused site the worker is assigned to should read as paused.
  cardDisabled: { opacity: 0.55 },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  statusBlock: { alignItems: 'flex-end', gap: 2 },
  statusLabel: {
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: 10,
  },
  status: {
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
  },
});
