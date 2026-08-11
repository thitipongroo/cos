// Issues screen — SITE_WORKER quick issue create (+ photo) & offline list; SITE_ENGINEER escalate.
// Implements mockup/mobile/05_site_worker/01_home/03_sw_issue.
//
// Create (G-M11): generates a client UUID (expo-crypto) used as BOTH the local/issue id AND the
// PhotoCapture entity_id, then writes local_issues (PENDING) and enqueues an 'issue' sync item
// (client_id → server issue_id) so the issue actually pushes and the attached photo links on sync.
// Escalate (G-M12): POST /site/issues/:id/escalate → notifies the PM (online-only).
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
//     mockup set draws it: 03_site_engineer/site_issues/issue_list and .../escalate_issue_to_manager.
//     Deleting it outright would have taken G-M12 (escalate → PM) out of the app entirely, since this
//     is its only screen — so the zone is role-scoped rather than removed.
//     A worker who needs sync state still has the global sync indicator and the Sync Queue screen.
//   - The mockup's own top bar (brand + close) is dropped in favour of the app's global TopBar, as
//     on every other screen.

import { useMemo, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, ScrollView, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Crypto from 'expo-crypto';
import { db, newLocalId } from '../../db/database';
import type { Issue } from '../../db/database';
import { localIssues } from '../../db/schema';
import { enqueue } from '../../db/sync-queue';
import { post } from '../../api/client';
import { CosRole } from '@cos/types';
import { useProjectStore } from '../../store/projectStore';
import { useAuthStore } from '../../store/authStore';
import { useCollection } from '../../hooks/useCollection';
import { StatusChip } from '../../components/StatusChip';
import { PhotoCapture } from '../../components/PhotoCapture';
import { VoiceNoteButton } from '../../components/VoiceNoteButton';
import { OptimisticList } from '../../components/OptimisticList';
import { ProjectContextBar } from '../../components/ProjectContextBar';
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
  const role = useAuthStore((s) => s.role);
  // SITE_WORKER gets the capture-only screen its mockup draws; every other role that reaches this
  // route (SITE_ENGINEER) keeps the list and the escalate action — see the header note.
  const showList = role !== CosRole.SITE_WORKER;
  // The site comes from the store, not from a picker on this screen (PO decision 2026-08-11). The
  // Site Worker chooses it once in `00_sw_project_selection` and every screen after it works on that
  // site — a second chooser here would let one screen disagree with the bar above it.
  const projectId = useProjectStore((s) => s.active?.projectId ?? '');
  const [description, setDescription] = useState('');
  const [issueType, setIssueType] = useState<string>('DEFECT');
  const [draftId, setDraftId] = useState(() => Crypto.randomUUID()); // id for the issue + its photo
  const [escalated, setEscalated] = useState<Record<string, boolean>>({});
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

  const onEscalate = (issueId: string): void => {
    // Online-only notify (post() throws offline rather than queuing a bogus escalate).
    post(`/site/issues/${issueId}/escalate`, {})
      .then(() => setEscalated((e) => ({ ...e, [issueId]: true })))
      .catch(() => {
        /* offline/error — leave un-escalated; user can retry */
      });
  };

  return (
    <ScrollView
      testID="issues-screen"
      style={{ backgroundColor: p.bg }}
      contentContainerStyle={styles.page}
      keyboardShouldPersistTaps="handled"
    >
      <ProjectContextBar />

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

      {showList ? (
        <View style={styles.list}>
          <OptimisticList<Issue>
            testID="issue-list"
            data={issues}
            keyExtractor={(item) => item.id}
            isPending={(item) => item.offlineSyncStatus === 'PENDING'}
            emptyText={t('site.issues.empty')}
            renderItem={(item) => (
              <View testID="issue-item" style={screen.item}>
                <Text style={screen.itemTitle}>{item.title}</Text>
                <View style={styles.chips}>
                  <StatusChip label={item.severity} />
                  <StatusChip label={item.offlineSyncStatus} />
                  {/* Escalate only a synced issue (has a server id) that isn't already escalated. */}
                  {item.issueId && item.offlineSyncStatus === 'SYNCED' ? (
                    <TouchableOpacity
                      testID={`escalate-${item.issueId}`}
                      style={[
                        styles.escalate,
                        { borderColor: p.warning },
                        escalated[item.issueId] && { backgroundColor: p.warning },
                      ]}
                      onPress={() => onEscalate(item.issueId)}
                      disabled={escalated[item.issueId]}
                    >
                      <Text style={[styles.escalateText, { color: p.text }]}>
                        {escalated[item.issueId]
                          ? t('site.issues.escalated')
                          : t('site.issues.escalate')}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            )}
          />
        </View>
      ) : null}
    </ScrollView>
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
  list: { marginTop: spacing.md },
  chips: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  escalate: {
    borderRadius: radius.xl,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  escalateText: { fontSize: typography.caption.fontSize, fontFamily: fontFamily.medium },
});
