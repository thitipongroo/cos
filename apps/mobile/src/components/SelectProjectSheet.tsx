// Which site am I on today — an OVERLAY, not a page.
//
// THIS IS THE PROJECT'S ONE PROJECT-SELECTION SHAPE (PO decision 2026-08-12). Two drawings define
// it — 05_site_worker/01_home/00_sw_project_selection and 03_site_engineer/01_home/
// 00_project_selection — and the second one, added in that role's 2026-08-11 restructure, is the
// one the styling now follows. Every role that has to answer "which site am I on" gets this
// component; a second picker drawn a second way is how two roles end up in two different apps.
//
// A CENTRED CARD ON A DIMMED BACKDROP, not a full-bleed dark page. That is the visible change the
// SITE_ENGINEER drawing makes and the reason it was adopted as the standard: `fixed inset-0 …
// bg-black/60 backdrop-blur-sm` behind, and a `max-w-lg rounded-xl border shadow-2xl max-h-[90vh]`
// container in front. The page underneath stays legible around the edges, which is what tells the
// user this is a question about the app rather than a new place inside it. It rendered full-screen
// until 2026-08-12 and read as a route — the exact confusion the overlay decision below was making.
//
// ONE THING THE DRAWING SHOWS THAT THIS DOES NOT COMPUTE, and why (ADR-085 — style is the mockup's,
// composition and truth are not):
//   - THE "RECOMMENDED" CARD's "CRITICAL PATH RISK DETECTED · Conf: 98% · SOURCE: REAL-TIME
//     TELEMETRY". Nothing in the product can produce any of it. Critical-path risk would come from
//     a model that does not exist; the closest, DelayForecastModel, is Phase 23 and needs 90+ days
//     of production data (§22.6), and real-time telemetry is IoT, Phase 24. Drawing a confidence
//     figure the platform cannot compute is the one thing §22.3 is most explicit about — a surface
//     must not be described as AI-derived while a placeholder is serving it. The PANEL is rendered,
//     as a declared future feature with none of those figures — see its own note further down.
// The status chip, the left accent strip, the location line, the progress bar and the search are all
// real, and are what this renders.
//
// THE PROGRESS BAR IS REAL AS OF 2026-08-12 (PO decision: "1d. เพิ่ม field progress"), and it took a
// server change to make it so. It could not be drawn before: `GET /projects/mine` carried no
// progress, and the figure lived only in `GET /projects/:id/progress` — a per-project aggregate that
// is deliberately not cached offline and throws when offline, so a list of N sites would have meant
// N requests on open and an error state on a plane, on the first screen a worker with no site
// selected sees. `project.repository.listByMember` now aggregates it in the SAME query as the list,
// by the same §32.12 formula, so the bar costs no extra round trip at all.
// NULL IS NOT ZERO: a project with no BOQ-linked task has no measurable progress, and that card
// draws a dash instead of an empty bar — "not measurable" and "nothing done" are different facts.
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
import { progressBarWidth } from '../lib/siteEngineerHome';
import { useAuthStore } from '../store/authStore';
import { useProjectStore } from '../store/projectStore';
import { useI18n } from '../i18n';
import { BrandLogo } from './BrandLogo';
import { SyncPill } from './SyncPill';
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
  // Bumped by the retry control below, which is what re-runs the fetch effect.
  const [reloadKey, setReloadKey] = useState(0);

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
    setLoading(true);
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
  }, [token, visible, reloadKey]);

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
   * EVERY SITE ON THE LIST CAN BE OPENED (PO decision 2026-08-12: "การ์ด on hold ก็สามารถกดเลือกได้").
   *
   * It could not before: a card whose status was not "running" was disabled, dimmed, and drawn
   * without a chevron, on the reasoning that a paused site has no shift to log and no task to
   * progress. The product owner's call reverses that, and the drawing agrees — it gives its amber
   * card the same chevron, the same progress bar and the same figure as the green ones. Being
   * assigned to a paused site and being unable to look at it are different things, and reading is
   * not writing: the screens behind this one enforce their own rules.
   *
   * The status chip and the coloured left strip still say the site is paused. That is the honest
   * signal, and it is the one the drawing uses.
   */

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

  /**
   * The project the recommendation panel is about — the first row on the list.
   *
   * It is NOT a ranking: nothing in the platform ranks sites by risk yet (see the panel's note), so
   * this is simply the row the panel names, and the panel's own wording is the drawing's example.
   * The one figure taken from it — the progress bar — is real and is this project's.
   */
  const recProject = shown[0] ?? projects[0] ?? null;

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
      // `fade`, not `slide`: a centred dialog that slides up from the bottom edge reads as a sheet,
      // which is the shape this deliberately stopped being on 2026-08-12.
      animationType="fade"
      // Android's back gesture closes it, the same as the X — the two are the same intent.
      onRequestClose={closePicker}
    >
      {/* Backdrop. Pressing it closes, like the X and the Android back gesture — the drawing dims
          the dashboard rather than replacing it, so the page behind is a visible way out. */}
      <Pressable
        style={styles.backdrop}
        testID="select-project-backdrop"
        accessibilityRole="button"
        accessibilityLabel={t('quickAdd.close')}
        onPress={closePicker}
      >
        {/* The card swallows taps so a press inside it never reaches the backdrop behind. */}
        <Pressable style={styles.dialog} testID="select-project-screen" onPress={() => {}}>
          <View style={styles.topbar}>
            <BrandLogo variant="dark" height={26} />
            <View style={styles.topRight}>
              {/* THE TOP BAR'S OWN PILL, not the labelled overlay one (PO decision 2026-08-12).
                  This sheet used <OverlaySyncPill /> because the quick-action overlays draw a
                  worded `✓ SYNCED` chip — but this sheet's header is the app's brand row, and the
                  engineer reads sync state here the same way they read it everywhere else. Two
                  shapes for one fact on the same brand row is how a user learns to check twice. */}
              <SyncPill />
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
              {/* THE DRAWING'S `filter_list` BUTTON, DRAWN BUT NOT WIRED (PO decision 2026-08-12:
                  "เดี๋ยวจะทำ function ในภายหลัง"). `GET /projects/mine` takes no filter at all — it
                  is the caller's own membership list, unpaged and unparameterised — so there is
                  nothing yet for a filter sheet to set. DISABLED rather than merely inert, so a
                  screen reader is told what the dimming tells everyone else. */}
              <View
                testID="select-project-filter"
                accessible
                accessibilityRole="button"
                accessibilityLabel={t('project.select.filter')}
                accessibilityState={{ disabled: true }}
                style={styles.searchFilter}
              >
                <MaterialIcons name="filter-list" size={20} color={darkColors.muted} />
              </View>
            </View>

            {loading ? (
              <ActivityIndicator testID="select-project-loading" color={darkColors.primary} />
            ) : null}

            {/* A WAY OUT OF THE FAILED STATE (2026-08-12). The list is the whole sheet, so a failed
              fetch left the user looking at one sentence with no control on the screen that could
              change it: the request only re-ran when the access token changed, and a token that had
              already landed never changes again. A transient 401 or a dropped connection on open
              was therefore permanent until the app was restarted. Found on the screenshot rig,
              which photographed exactly that. */}
            {!loading && failed ? (
              <View style={styles.failedBlock}>
                <Text testID="select-project-failed" style={styles.notice}>
                  {t('project.select.loadFailed')}
                </Text>
                <Pressable
                  testID="select-project-retry"
                  accessibilityRole="button"
                  accessibilityLabel={t('project.select.retry')}
                  onPress={() => setReloadKey((k) => k + 1)}
                  style={styles.retryBtn}
                >
                  <MaterialIcons name="refresh" size={16} color={darkColors.accent} />
                  <Text style={styles.retryText}>{t('project.select.retry')}</Text>
                </Pressable>
              </View>
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

            {/* THE DRAWING'S "RECOMMENDED" SECTION, BUILT TO ITS FULL COMPOSITION (PO decision
              2026-08-12: "ต้องการให้แผง AI เหมือนกับใน mockup ทุกอย่าง"), and STILL STATIC — the
              2026-08-12 ruling that put it here called it "static ตามใน mockup เพื่อแสดงไว้เป็น
              feature ในอนาคต", and nothing since has made it computable.
              WHAT IT WOULD TAKE TO BE REAL, stated once so the next reader does not have to work it
              out: "CRITICAL PATH RISK DETECTED" needs a critical-path model, which the platform does
              not have; the nearest, DelayForecastModel, is Phase 23 and untrained (§22.6). "SOURCE:
              REAL-TIME TELEMETRY" needs IoT, which is Phase 24. The figures below are the drawing's
              own example values, held in i18n and bound to no computation.
              THE "COMING SOON" TAG IS THE ONE THING KEPT FROM THE REDUCED VERSION, because §22.3 is
              explicit that a surface must not read as AI-derived while a placeholder serves it, and
              that tag is what keeps this panel a declared preview rather than a claim about the
              site named in it. Everything else the drawing has is here.
              THAT SENTENCE WAS UNTRUE FROM 2026-08-12 TO 2026-08-16: this paragraph said the tag was
              kept while no tag was rendered anywhere in the file and no i18n key existed for one, so
              the panel shipped asserting a confidence and a telemetry source with nothing marking it
              as a preview. It was caught by reading this comment against the committed capture, not
              by a test — no render test can see a disclaimer that was only ever described. The chip
              is now rendered on the risk strip below; see its note there. */}
            {!loading && !failed && projects.length > 0 ? (
              <View testID="select-project-recommended" style={styles.recSection}>
                <View style={styles.recHead}>
                  <MaterialIcons name="auto-awesome" size={18} color={darkColors.accent} />
                  <Text style={styles.recEyebrow}>{t('project.select.recommendedLabel')}</Text>
                </View>

                <View style={styles.recommended}>
                  {/* The drawing's corner badge. */}
                  <View style={styles.recBadge}>
                    <Text style={styles.recBadgeText}>{t('project.select.recommendedBadge')}</Text>
                  </View>

                  <View style={styles.recTitleRow}>
                    <View style={styles.recTitleCol}>
                      <Text style={styles.recProject} numberOfLines={1}>
                        {recProject?.project_name ?? ''}
                      </Text>
                      {/* The BUILDING beside the pin (PO decision 2026-08-12), the same real field the
                      cards below use — the project's own code stands in only where the office has
                      not modelled a building, because a pin over nothing reads like a place. */}
                      {recProject?.building_name ? (
                        <View style={styles.locationRow}>
                          <MaterialIcons name="location-on" size={14} color={darkColors.muted} />
                          <Text style={styles.location} numberOfLines={1}>
                            {recProject.building_name}
                          </Text>
                        </View>
                      ) : null}
                    </View>
                    <MaterialIcons name="chevron-right" size={20} color={darkColors.accent} />
                  </View>

                  {/* The drawing's inner insight strip — and the ONE thing added to it: the
                  COMING SOON chip beside the claim. This block asserted a critical-path finding, a
                  confidence and a telemetry source with nothing marking it as a preview from the
                  2026-08-12 rebuild until 2026-08-16, even though the note above has claimed the tag
                  was kept the whole time; the committed capture
                  (03-site-engineer/01-Home/00-se-project-selection.png) is what put the undisclosed
                  version on the record. §22.3 is explicit that a surface must not read as
                  AI-derived while a placeholder serves it, so the chip sits ON the strip that
                  carries the claim rather than in a corner away from it. Outlined, not filled, for
                  the reason PrivacyPolicyDocument's twin records: a fill alone does not carry a chip
                  between two navies this close together. */}
                  <View style={styles.recInsight}>
                    <View style={styles.recHead}>
                      <MaterialIcons name="warning" size={16} color={darkColors.accent} />
                      <Text style={styles.recEyebrow}>{t('project.select.recommendedRisk')}</Text>
                      <View style={styles.recSoonChip}>
                        <Text style={styles.recSoonText}>
                          {t('project.select.recommendedSoon')}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.recMetaRow}>
                      <Text style={styles.recFoot}>{t('project.select.recommendedConf')}</Text>
                      <Text style={styles.recFoot}>{t('project.select.recommendedSource')}</Text>
                    </View>
                  </View>

                  {/* The drawing's "Current Progress" footer under a rule. THE FIGURE HERE IS REAL —
                  the same §32.12 BOQ-weighted `progress_percent` the card below shows for the same
                  project — so the one number on this panel that CAN be true is, rather than being
                  another example value. A project with nothing measurable shows the same dash the
                  cards do. */}
                  <View style={styles.recProgress}>
                    <View style={styles.progressHead}>
                      <Text style={styles.progressLabel}>
                        {t('project.select.recommendedProgress')}
                      </Text>
                      <View style={styles.progressValueRow}>
                        <MaterialIcons name="insights" size={14} color={darkColors.accent} />
                        <Text style={styles.progressValue}>
                          {`${String(Math.round(recProject?.progress_percent ?? 0))}%`}
                        </Text>
                      </View>
                    </View>
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          { width: `${progressBarWidth(recProject?.progress_percent ?? 0)}%` },
                        ]}
                      />
                    </View>
                  </View>
                </View>
              </View>
            ) : null}

            {/* The drawing's section heading over the list (PO decision 2026-08-12). Without it the
              cards ran straight on from the recommendation panel and read as more of the same. */}
            {!loading && !failed && shown.length > 0 ? (
              <Text style={styles.sectionHeading}>{t('project.select.sectionTitle')}</Text>
            ) : null}

            {shown.map((row) => {
              const current = active?.projectId === row.project_id;
              return (
                <Pressable
                  key={row.project_id}
                  testID={`select-project-${row.project_id}`}
                  accessibilityRole="button"
                  accessibilityLabel={row.project_name}
                  onPress={() => choose(row)}
                  style={[
                    styles.cardOuter,
                    // THE ACCENT STRIP CARRIES THE PROJECT'S STATUS, as the drawing does — green for
                    // a running site, amber for a late one, grey for a draft. It used to mark only
                    // "the one you are on", so every other row had the same dead hairline and the
                    // list said nothing until you read it (PO decision 2026-08-12). The row you are
                    // on is still marked — by the CURRENT chip beside its code.
                    { borderLeftColor: toneColor(row.status) },
                  ]}
                >
                  <View style={styles.cardRow}>
                    <View style={styles.cardBody}>
                      {/* NO PROJECT-CODE ROW (PO decision 2026-08-12). The drawing's card opens on
                        the project NAME, and the code was a second identifier above it saying the
                        same thing in a form nobody reads aloud — it also appeared twice per card,
                        since it is the location line's fallback. The CURRENT chip stays: it marks
                        the site you are already on, which no other element says. */}
                      {current ? (
                        <View style={styles.currentChip}>
                          <Text style={styles.currentText}>{t('project.select.current')}</Text>
                        </View>
                      ) : null}
                      <Text style={styles.name} numberOfLines={1}>
                        {row.project_name}
                      </Text>
                      {/* THE BUILDING, OR NOTHING (PO decision 2026-08-12: "ให้แสดงข้อมูลอาคารของ
                      โครงการนั้น ไม่ใช่แสดงรหัสโครงการ"). The code used to stand in where no
                      building was recorded, which put a map pin over a string that names no place —
                      and on a road project like CWRD there IS no building to name, because a road
                      has none. An absent line is the truthful answer there; an invented one is not. */}
                      {row.building_name ? (
                        <View style={styles.locationRow}>
                          <MaterialIcons name="location-on" size={14} color={darkColors.muted} />
                          <Text style={styles.location} numberOfLines={1}>
                            {row.building_name}
                          </Text>
                        </View>
                      ) : null}
                    </View>

                    {/* The drawing's status CHIP — a tinted outline carrying the word, stacked over
                      the chevron. The "Status" caption above it is gone (PO decision 2026-08-12):
                      the chip's own colour and wording say what it is, and a label naming the field
                      is chrome the drawing does not have. */}
                    <View style={styles.statusBlock}>
                      <View style={[styles.statusTag, { borderColor: toneColor(row.status) }]}>
                        <Text style={[styles.status, { color: toneColor(row.status) }]}>
                          {statusLabel(row.status)}
                        </Text>
                      </View>
                      {/* NO CHEVRON on a paused site (PO decision 2026-08-11). The card cannot be
                    entered, and a chevron is a promise that it can — a dimmed one still points
                    somewhere.
                    A CHEVRON, not an arrow (PO decision 2026-08-12). Both drawings mark these cards
                    with `chevron_right`, which is the "opens something" affordance the rest of the
                    app uses; a full arrow reads as a directional action. */}
                      <MaterialIcons name="chevron-right" size={20} color={darkColors.muted} />
                    </View>
                  </View>

                  {/* The drawing's completion footer: a hairline rule, a PROGRESS eyebrow, the
                      percentage beside an `insights` glyph, and a 6px track under both. Real as of
                      2026-08-12 — `GET /projects/mine` now carries the §32.12 BOQ-value-weighted
                      figure (see the header note).
                      A DASH AND NO TRACK when the server sends null: that project has no BOQ-linked
                      task, so its progress is not measurable, and an empty bar would state that
                      nothing has been done there — a different and untrue claim. */}
                  <View style={styles.progressBlock}>
                    <View style={styles.progressHead}>
                      <Text style={styles.progressLabel}>{t('project.select.progress')}</Text>
                      <View style={styles.progressValueRow}>
                        <MaterialIcons name="insights" size={14} color={darkColors.accent} />
                        {/* AN UNMEASURABLE PROJECT READS 0% WITH AN EMPTY TUBE (PO decision
                          2026-08-12: "ถ้า progress เป็น No data ต้องแสดงแถบ progress เป็นหลอดว่าง
                          และตัวเลขแสดงเป็น 0%"). Worth recording what that trades away: §32.12 makes
                          this figure null when NO BOQ-linked task exists, precisely so "nothing is
                          measurable here" is not stated as "nothing has been done here". Every card
                          now draws the same bar, so those two cases look identical on this screen —
                          the distinction survives in the API and in `getProjectProgress`, which the
                          project detail screens read. */}
                        <Text
                          testID={`select-project-progress-${row.project_id}`}
                          style={styles.progressValue}
                        >
                          {`${String(Math.round(row.progress_percent ?? 0))}%`}
                        </Text>
                      </View>
                    </View>
                    {/* The tube is ALWAYS drawn — empty at 0% — so every card has the same shape. */}
                    <View style={styles.progressTrack}>
                      <View
                        style={[
                          styles.progressFill,
                          // The SAME clamp the Site Engineer dashboard's bar uses, from the same
                          // helper — a width over 100% overflows the track silently rather than
                          // failing, and two bars drawing the same metric must clamp it alike.
                          { width: `${progressBarWidth(row.progress_percent ?? 0)}%` },
                        ]}
                      />
                    </View>
                  </View>
                </Pressable>
              );
            })}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  // `bg-black/60` from the drawing. RN has no backdrop-filter, so the blur the mockup pairs with it
  // is not reproducible — the dim alone carries the same job, which is to hold the page behind
  // visible but plainly inactive.
  backdrop: {
    flex: 1,
    // OPAQUE, not the drawing's `bg-black/60` (PO decision 2026-08-12). The translucent version let
    // the dashboard read through behind the card, and a screen you can half-see but not touch is
    // noise around the one question being asked.
    backgroundColor: darkColors.bg,
    justifyContent: 'center',
    alignItems: 'center',
    padding: spacing.md,
  },
  // `max-w-lg … rounded-xl border shadow-2xl max-h-[90vh]`. The height cap is what keeps the dimmed
  // page showing above and below on a long list instead of the card growing into a full screen.
  dialog: {
    width: '100%',
    maxWidth: 512,
    maxHeight: '90%',
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: darkColors.border,
    backgroundColor: darkColors.surface,
    overflow: 'hidden',
  },
  topbar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.md,
    // Was `spacing.xl` to clear the status bar back when this was a full-bleed page. Inside a
    // centred card there is no status bar to clear, and the extra 32pt read as a dead band.
    paddingTop: spacing.md,
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
    // `elevated`, not `surface`: the card around this is `surface` now, and a field the same colour
    // as the panel it sits on has no edge left but its border. The drawing separates them too
    // (container `bg-surface-container`, field `bg-surface-container-high`).
    backgroundColor: darkColors.elevated,
  },
  // Dimmed because it is not wired yet — see the note at the element.
  searchFilter: { padding: spacing.xs, opacity: 0.5 },
  searchInput: {
    flex: 1,
    color: darkColors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
    paddingVertical: spacing.xs,
  },

  recSection: { gap: spacing.xs },
  // The drawing's cyan-edged recommendation card. Border only — §32.7 prohibits glow in the
  // signed-in app, and the drawing's `shadow-[0_0_15px_rgba(6,182,212,0.3)]` is exactly that.
  recommended: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: darkColors.accent,
    backgroundColor: darkColors.elevated,
    overflow: 'hidden',
  },
  recBadge: {
    position: 'absolute',
    top: 0,
    right: 0,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    borderBottomLeftRadius: radius.lg,
    backgroundColor: darkColors.accent,
  },
  recBadgeText: {
    color: darkColors.bg,
    fontFamily: fontFamily.bold,
    fontSize: 9,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  recTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  recTitleCol: { flex: 1, gap: 2 },
  recProject: {
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
  },
  recInsight: {
    gap: spacing.xs,
    padding: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: darkColors.accent,
  },
  recMetaRow: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.xs },
  recSoonChip: {
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: darkColors.border,
    backgroundColor: darkColors.surface,
  },
  recSoonText: {
    color: darkColors.muted,
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  recProgress: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: darkColors.border,
  },
  sectionHeading: {
    color: darkColors.text,
    fontFamily: fontFamily.semibold,
    fontSize: typography.title.fontSize,
    marginTop: spacing.xs,
  },
  recHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  recEyebrow: {
    color: darkColors.accent,
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  recBody: {
    color: darkColors.text,
    fontFamily: fontFamily.regular,
    fontSize: typography.label.fontSize,
  },
  recFoot: {
    color: darkColors.muted,
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  failedBlock: { gap: spacing.sm, alignItems: 'flex-start' },
  retryBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    minHeight: touchTarget.secondaryButton,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: darkColors.accent,
  },
  retryText: {
    color: darkColors.accent,
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
  },
  notice: {
    color: darkColors.muted,
    fontFamily: fontFamily.regular,
    fontSize: typography.caption.fontSize,
  },

  // The card is a COLUMN now: the name/status row, then the progress footer under a hairline, as the
  // drawing lays it out. `cardRow` is the row that used to be the whole card.
  cardOuter: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: darkColors.border,
    borderLeftWidth: 4,
    // Same reason as the search field: the rows are plates ON the card, so they take `elevated`
    // (the drawing's `bg-surface-container-high`). On `surface` they were the card's own colour and
    // the list read as one undivided block.
    backgroundColor: darkColors.elevated,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  cardBody: { flex: 1, gap: spacing.xs / 2 },

  // `border-t border-surface-variant/50` + `w-full h-2 rounded-full` from the drawing.
  progressBlock: {
    gap: spacing.xs,
    paddingTop: spacing.xs,
    borderTopWidth: 1,
    borderTopColor: darkColors.border,
  },
  progressHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  progressValueRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  progressLabel: {
    color: darkColors.muted,
    fontFamily: fontFamily.medium,
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
  },
  progressValue: {
    color: darkColors.accent,
    fontFamily: fontFamily.semibold,
    fontSize: typography.label.fontSize,
  },
  progressTrack: {
    height: 6,
    borderRadius: radius.sm,
    overflow: 'hidden',
    backgroundColor: darkColors.border,
  },
  progressFill: { height: '100%', backgroundColor: darkColors.accent },
  currentChip: {
    alignSelf: 'flex-start',
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

  // The drawing stacks the status chip over the chevron at the card's trailing edge.
  statusBlock: { alignItems: 'flex-end', gap: spacing.xs },
  // SQUARE, not capsuled and not merely card-cornered (PO decision 2026-08-12, twice: the first
  // pass used the card's own radius.lg and still read as rounded). The drawing's class on this tag
  // is `rounded`, which in its Tailwind config is the 0.125rem DEFAULT — 2px, i.e. `radius.sm`, the
  // squarest corner on the scale. Exempted by name in theme/__tests__/badgeRadius.spec.ts, which
  // otherwise holds every chip/badge/pill at radius.xl (§32.7).
  statusTag: {
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 2,
  },
  status: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
});
