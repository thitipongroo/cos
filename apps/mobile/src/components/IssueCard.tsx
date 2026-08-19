// IssueCard — one row of the Site Engineer's issue board.
//
// Anatomy from mockup/mobile/03_site_engineer/02_issues/02_se_issue_dashboard: a coloured strip down
// the left edge, an id eyebrow with the sync state opposite it, the title, a metadata row of small
// chips, and a chevron at the trailing edge. A finished issue is dimmed with its title struck
// through — the drawing's last card.
//
// THE METADATA ROW, and what fills each of the drawing's three slots (ADR-085 — the mockup owns
// style, never data that does not exist):
//   - Its severity chip is the real `severity`.
//   - "Sector B - Pier 4" IS THE ISSUE'S CATEGORY (PO decision 2026-08-12). There is no location on
//     an issue and no way to give it one cheaply: `site_ops.issues` has no floor, room, zone or area
//     column — only latitude/longitude — and `projects.floors` has nothing linking it to an issue,
//     so a per-issue floor would have meant a schema migration plus a floor picker in the capture
//     flow. The product owner's call was to spend the slot on `issue_type` instead, which is real,
//     already CHECK-constrained (DEFECT · REWORK · PUNCH · GENERAL, migration 20260619000002) and
//     genuinely varies per card — and is the same classification the Phase 6 task-completion gate
//     reads, so the board now shows what actually blocks work.
//   - "2h ago" is the real age, from `site_ops.issues.created_at`. Both columns reach the device as
//     of local DDL v6; a row cached before that has neither until the next delta pull, and a card
//     with no timestamp shows no age rather than an invented one.
// `status` rides in the same row: it is what the RESOLVED / OPEN filter chips above the list sort
// on, and a card that says CRITICAL without saying whether it is still open says half of it.
//
// THE PHOTO HEADER IS REAL (the drawing's fourth card). An issue captured on this device stores its
// photo in `local_photos` under the SAME client UUID that becomes the issue id, so the thumbnail is
// this issue's own photo, read from the local file — not a stock image, and not a network fetch. An
// issue that arrived from the server with no local capture simply has no header, which is honest.

import { memo } from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import type { Issue } from '../db/database';
import { shortId } from '../lib/shortId';
import {
  isIssueClosed,
  issueSeverityTone,
  issueStripTone,
  type IssueTone,
} from '../lib/issueBoard';
import { waitingAge } from '../lib/waitingAge';
import { useI18n } from '../i18n';
import { fontFamily, radius, spacing, typography } from '../theme/tokens';
import { usePalette, type Palette } from '../theme/usePalette';

/** The tone key → the palette entry. One place, so light and dark cannot disagree. */
function toneColor(p: Palette, tone: IssueTone): string {
  switch (tone) {
    case 'danger':
      return p.danger;
    case 'warning':
      return p.warning;
    case 'primary':
      return p.accent; // the accent, not `primary` — this is a mark ON the page (§20.8)
    case 'success':
      return p.success;
    default:
      return p.muted;
  }
}

/** The sync state's glyph and tone — the drawing's SYNCED / PENDING pair at the card's top right. */
function syncMark(status: string): {
  icon: 'check-circle' | 'sync' | 'error-outline';
  tone: IssueTone;
} {
  if (status === 'SYNCED') return { icon: 'check-circle', tone: 'success' };
  if (status === 'CONFLICT') return { icon: 'error-outline', tone: 'danger' };
  return { icon: 'sync', tone: 'muted' };
}

/**
 * MEMOIZED. This is the row of the issue board, whose screen re-renders on every filter chip and on
 * every change the local database reports — none of which alters a card whose issue and photo are
 * the same as last time. Props are an issue row, an optional photo URI, and two optional slots, so
 * the default shallow comparison is the right one.
 */
export const IssueCard = memo(function IssueCard({
  issue,
  photoUri,
  onPress,
  children,
}: {
  issue: Issue;
  /** The local file URI of this issue's own captured photo, when there is one. */
  photoUri?: string | null;
  onPress?: () => void;
  /**
   * Slot below the card body, kept so this card stays about rendering an issue.
   *
   * It carried the escalate control (G-M12) until 2026-08-12, when that button left the board with
   * its drawing; NO caller passes it today (`issues.tsx` is the only one, and it passes `issue` +
   * `photoUri` only). Kept as the extension point the next such control uses, rather than removed
   * and re-added.
   */
  children?: React.ReactNode;
}) {
  const { t, statusLabel } = useI18n();
  const p = usePalette();
  const closed = isIssueClosed(issue.status);
  // `new Date()` at render, not a ticking clock: the board is read at a glance and the buckets are
  // hours and days, so a card that is one bucket stale until the next render is not wrong to anyone.
  const bucket = waitingAge(issue.createdAt, new Date());
  const age =
    bucket === null
      ? null
      : bucket.unit === 'now'
        ? t('site.issues.age.now')
        : bucket.unit === 'hours'
          ? t('site.issues.age.hours', { hours: String(bucket.value) })
          : t('site.issues.age.days', { days: String(bucket.value) });
  const strip = toneColor(p, issueStripTone(issue));
  const sev = toneColor(p, issueSeverityTone(issue.severity));
  const mark = syncMark(issue.offlineSyncStatus);
  const markColor = toneColor(p, mark.tone);

  return (
    <View
      testID="issue-item"
      style={[
        styles.card,
        { backgroundColor: p.surface, borderColor: p.border, borderLeftColor: strip },
      ]}
    >
      {photoUri ? (
        <Image
          testID={`issue-photo-${issue.id}`}
          source={{ uri: photoUri }}
          style={styles.photo}
          resizeMode="cover"
          // Decorative here: the title beneath says what the issue is, and a photo of a defect has
          // no alternative text the app could truthfully write for it.
          accessible={false}
        />
      ) : null}

      <TouchableOpacity
        style={styles.body}
        accessibilityRole={onPress ? 'button' : undefined}
        accessibilityLabel={issue.title}
        onPress={onPress}
        // A card with nothing to open must not look pressable — the drawing's chevron is a promise.
        disabled={onPress === undefined}
        activeOpacity={0.8}
      >
        <View style={styles.main}>
          <View style={styles.head}>
            <Text style={[styles.code, { color: p.muted }]}>{shortId(issue.issueId)}</Text>
            <View style={styles.syncRow}>
              <Text style={[styles.syncText, { color: markColor }]}>
                {statusLabel(issue.offlineSyncStatus)}
              </Text>
              <MaterialIcons name={mark.icon} size={14} color={markColor} />
            </View>
          </View>

          {/* A RESOLVED ISSUE IS NOT DIMMED, NOT STRUCK, AND NOT LESS TAPPABLE THAN ANY OTHER (PO
              decision 2026-08-12: "การ์ดทุกใบต้องกดได้"). The card carried both a strike-through and
              a 0.7 opacity over the whole plate, and together they made the two resolved cards read
              as disabled — the record of a fixed defect is exactly what an engineer opens, so it
              must not look switched off. Its green strip and RESOLVED chip already say it is done;
              the title keeps the muted colour so it still recedes against the open ones. */}
          <Text style={[styles.title, { color: closed ? p.muted : p.text }]} numberOfLines={2}>
            {issue.title}
          </Text>

          <View style={styles.meta}>
            {/* Tinted, not filled — `bg-mobile-danger/20 text-mobile-danger` in the drawing. RN has
                no colour-mix, so the tint is the same hue at low opacity behind full-strength text. */}
            <View style={[styles.metaChip, { borderColor: sev }]}>
              <Text style={[styles.metaChipText, { color: sev }]}>
                {statusLabel(issue.severity)}
              </Text>
            </View>
            <View style={[styles.metaChip, { borderColor: p.border }]}>
              <Text style={[styles.metaChipText, { color: p.muted }]}>
                {statusLabel(issue.status)}
              </Text>
            </View>
            {/* The drawing's location line, filled with the issue's category — see the header note.
                `category` rather than `location_on`: the glyph must not promise a place. */}
            {issue.issueType === null ? null : (
              <View style={styles.metaItem}>
                <MaterialIcons name="category" size={13} color={p.muted} />
                <Text style={[styles.metaText, { color: p.muted }]}>
                  {t(`site.issues.types.${issue.issueType}`)}
                </Text>
              </View>
            )}
            {/* The drawing's "2h ago", from the issue's own created_at. Reuses lib/waitingAge.ts —
                the same coarse buckets the approvals queue uses, so an age reads one way across the
                app. Absent (a row cached before DDL v6, or an unparseable stamp) → nothing shown. */}
            {age === null ? null : (
              <View style={styles.metaItem}>
                <MaterialIcons name="history" size={13} color={p.muted} />
                <Text style={[styles.metaText, { color: p.muted }]}>{age}</Text>
              </View>
            )}
          </View>

          {children}
        </View>

        {/* THE DRAWING'S CHEVRON, ALWAYS (PO decision 2026-08-12: "ใส่ Chevron ในการ์ดเหมือนกับใน
            mockup"). It was conditional on `onPress` while the board had no issue-detail route to
            open — there still is none, so it points at nothing today and is dimmed to say so rather
            than promising a tap that does nothing. It becomes live the moment a detail screen
            exists, without this card changing shape under the reader. */}
        <MaterialIcons
          name="chevron-right"
          size={22}
          color={p.muted}
          style={onPress ? undefined : styles.chevronIdle}
        />
      </TouchableOpacity>
    </View>
  );
});

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    borderWidth: 1,
    // The drawing's `w-1.5` strip, drawn as the card's own left border so a photo header sits above
    // it cleanly instead of beside it.
    borderLeftWidth: 6,
    overflow: 'hidden',
  },
  // Dimmed, not hidden — a resolved issue stays on the board so the engineer can see it was closed.
  closed: { opacity: 0.7 },
  photo: { width: '100%', height: 128 },
  body: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, padding: spacing.md },
  main: { flex: 1, gap: spacing.xs },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  code: {
    fontFamily: fontFamily.medium,
    fontSize: typography.label.fontSize,
    letterSpacing: 0.5,
  },
  syncRow: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  syncText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.8,
    textTransform: 'uppercase',
  },
  title: { fontFamily: fontFamily.semibold, fontSize: typography.body.fontSize },
  chevronIdle: { opacity: 0.4 },
  meta: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { fontFamily: fontFamily.regular, fontSize: typography.label.fontSize },
  // SQUARED TO THE CARD, not a capsule (PO decision 2026-08-12). These two are inline meta TAGS on
  // a card — the drawing gives them `rounded`, its squarest corner — and a capsule made them read as
  // the app's status pills, which is a different thing that appears elsewhere on the same screens.
  // `radius.lg` is the card's own corner, so a tag sits inside its container's shape rather than
  // fighting it. Exempted by name in theme/__tests__/badgeRadius.spec.ts, which otherwise holds
  // every pill/badge/chip at radius.xl (§32.7).
  metaChip: {
    borderWidth: 1,
    // `radius.sm` (2px) — the drawing's `rounded`, which in its Tailwind config is the 0.125rem
    // DEFAULT, not a capsule and not the card's own 8px. The first two passes used radius.xl then
    // radius.lg and both still read as rounded (PO decision 2026-08-12, third correction).
    borderRadius: radius.sm,
    paddingHorizontal: spacing.xs,
    paddingVertical: 1,
  },
  metaChipText: {
    fontFamily: fontFamily.bold,
    fontSize: 10,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
  },
});
