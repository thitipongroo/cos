// Issues route — TWO SCREENS behind one path, chosen by role.
//   SITE_WORKER    : the capture form, and only that (mockup 05_site_worker/01_home/03_sw_issue).
//   SITE_ENGINEER  : the issue BOARD (mockup 03_site_engineer/02_issues/02_se_issue_dashboard),
//                    with the capture form reachable from its floating "+".
//
// THEY ARE DIFFERENT SCREENS, and until 2026-08-12 this file drew them as one — the engineer got the
// worker's whole camera-and-voice form with a list bolted underneath it. The product owner's ruling
// is that the board is its own page ("หน้าจอนี้เป็น issue dashboard เป็นคนละหน้ากับ
// 03-sw-report-issue.png"), so the form now sits behind the FAB the board's own drawing has.
//
// Create (G-M11): generates a client UUID (expo-crypto) used as BOTH the local/issue id AND the
// PhotoCapture entity_id, then writes local_issues (PENDING) and enqueues an 'issue' sync item
// (client_id → server issue_id) so the issue actually pushes and the attached photo links on sync.
//
// ESCALATE (G-M12) IS GONE FROM THIS SCREEN (PO decision 2026-08-12: "ตัดปุ่ม Escalate ออก เพราะใน
// Mockup ไม่มี"). Stating the consequence plainly rather than burying it: `POST /site/issues/:id/
// escalate` is still served, but no screen in the app calls it any more — this was its only caller,
// and its own drawing (site_issues/escalate_issue_to_manager) was deleted in the 2026-08-12 mockup
// restructure with no successor. Re-entering the app needs a new surface, wherever the drawings put
// one next.
//
// DEVIATIONS FROM THE MOCKUP, and why:
//   - CATEGORY CHIPS carry the four REAL values of `site_ops.issues.issue_type` — DEFECT, REWORK,
//     PUNCH, GENERAL — not the mockup's Safety / Material / Technical / Blocker, which match no
//     column, no enum and no API field (product-owner decision 2026-08-08: use the real values).
//     These are the same four the task-completion gate reads (master §Phase 6 gate #2), so a worker
//     classifying an issue here is feeding the gate that blocks the task.
//   - The mockup's in-frame "AI Suggestion: Safety Issue detected in frame" is dropped.
//     SafetyVisionModel is Phase 23 and needs 10,000+ labelled site photos (§22.6); nothing in the
//     product can look at a frame and say that today.
//   - The mockup has no issue LIST — it is a capture-only screen, and for SITE_WORKER that is now
//     exactly what this renders (PO decision 2026-08-08: "โซนด้านล่างของปุ่ม REPORT ISSUE
//     คืออะไร ตัดออก"). The list SURVIVES for SITE_ENGINEER, which shares this route and whose own
//     mockup set draws it: 03_site_engineer/02_issues/02_se_issue_dashboard (renamed from
//     site_issues/issue_list in the 2026-08-12 restructure — git records it as a rename, so the
//     drawing survived the reorganisation). Its companion escalate_issue_to_manager was DELETED in
//     that same commit with no successor drawing; the capability is unaffected — ADR-085 makes the
//     mockups authoritative for style, not composition, and a drawing that is withdrawn does not
//     withdraw reviewed working capability.
//     Deleting the zone outright would have taken G-M12 (escalate → PM) out of the app entirely,
//     since this is its only screen — so the zone is role-scoped rather than removed.
//     A worker who needs sync state still has the global sync indicator and the Sync Queue screen.
//     THAT LIST WAS REBUILT TO ITS OWN DRAWING ON 2026-08-12 (PO decision: "ต้องการให้รูปแบบเหมือน
//     กับใน mockup"). It had been two stacked StatusChips on a plain row — the generic list shape,
//     not this screen's. It is now the drawing's board: a filter chip row (lib/issueBoard.ts), and
//     cards with a severity-coloured left strip, an id eyebrow opposite the sync state, and the
//     issue's own captured photo as a header where one exists (components/IssueCard.tsx). The two
//     things the drawing puts on a card that no column can fill — a location and an age — are
//     accounted for in that component's own note.
//   - The mockup's own top bar (brand + close) is dropped in favour of the app's global TopBar, as
//     on every other screen.

import { useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  FlatList,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { db, newLocalId } from '../../db/database';
import type { Issue } from '../../db/database';
import { localIssues } from '../../db/schema';
import { enqueue } from '../../db/sync-queue';
import { CosRole } from '@cos/types';
import { useProjectStore } from '../../store/projectStore';
import { useAuthStore } from '../../store/authStore';
import { useCollection } from '../../hooks/useCollection';
import type { Photo } from '../../db/database';
import { PhotoCapture } from '../../components/PhotoCapture';
import { VoiceNoteButton } from '../../components/VoiceNoteButton';
import { IssueCard } from '../../components/IssueCard';
import { ProjectContextBar } from '../../components/ProjectContextBar';
import { SiteInsight } from '../../components/SiteInsight';
import { ISSUE_FILTERS, matchesIssueFilter, type IssueFilter } from '../../lib/issueBoard';
import { useT } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette } from '../../theme/usePalette';
import { makeScreenStyles } from '../../theme/screenStyles';

type IconName = keyof typeof MaterialIcons.glyphMap;

/**
 * The real `issue_type` values (site_ops.issues, CHECK-constrained since migration 20260619000002),
 * each with a glyph. Order is worst-first: a DEFECT and a REWORK block task completion, a PUNCH item
 * is snagging, GENERAL blocks nothing.
 */
const ISSUE_TYPES: ReadonlyArray<{ value: string; icon: IconName }> = [
  { value: 'DEFECT', icon: 'report-problem' },
  { value: 'REWORK', icon: 'build' },
  { value: 'PUNCH', icon: 'checklist' },
  { value: 'GENERAL', icon: 'info' },
];

/** `site_ops.issues.title` is VARCHAR(255) and CreateIssueDto enforces it. */
const ISSUE_TITLE_MAX = 255;

/** Severity is a separate real column; the mockup shows no severity control, so it stays MEDIUM. */
const DEFAULT_SEVERITY = 'MEDIUM';

export default function IssuesScreen() {
  const allIssues = useCollection<Issue>('local_issues');
  const allPhotos = useCollection<Photo>('local_photos');
  const role = useAuthStore((s) => s.role);
  // SITE_WORKER gets the capture-only screen its mockup draws; every other role that reaches this
  // route (SITE_ENGINEER) opens on the board instead — see the header note.
  const showList = role !== CosRole.SITE_WORKER;
  // The site comes from the store, not from a picker on this screen (PO decision 2026-08-11). The
  // Site Worker chooses it once in `00_sw_project_selection` and every screen after it works on that
  // site — a second chooser here would let one screen disagree with the bar above it.
  const projectId = useProjectStore((s) => s.active?.projectId ?? '');
  // The project's NAME for the panel's "Source:" line. It printed the raw uuid, which names nothing
  // to the person reading it (PO decision 2026-08-12).
  const projectName = useProjectStore((s) => s.active?.projectName ?? '');
  const [description, setDescription] = useState('');
  const [issueType, setIssueType] = useState<string>('DEFECT');
  const [draftId, setDraftId] = useState(() => Crypto.randomUUID()); // id for the issue + its photo
  const [filter, setFilter] = useState<IssueFilter>('all');
  // SITE_ENGINEER only: the board is the screen, and this raises the capture form over it.
  const [composing, setComposing] = useState(false);
  const t = useT();
  const p = usePalette();
  const screen = useMemo(() => makeScreenStyles(p), [p]);

  // ONE text field, as the mockup draws (PO 2026-08-09): the separate title input is gone, so the
  // description IS the issue. `title` is NOT NULL and capped at 255 by CreateIssueDto, and every
  // list and notification shows it — so it takes the first 255 characters, and anything past that
  // stays in `description`, which is unbounded. Nothing is lost and nothing is truncated silently.
  const canSubmit = projectId.trim() !== '' && description.trim() !== '';

  // The list below is scoped to the SELECTED project, not the whole local cache. A worker on five
  // projects has every project's issues cached, and an unscoped list mixes them with nothing on the
  // row to say which site each belongs to — the same reason the checklist screen scopes by project.
  // With no project chosen yet it shows everything, which is the only honest thing to show.
  const issues = useMemo(
    () => (projectId ? allIssues.filter((i) => i.projectId === projectId) : allIssues),
    [allIssues, projectId],
  );

  // The drawing's chip row, applied on top of the project scoping above.
  const shown = useMemo(
    () => issues.filter((i) => matchesIssueFilter(i, filter)),
    [issues, filter],
  );

  /**
   * This issue's own captured photo, by issue id — the drawing's photo-headed card.
   *
   * `PhotoCapture` on the form above is given the SAME client UUID that becomes the issue's
   * `issueId`, so the join is on a real key and never a guess. Built once per render of the whole
   * photo table rather than looked up per card, so a long list stays one pass.
   */
  const photoByIssue = useMemo(() => {
    const map = new Map<string, string>();
    for (const photo of allPhotos) {
      // First capture wins: the card has room for one header, and the first is the one taken when
      // the issue was raised.
      if (photo.entityType === 'issue' && !map.has(photo.entityId)) {
        map.set(photo.entityId, photo.localPath);
      }
    }
    return map;
  }, [allPhotos]);

  const onCreate = async (): Promise<void> => {
    const text = description.trim();
    const title = text.slice(0, ISSUE_TITLE_MAX);

    await db.insert(localIssues).values({
      id: newLocalId(),
      issueId: draftId, // client UUID becomes the server issue_id on sync (G-M11)
      projectId: projectId.trim(),
      title,
      description: text.length > ISSUE_TITLE_MAX ? text : null,
      severity: DEFAULT_SEVERITY,
      status: 'OPEN',
      issueType,
      // The device clock, so a just-raised issue reads "just now" on the board instead of blank
      // while it waits to push. The server stamps its own `created_at` on insert and the next
      // delta pull overwrites this with it — the authoritative value always wins.
      createdAt: new Date().toISOString(),
      offlineSyncStatus: 'PENDING',
    });
    enqueue('issue', draftId, 'CREATE', {
      client_id: draftId,
      project_id: projectId.trim(),
      title,
      description: text.length > ISSUE_TITLE_MAX ? text : undefined,
      severity: DEFAULT_SEVERITY,
      issue_type: issueType,
    });
    setDescription('');
    setIssueType('DEFECT');
    setDraftId(Crypto.randomUUID()); // fresh id (and photo scope) for the next issue
  };

  // THE DASHBOARD AND THE CAPTURE FORM ARE TWO SCREENS, and this route renders whichever the role
  // is on (PO decision 2026-08-12: "หน้าจอนี้เป็น issue dashboard เป็นคนละหน้ากับ
  // 03-sw-report-issue.png"). A SITE_WORKER only ever gets the capture form — their drawing is
  // capture-only and has been since the 2026-08-08 ruling. A SITE_ENGINEER opens on the BOARD, and
  // reaches the form through the drawing's floating "+", which is the only reason that FAB exists:
  // without it this role would lose the ability to raise an issue at all, since this route is the
  // only place in the app that can.
  const capturing = !showList || composing;

  if (capturing) {
    return (
      <ScrollView
        testID="issues-screen"
        style={{ backgroundColor: p.bg }}
        contentContainerStyle={styles.page}
        keyboardShouldPersistTaps="handled"
      >
        <ProjectContextBar />

        {/* Cancel back to the board. Only for the role that HAS a board to go back to — a worker who
          landed here landed on their whole screen, and a back control on it points nowhere. */}
        {showList ? (
          <TouchableOpacity
            testID="issue-capture-back"
            accessibilityRole="button"
            accessibilityLabel={t('site.issues.backToBoard')}
            onPress={() => setComposing(false)}
            style={styles.backRow}
          >
            <MaterialIcons name="arrow-back" size={20} color={p.accent} />
            <Text style={[styles.backText, { color: p.accent }]}>
              {t('site.issues.backToBoard')}
            </Text>
          </TouchableOpacity>
        ) : null}

        {/* Camera first — the mockup opens straight on the viewfinder, because a site issue is
          photographed before it is described. layout="viewfinder" is that mockup's framing: a 4:3
          preview with an inset guide, a LIVE pill, and a round shutter ON the frame instead of a
          rectangular button beneath it. */}
        <PhotoCapture entityType="issue" entityId={draftId} layout="viewfinder" />

        <Text style={[styles.sectionLabel, { color: p.muted }]}>
          {t('site.issues.categoryLabel')}
        </Text>
        <View style={styles.chipGrid}>
          {ISSUE_TYPES.map(({ value, icon }) => {
            const active = value === issueType;
            return (
              <TouchableOpacity
                key={value}
                testID={`issue-type-${value}`}
                onPress={() => setIssueType(value)}
                accessibilityRole="radio"
                accessibilityState={{ selected: active }}
                style={[
                  styles.typeChip,
                  {
                    backgroundColor: p.surface,
                    borderColor: active ? p.primary : p.border,
                    borderWidth: active ? 2 : 1,
                  },
                ]}
              >
                <MaterialIcons name={icon} size={20} color={active ? p.accent : p.muted} />
                <Text style={[styles.typeChipText, { color: p.text }]}>
                  {t(`site.issues.types.${value}`)}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        <Text style={[styles.sectionLabel, { color: p.muted }]}>{t('site.issues.voiceLabel')}</Text>
        {/* The mockup's voice zone: a dashed drop-zone panel with the mic centred in it and the
          hold-to-record instruction underneath. The dashed border is doing real work here — it says
          "optional, nothing recorded yet", which a solid filled bar did not. */}
        <View style={[styles.voicePanel, { backgroundColor: p.surface, borderColor: p.border }]}>
          {/* 80px, the size its mockup draws (`w-20 h-20 rounded-full`). Bigger than the 56px project
            standard because here the button IS the panel's purpose, not an accessory floating over
            a list — PO decision 2026-08-09, "follow the mockup". */}
          <VoiceNoteButton
            testID="issue-voice-note"
            shape="fab"
            fabShape="square"
            fabSize={80}
            onTranscript={(text) => setDescription((d) => (d.trim() ? `${d} ${text}` : text))}
          />
          <Text style={[styles.voiceHint, { color: p.text }]}>{t('site.issues.voiceHint')}</Text>
        </View>

        <Text style={[styles.sectionLabel, { color: p.muted }]}>
          {t('site.issues.descriptionLabel')}
        </Text>
        <TextInput
          testID="issue-description-input"
          style={[screen.input, styles.multiline]}
          placeholder={t('site.issues.descriptionPlaceholder')}
          placeholderTextColor={p.muted}
          multiline
          value={description}
          onChangeText={setDescription}
        />

        <TouchableOpacity
          testID="create-issue-button"
          style={[screen.primaryButton, styles.submit, !canSubmit && screen.buttonDisabled]}
          onPress={onCreate}
          disabled={!canSubmit}
        >
          <MaterialIcons name="send" size={20} color={p.onPrimary} />
          <Text style={screen.primaryButtonText}>{t('site.issues.submit')}</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  // ── THE BOARD (mockup 03_site_engineer/02_issues/02_se_issue_dashboard) ──────────────────────
  return (
    <View testID="issues-screen" style={[styles.board, { backgroundColor: p.bg }]}>
      {/* THE BAR, THE PANEL AND THE CARDS ARE ALL ONE WIDTH (PO decision 2026-08-12). The list
          carries its own padding, so the two blocks above it ran edge to edge while every card was
          inset — three different left margins down one screen. This inset is the list's. */}
      <View style={styles.headerInset}>
        <ProjectContextBar />
      </View>

      {/* THE FILTER ROW SITS DIRECTLY UNDER THE ACTIVE PROJECT BAR (PO decision 2026-08-12), which
          is where the drawing puts it — a sticky strip immediately below the bar, above everything
          else on the page. It was under the AI panel, so the control that governs the list was
          separated from it by the tallest block on the screen.
          Every chip filters on a real column — see lib/issueBoard.ts. No counts: the Tasks list
          carries them because its drawing does, and this one does not. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.filterRow}
        style={styles.filterStrip}
      >
        {ISSUE_FILTERS.map((f) => {
          const on = f === filter;
          return (
            <TouchableOpacity
              key={f}
              testID={`issue-filter-${f}`}
              onPress={() => setFilter(f)}
              accessibilityRole="radio"
              accessibilityState={{ selected: on }}
              style={[
                styles.filterChip,
                { backgroundColor: on ? p.primary : p.surface, borderColor: p.border },
              ]}
            >
              <Text style={[styles.filterChipText, { color: on ? p.onPrimary : p.muted }]}>
                {t(`site.issues.filters.${f}`)}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {/* The Insight card the drawing opens the board with. Backed by SITE_SUMMARY, the Phase 12
          report whose declared input IS open issues + recent site reports — no new report type was
          invented; see api/ai.ts. It needs a project, and a report costs the tenant's metered AI
          quota (§26.1), so it renders only once the bar above has one. */}
      {projectId ? (
        <View style={[styles.insightSlot, styles.headerInset]}>
          <SiteInsight
            projectId={projectId}
            projectLabel={projectName}
            titleKey="site.issues.insightTitle"
          />
        </View>
      ) : null}

      {/* A FlatList, so the board scrolls as a list rather than as a page — the whole screen is the
          list now that the capture form has moved behind the FAB. `flex: 1` is load-bearing: without
          it the list sizes to its content and has no overflow of its own to scroll (the same bug
          fixed on Tasks and Reports the same day). */}
      <FlatList<Issue>
        testID="issue-list"
        data={shown}
        keyExtractor={(item) => item.id}
        style={styles.listFill}
        contentContainerStyle={styles.listStack}
        ListEmptyComponent={<Text style={screen.empty}>{t('site.issues.empty')}</Text>}
        renderItem={({ item }) => (
          <IssueCard issue={item} photoUri={photoByIssue.get(item.issueId) ?? null} />
        )}
      />

      {/* The drawing's floating "+" — and the only route to the capture form for this role. */}
      <TouchableOpacity
        testID="issue-fab"
        accessibilityRole="button"
        accessibilityLabel={t('site.issues.submit')}
        onPress={() => setComposing(true)}
        style={[styles.fab, { backgroundColor: p.primary }]}
      >
        <MaterialIcons name="add" size={28} color={p.onPrimary} />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
  sectionLabel: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.semibold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  chipGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  typeChip: {
    // Two per row on a 360dp phone; 52px tall ≥ touchTarget.formInput.
    flexBasis: '48%',
    flexGrow: 1,
    minHeight: touchTarget.formInput,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingHorizontal: spacing.sm,
    borderRadius: radius.lg,
  },
  typeChipText: { fontSize: typography.label.fontSize, fontFamily: fontFamily.medium },
  multiline: { minHeight: 96, textAlignVertical: 'top', paddingVertical: spacing.sm },
  voicePanel: {
    alignItems: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.md,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderStyle: 'dashed',
  },
  voiceHint: {
    textAlign: 'center',
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
  },
  submit: { flexDirection: 'row', gap: spacing.xs, minHeight: touchTarget.primaryButton + 8 },
  board: { flex: 1 },
  backRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
    paddingVertical: spacing.xs,
  },
  backText: { fontFamily: fontFamily.semibold, fontSize: typography.body.fontSize },
  filterStrip: { flexGrow: 0, paddingHorizontal: spacing.md, paddingTop: spacing.sm },
  // The drawing's air between the filter strip and the panel under it.
  insightSlot: { paddingTop: spacing.sm },
  headerInset: {
    paddingHorizontal: spacing.md,
    // Air under the app's TopBar (PO decision 2026-08-12). The board is a full-height FlatList
    // screen with no page padding of its own, so the Active Project card sat flush against the bar
    // above it and the two read as one stacked block. The Tasks screen inherits the same gap from
    // its own header, so both roles' first card clears the bar by the same amount.
    paddingTop: spacing.sm,
  },
  listFill: { flex: 1 },
  fab: {
    position: 'absolute',
    right: spacing.md,
    bottom: spacing.md,
    width: touchTarget.listItem,
    height: touchTarget.listItem,
    // A ROUNDED SQUARE, not a circle (PO decision 2026-08-12). The drawing's FAB here is
    // `rounded-xl` — square-cornered like the cards under it — where the reports screen's is a
    // circle. They are different drawings and this one follows its own.
    borderRadius: radius.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterRow: { gap: spacing.xs, paddingBottom: spacing.xs },
  filterChip: {
    minHeight: touchTarget.secondaryButton,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.xl,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: typography.label.fontSize,
    fontFamily: fontFamily.semibold,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
  // `space-y-3` between cards in the drawing. The cards are self-contained plates, so the air
  // between them is what makes the list read as separate issues rather than one banded slab.
  // Deep bottom padding so the floating "+" never covers the last card.
  listStack: { gap: spacing.sm, padding: spacing.md, paddingBottom: spacing.xl * 3 },
});
