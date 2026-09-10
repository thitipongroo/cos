// Leads — CRM_SALES_MANAGER: the lead directory, and the place a lead is captured (§20.7.10).
//
// DRAWING: mockup/mobile/12_crm_manager/02_leeds/01_leads_directory, pulled from Stitch 2026-09-10.
//
// Create is the point of this screen being on a phone at all: a lead arrives as a phone call or a
// site-gate conversation, and the capture has to happen before the details are lost. Every field on
// CreateLeadDto is optional server-side, so the only rule enforced here is "say who or which
// company" — a lead with neither is a row nobody can follow up, and the server would accept it.
//
// THE FORM MOVED BEHIND THE FAB (2026-09-10). It used to sit at the top of the screen, above the
// list, which is what the previous drawing showed. This one shows a `+` button over the list
// instead, and the reason it is an improvement rather than a change of taste: the form was two
// inputs and a button occupying the first third of the screen on every visit, while the screen is
// read far more often than it is written to. The inputs keep their testIDs — they are the same two
// fields, in a sheet.
//
// Online-only (api/crm.ts uses post(), not mutate()): unlike a site report, a lead captured offline
// and replayed later has no ordering hazard worth the queue's complexity, and a failed POST that
// surfaces immediately lets the user fall back to writing it down.
//
// ── THE CHIPS ARE THE REAL STATES, UNDER THE DRAWING'S SHAPE ────────────────────────────────────
//
// The drawing labels its three filter chips Hot / Warm / Cold. `crm.leads.status` is
// `NEW | QUALIFIED | DISQUALIFIED` — a workflow state, not a temperature — and nothing in the CRM
// records how warm a lead feels. Inventing one would put a number on a salesperson's judgement and
// then let the app act as though it had measured it.
//
// So the chips keep the drawing's shape, its counts and its colours, and take the real states'
// names. The counts are computed over the fetched list, so a chip cannot disagree with the rows
// under it. Status also drives the next step — only a NEW or QUALIFIED lead is a candidate for an
// opportunity, and the Opportunities screen filters on exactly that.
//
// WHAT IS DRAWN: the AI score on each card and the insight card above them (LEAD_AI_SCORE,
// LEAD_INSIGHT). Nothing scores a lead; `crm.leads` has no numeric column at all.

import { memo, useMemo, useState } from 'react';
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useT } from '../../i18n';
import type { TranslateFn } from '../../i18n';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { SearchField, SearchFieldButton } from '../../components/SearchField';
import { CreateSheet, sheetInputStyle } from '../../components/CreateSheet';
import { FilterChips } from '../../components/FilterChips';
import { useCountedList } from '../../hooks/useCountedList';
import { Fab } from '../../components/Fab';
import { AiCardFooter } from '../../components/AiCardFooter';
import { useComingSoon } from '../../components/useComingSoon';
import { LEAD_AI_SCORE, LEAD_INSIGHT } from '../../lib/mockupFigures';
import { listLeads, createLead, type Lead } from '../../api/crm';
import {
  fontFamily,
  plateRadius,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';

/** The drawing's four chips, with the real state each one filters on. */
const FILTERS: readonly { id: Lead['status'] | 'ALL'; labelKey: string }[] = [
  { id: 'ALL', labelKey: 'crm.leads.filterAll' },
  { id: 'NEW', labelKey: 'status.NEW' },
  { id: 'QUALIFIED', labelKey: 'status.QUALIFIED' },
  { id: 'DISQUALIFIED', labelKey: 'status.DISQUALIFIED' },
];

/** The colour each state carries, in the drawing's order: new, working, closed. */
function toneFor(p: Palette, status: Lead['status']): string {
  return status === 'NEW' ? p.warning : status === 'QUALIFIED' ? p.success : p.muted;
}

/**
 * One lead, memoized. /crm/leads has no LIMIT, so this is the row of a list that grows with the
 * tenant's whole pipeline; the title is a fallback chain and belongs with the row that draws it.
 */
const LeadItem = memo(function LeadItem({
  lead,
  index,
  s,
  p,
  t,
  onPress,
}: {
  lead: Lead;
  index: number;
  s: ReturnType<typeof makeStyles>;
  p: Palette;
  t: TranslateFn;
  onPress: () => void;
}) {
  const tone = toneFor(p, lead.status);
  // DRAWN. Assigned by position so the figure is stable for a given list rather than random per
  // render — see LEAD_AI_SCORE for what would replace it.
  const score = LEAD_AI_SCORE.value[index % LEAD_AI_SCORE.value.length]!;
  const title = lead.company ?? lead.contact_name ?? t('crm.leads.untitled');
  const meta = [lead.contact_name === title ? null : lead.contact_name, lead.source]
    .filter(Boolean)
    .join(' • ');
  return (
    <Pressable
      testID="lead-item"
      accessibilityRole="button"
      accessibilityLabel={title}
      onPress={onPress}
      style={s.card}
    >
      <View style={[s.accent, { backgroundColor: tone }]} />
      <View style={s.cardBody}>
        <View style={s.cardTop}>
          <View style={s.cardText}>
            <Text style={s.name} numberOfLines={1}>
              {title}
            </Text>
            {/* REAL — the contact and the source, which is what `crm.leads` actually holds.
                THE CONTACT IS DROPPED WHEN IT IS ALREADY THE TITLE. A lead with no company falls
                back to the contact's name above, and printing it again here put the same person on
                one card twice. */}
            {meta === '' ? null : (
              <View style={s.metaRow}>
                <MaterialIcons name="location-on" size={14} color={p.muted} />
                <Text style={s.meta} numberOfLines={1}>
                  {meta}
                </Text>
              </View>
            )}
          </View>
          <View style={s.scoreBox}>
            <Text style={[s.score, { color: tone }]}>{score}</Text>
            <Text style={s.scoreLabel}>{t('crm.leads.aiScore')}</Text>
          </View>
        </View>
        <View style={s.cardFoot}>
          <View style={[s.statusChip, { borderColor: `${tone}55`, backgroundColor: `${tone}1A` }]}>
            <Text style={[s.statusText, { color: tone }]}>{t(`status.${lead.status}`)}</Text>
          </View>
          <View style={s.dateRow}>
            <MaterialIcons name="calendar-today" size={13} color={p.muted} />
            {/* REAL — `created_at`, rendered by the device's locale. */}
            <Text style={s.date}>{new Date(lead.created_at).toLocaleDateString()}</Text>
          </View>
          <MaterialIcons name="chevron-right" size={18} color={p.muted} />
        </View>
      </View>
    </Pressable>
  );
});

/** The insight card's glyph plate. */
const PLATE = 28;

export default function LeadsScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const dark = useIsDark();
  const s = useMemo(() => makeStyles(p), [p]);
  const sheetInput = useMemo(() => sheetInputStyle(p), [p]);
  const soon = useComingSoon();

  const { rows, loading, counts, reload, prepend } = useCountedList<Lead>(listLeads);
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Lead['status'] | 'ALL'>('ALL');
  const [contactName, setContactName] = useState('');
  const [company, setCompany] = useState('');

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== 'ALL' && r.status !== filter) return false;
      if (q === '') return true;
      return (
        (r.company ?? '').toLowerCase().includes(q) ||
        (r.contact_name ?? '').toLowerCase().includes(q)
      );
    });
  }, [rows, query, filter]);

  const canSave = contactName.trim().length > 0 || company.trim().length > 0;

  const onCreate = async (): Promise<void> => {
    if (!canSave || saving) return;
    setSaving(true);
    try {
      const created = await createLead({
        contact_name: contactName.trim() || undefined,
        company: company.trim() || undefined,
      });
      prepend(created);
      setContactName('');
      setCompany('');
      setSheet(false);
    } catch {
      /* the sheet stays open with the text still in it, so nothing typed is lost */
    } finally {
      setSaving(false);
    }
  };

  return (
    <View testID="leads-screen" style={s.screen}>
      {/* SEARCH — the drawing carries the filter button inside the field. */}
      <SearchField
        testID="leads-search"
        value={query}
        onChangeText={setQuery}
        placeholder={t('crm.leads.searchPlaceholder')}
      >
        <SearchFieldButton
          testID="leads-tune"
          icon="tune"
          label={t('crm.leads.moreFilters')}
          onPress={() => soon('crm.leads.moreFilters')}
        />
      </SearchField>

      <FilterChips
        testIDPrefix="leads"
        chips={FILTERS.map(({ id, labelKey }) => ({
          id,
          label: t(labelKey),
          tone: id === 'ALL' ? p.primary : toneFor(p, id as Lead['status']),
          // The state chips carry a dot in their own tone — that tone is the state's identity on
          // the card's accent and its status pill too, so the row and the list agree at a glance.
          mark: id === 'ALL' ? ('check' as const) : ('dot' as const),
        }))}
        selected={filter}
        counts={counts}
        onSelect={(id) => setFilter(id as Lead['status'] | 'ALL')}
      />

      {/* INSIGHT — drawn in full: nothing scores a lead. See LEAD_INSIGHT. */}
      <View testID="leads-insight" style={s.insight}>
        <View style={s.insightHead}>
          <View style={s.insightPlate}>
            <MaterialIcons name="auto-awesome" size={16} color={p.accent} />
          </View>
          <Text style={s.insightTitle}>{t('crm.leads.insight')}</Text>
          <Pressable
            testID="leads-insight-act"
            accessibilityRole="button"
            accessibilityLabel={t('crm.leads.insightAction')}
            onPress={() => soon('crm.leads.insight')}
            style={s.insightAction}
          >
            <Text style={s.insightActionText}>{t('crm.leads.insightAction')}</Text>
            <MaterialIcons name="chevron-right" size={14} color={p.bg} />
          </Pressable>
        </View>
        <Text style={s.insightBody}>
          {t('crm.leads.insightBody', { count: String(LEAD_INSIGHT.value.highPotential) })}
        </Text>
        <AiCardFooter
          testID="leads-insight-foot"
          percent={LEAD_INSIGHT.value.confidence}
          source={t('crm.leads.title')}
          confLabel={t('insight.confShort')}
          sourceLabel={t('insight.sourceShort')}
          // The body already offers the "recommended" action (PO 2026-09-09).
          bodyHasAction
          palette={p}
        />
      </View>

      <LoadingBoundary
        loading={loading && rows.length === 0}
        variant="list"
        theme={dark ? 'dark' : 'light'}
        style={s.listRegion}
      >
        <FlatList
          testID="lead-list"
          data={visible}
          keyExtractor={(l) => l.lead_id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} />}
          ListEmptyComponent={<Text style={s.empty}>{t('crm.leads.empty')}</Text>}
          renderItem={({ item, index }) => (
            <LeadItem
              lead={item}
              index={index}
              s={s}
              p={p}
              t={t}
              onPress={() => soon('crm.leads.title')}
            />
          )}
        />
      </LoadingBoundary>

      {/* THE FAB IS REAL — `createLead` exists and this is the screen's reason for being. */}
      <Fab
        testID="create-lead-fab"
        accessibilityLabel={t('crm.leads.create')}
        onPress={() => setSheet(true)}
      />

      <CreateSheet
        testID="create-lead-sheet"
        visible={sheet}
        onClose={() => setSheet(false)}
        title={t('crm.leads.newLead')}
        closeLabel={t('common.close')}
        closeTestID="create-lead-close"
        saveTestID="create-lead-button"
        saveLabel={t('crm.leads.create')}
        savingLabel={t('crm.leads.saving')}
        canSave={canSave}
        saving={saving}
        onSave={() => void onCreate()}
      >
        {/* The same two fields, with the same testIDs they had when they sat inline. */}
        <TextInput
          testID="lead-contact-input"
          value={contactName}
          onChangeText={setContactName}
          placeholder={t('crm.leads.contactName')}
          placeholderTextColor={p.muted}
          accessibilityLabel={t('crm.leads.contactName')}
          style={sheetInput}
        />
        <TextInput
          testID="lead-company-input"
          value={company}
          onChangeText={setCompany}
          placeholder={t('crm.leads.company')}
          placeholderTextColor={p.muted}
          accessibilityLabel={t('crm.leads.company')}
          style={sheetInput}
        />
      </CreateSheet>
    </View>
  );
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: p.bg, padding: spacing.md, gap: spacing.sm },

    // A circle: 999 marks a shape whose radius is half its width.
    dot: { width: 7, height: 7, borderRadius: 999 },
    chipText: { color: p.text, fontFamily: fontFamily.medium, fontSize: 11 },
    chipCount: { color: p.muted, fontFamily: fontFamily.semibold, fontSize: 11 },

    insight: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${p.accent}4D`,
      borderLeftWidth: 4,
      borderLeftColor: p.accent,
      backgroundColor: p.surface,
      padding: spacing.sm,
      gap: spacing.xs,
    },
    insightHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    insightPlate: {
      width: PLATE,
      height: PLATE,
      borderRadius: plateRadius(PLATE),
      backgroundColor: `${p.accent}26`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    insightTitle: {
      flex: 1,
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    insightAction: {
      minHeight: touchTarget.secondaryButton,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.xl,
      backgroundColor: p.accent,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
    },
    insightActionText: { color: p.bg, fontFamily: fontFamily.semibold, fontSize: 11 },
    insightBody: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },

    listRegion: { flex: 1 },
    list: { gap: spacing.sm, paddingBottom: spacing.xl * 2 },
    empty: {
      marginTop: spacing.lg,
      textAlign: 'center',
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },

    card: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      flexDirection: 'row',
      overflow: 'hidden',
    },
    accent: { width: 4 },
    cardBody: { flex: 1, padding: spacing.sm, gap: spacing.xs },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    cardText: { flex: 1, gap: 2 },
    name: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
      lineHeight: typography.title.lineHeight,
    },
    metaRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },
    meta: { flex: 1, color: p.muted, fontFamily: fontFamily.regular, fontSize: 11 },
    scoreBox: {
      minWidth: 60,
      alignItems: 'center',
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xs / 2,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceBright,
    },
    score: {
      fontFamily: fontFamily.bold,
      fontSize: typography.hero.fontSize,
      lineHeight: typography.hero.lineHeight,
    },
    scoreLabel: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: 9,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    cardFoot: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    statusChip: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    statusText: {
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    dateRow: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 3 },
    date: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 11 },
  });
}
