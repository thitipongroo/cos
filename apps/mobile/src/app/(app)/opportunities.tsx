// Opportunities — CRM_SALES_MANAGER: the deal list, where a lead becomes a customer (§20.7.10).
//
// DRAWING: mockup/mobile/12_crm_manager/06_opportunities/01_crm_opportunities, from Stitch
// 2026-09-10.
//
// ── CONVERT SURVIVES THE REDRAW, AND THAT IS THE POINT OF ADR-085 ───────────────────────────────
//
// The drawing's card footer offers "จัดการดีล" — manage the deal — and nothing else. This screen's
// one irreplaceable action is CONVERT: `PATCH /crm/opportunities/{id}/convert` writes
// `finance.customers` and is the only way a customer record comes into existence (ADR-024/029).
// ADR-085 is explicit that "a drawing does not remove reviewed working capability", so convert
// keeps the footer slot on the rows that can use it and the drawing's label takes the rest.
//
// WHICH ROWS. Convert is offered only while the row can still be converted: OPEN. WON is terminal
// (COS-CRM-003) and LOST is not a customer. That gate is unchanged from the previous screen.
//
// ── THE FORM MOVED BEHIND THE FAB, as it did on the leads screen the same day ───────────────────
//
// Lead picker, title and value were pinned above the list. The drawing has a `+` instead. Same
// three fields, same testIDs, one tap further in — and the list, which is what the screen is for,
// starts at the top of the screen instead of halfway down it.
//
// ── WHAT IS REAL ───────────────────────────────────────────────────────────────────────────────
//
//   The rows          `listOpportunities()`
//   The value         `opportunities.value`, a DECIMAL string, summed in decimal.js (§14)
//   The chip counts   computed over the fetched list, so a chip cannot disagree with the rows
//   The stage chips   OPEN | WON | LOST, the three states the column actually holds
//   The total footer  the sum of OPEN values
//
// ── WHAT IS DRAWN (lib/mockupFigures.ts, ADR-099) ──────────────────────────────────────────────
//
//   OPPORTUNITY_FORECAST  the portfolio average, its delta and the forecast total — no historical
//                         series exists to compute any of them from
//   OPPORTUNITY_DETAIL    the per-card win rate, document state and urgency line. `status` is a
//                         three-state flag, not a probability, and no document record exists
//   OPPORTUNITY_PHOTO     the site photographs. INCLUDED by product-owner decision 2026-09-10 over
//                         the recommendation to omit them, and BUNDLED under `assets/crm/` rather
//                         than loaded from the drawing's Stitch CDN URLs — this app works offline
//                         and those URLs were measured expiring within the hour
//
// THE DRAWING'S FILTER CHIPS read Proposal / Negotiation / Closing / Won. Only the last is a state
// this CRM has. The other three are pipeline stages `crm.opportunities` does not model — the column
// is OPEN | WON | LOST — so the chips keep the drawing's shape and take the real states' names,
// exactly as the leads screen's Hot / Warm / Cold did.
//
// THE SPARKLINE IS NOT DRAWN AS A CHART. `design-tokens.md` says "Complex charts → simplify or
// desktop-only" for mobile. The trend is the figure beside it, which is the part a reader acts on.

import { memo, useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Image,
  TextInput,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import Decimal from 'decimal.js';
import { useT } from '../../i18n';
import type { TranslateFn } from '../../i18n';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { SearchField, SearchFieldButton } from '../../components/SearchField';
import { CreateSheet, sheetInputStyle } from '../../components/CreateSheet';
import { FilterChips } from '../../components/FilterChips';
import { countByStatus } from '../../lib/countByStatus';
import { Fab } from '../../components/Fab';
import { AiCardFooter } from '../../components/AiCardFooter';
import { useComingSoon } from '../../components/useComingSoon';
import { spacedMoney, compactMoneyLabel } from '../../lib/compactMoney';
import {
  OPPORTUNITY_DETAIL,
  OPPORTUNITY_FORECAST,
  OPPORTUNITY_PHOTO,
} from '../../lib/mockupFigures';
import {
  listOpportunities,
  createOpportunity,
  convertOpportunity,
  listLeads,
  type Opportunity,
  type Lead,
} from '../../api/crm';
import site1 from '../../../assets/crm/construction-site-1.jpg';
import site2 from '../../../assets/crm/construction-site-2.jpg';
import site3 from '../../../assets/crm/construction-site-3.jpg';
import {
  fontFamily,
  plateRadius,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';

/**
 * The bundled photographs, resolved at build time so they work with no network.
 *
 * `import`, not `require`: the repo's own precedent is `system-integration.tsx`, and the lint rule
 * forbids require-style imports. The three names are the ones `OPPORTUNITY_PHOTO` registers, and
 * the assertion below keeps that register and this list from drifting apart — a filename changed in
 * one place and not the other would otherwise ship a card with no picture and no error.
 */
const PHOTOS = [site1, site2, site3];
if (PHOTOS.length !== OPPORTUNITY_PHOTO.value.length) {
  throw new Error('OPPORTUNITY_PHOTO and the bundled files have drifted apart');
}

/** The drawing's chip row, over the states `crm.opportunities` actually has. */
const FILTERS: readonly { id: Opportunity['status'] | 'ALL'; labelKey: string }[] = [
  { id: 'ALL', labelKey: 'crm.opportunities.title' },
  { id: 'OPEN', labelKey: 'status.OPEN' },
  { id: 'WON', labelKey: 'status.WON' },
  { id: 'LOST', labelKey: 'status.LOST' },
];

function toneFor(p: Palette, status: Opportunity['status']): string {
  return status === 'OPEN' ? p.primary : status === 'WON' ? p.success : p.muted;
}

const OpportunityItem = memo(function OpportunityItem({
  opportunity,
  index,
  busy,
  working,
  onConvert,
  onManage,
  s,
  p,
  t,
}: {
  opportunity: Opportunity;
  index: number;
  /** Any row is converting, so no button may start another. */
  busy: boolean;
  /** THIS row is the one converting, so it is the one that says so. */
  working: boolean;
  onConvert: (id: string) => void;
  onManage: () => void;
  s: ReturnType<typeof makeStyles>;
  p: Palette;
  t: TranslateFn;
}) {
  const tone = toneFor(p, opportunity.status);
  // DRAWN, assigned by position so a given list renders the same figures every time.
  const detail = OPPORTUNITY_DETAIL.value[index % OPPORTUNITY_DETAIL.value.length]!;
  const photo = PHOTOS[index % PHOTOS.length]!;
  return (
    <View testID="opportunity-item" style={s.card}>
      <View style={[s.accent, { backgroundColor: tone }]} />
      <View style={s.cardBody}>
        <View style={s.cardTop}>
          <View style={s.cardText}>
            {/* REAL — the row's own id, shortened the way the drawing shortens it. */}
            <Text
              style={s.ref}
            >{`OPP-${opportunity.opportunity_id.slice(0, 8).toUpperCase()}`}</Text>
            {/* ONE LINE, ellipsised. Two lines pushed the win-rate box out of line with the row
                above it and made cards of different heights out of the same content. */}
            <Text style={s.name} numberOfLines={1} ellipsizeMode="tail">
              {opportunity.title}
            </Text>
          </View>
          {/* DRAWN — `status` is OPEN | WON | LOST, not a probability. */}
          <View style={s.winBox}>
            <Text style={s.winLabel}>{t('crm.opportunities.winRate')}</Text>
            <Text style={[s.winValue, { color: tone }]}>{`${detail.winRate}%`}</Text>
          </View>
        </View>

        {/* DRAWN — a bundled stock photograph, not this deal's site. See OPPORTUNITY_PHOTO. */}
        <View style={s.photoWrap}>
          <Image
            source={photo}
            style={s.photo}
            resizeMode="cover"
            accessibilityIgnoresInvertColors
          />
          <View style={s.photoFoot}>
            <Text style={s.photoText} numberOfLines={1}>
              {detail.docState}
            </Text>
          </View>
        </View>

        <View style={s.factRow}>
          <View style={s.fact}>
            <Text style={s.factLabel}>{t('crm.opportunities.projectValue')}</Text>
            {/* REAL — decimal.js, never a JS number (§14). An unpriced deal shows a dash. */}
            <Text style={s.factValue} numberOfLines={1}>
              {opportunity.value === null
                ? '—'
                : spacedMoney(new Decimal(opportunity.value), 'THB')}
            </Text>
          </View>
          {opportunity.expected_close_date === null ? null : (
            <View style={s.fact}>
              {/* `crm.opportunities.value` labelled this until 2026-09-10 — "Value" over a DATE.
                  The label named a figure the field was not showing, which is worse than a missing
                  label: a reader takes the money field beside it and this one as a pair. */}
              <Text style={s.factLabel}>{t('crm.opportunities.closeDate')}</Text>
              <View style={s.dateRow}>
                <MaterialIcons name="event" size={13} color={p.muted} />
                <Text style={s.factValue} numberOfLines={1}>
                  {new Date(opportunity.expected_close_date).toLocaleDateString()}
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={s.cardFoot}>
          <View style={[s.stageChip, { borderColor: `${tone}55`, backgroundColor: `${tone}1A` }]}>
            <View style={[s.dot, { backgroundColor: tone }]} />
            <Text style={[s.stageText, { color: tone }]}>{t(`status.${opportunity.status}`)}</Text>
          </View>
          {/* CONVERT KEEPS THE FOOTER SLOT while the row can use it — see the header. Everything
              else gets the drawing's "manage" label, which has no screen behind it yet. */}
          {opportunity.status === 'OPEN' ? (
            <Pressable
              testID={`convert-${opportunity.opportunity_id}`}
              accessibilityRole="button"
              accessibilityState={{ disabled: busy }}
              accessibilityLabel={t('crm.opportunities.convert')}
              disabled={busy}
              onPress={() => onConvert(opportunity.opportunity_id)}
              style={[s.footAction, busy && s.footActionOff]}
            >
              <Text style={s.footActionText} numberOfLines={1}>
                {working ? t('crm.opportunities.converting') : t('crm.opportunities.convert')}
              </Text>
              <MaterialIcons name="arrow-forward" size={14} color={p.onPrimary} />
            </Pressable>
          ) : (
            <Pressable
              testID={`manage-${opportunity.opportunity_id}`}
              accessibilityRole="button"
              accessibilityLabel={t('crm.opportunities.manageDeal')}
              onPress={onManage}
              style={[s.footAction, s.footActionGhost]}
            >
              <Text style={s.footGhostText} numberOfLines={1}>
                {t('crm.opportunities.manageDeal')}
              </Text>
              <MaterialIcons name="arrow-forward" size={14} color={p.text} />
            </Pressable>
          )}
        </View>
      </View>
    </View>
  );
});

/** The forecast card's glyph plate. */
const PLATE = 32;

export default function OpportunitiesScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const dark = useIsDark();
  const s = useMemo(() => makeStyles(p), [p]);
  const sheetInput = useMemo(() => sheetInputStyle(p), [p]);
  const soon = useComingSoon();

  const [rows, setRows] = useState<Opportunity[]>([]);
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [converting, setConverting] = useState<string | null>(null);
  const [sheet, setSheet] = useState(false);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<Opportunity['status'] | 'ALL'>('ALL');
  const [leadId, setLeadId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [value, setValue] = useState('');

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const [opps, allLeads] = await Promise.all([listOpportunities(), listLeads()]);
      setRows(opps);
      setLeads(allLeads);
    } catch {
      /* offline — the list keeps what it has */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Counts over the whole fetched list, so a chip can never disagree with the rows beneath it.
  const counts = useMemo(() => countByStatus(rows), [rows]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const kept = rows.filter((r) => {
      if (filter !== 'ALL' && r.status !== filter) return false;
      return q === '' || r.title.toLowerCase().includes(q);
    });
    // BIGGEST DEAL FIRST, and the section head says so. The drawing carries a "sorted by value"
    // line; printing that over an unsorted list would be a claim about the order that nothing
    // backs, so the list is actually sorted instead of the label being dropped.
    //
    // Compared with decimal.js, never with `+` on the strings: `value` is DECIMAL(19,4) and comes
    // over the wire as text, so "9500000" and "10000000" compare the wrong way round as strings.
    // An unpriced deal sorts last rather than first — a null is not a zero, but it is not a
    // headline either.
    return [...kept].sort((a, b) => {
      if (a.value === null) return b.value === null ? 0 : 1;
      if (b.value === null) return -1;
      return new Decimal(b.value).comparedTo(new Decimal(a.value));
    });
  }, [rows, query, filter]);

  // REAL — the open pipeline, summed in decimal.
  const openTotal = useMemo(
    () =>
      rows
        .filter((r) => r.status === 'OPEN')
        .reduce(
          (sum, r) => (r.value === null ? sum : sum.plus(new Decimal(r.value))),
          new Decimal(0),
        ),
    [rows],
  );

  // Only a lead that has not been disqualified is a candidate for an opportunity.
  const candidates = useMemo(() => leads.filter((l) => l.status !== 'DISQUALIFIED'), [leads]);
  const canSave = leadId !== null && title.trim().length > 0;

  const onCreate = async (): Promise<void> => {
    if (!canSave || saving || leadId === null) return;
    setSaving(true);
    try {
      const created = await createOpportunity({
        lead_id: leadId,
        title: title.trim(),
        value: value.trim() || undefined,
      });
      setRows((current) => [created, ...current]);
      setTitle('');
      setValue('');
      setLeadId(null);
      setSheet(false);
      // THE LEADS ARE RE-READ. Creating an opportunity QUALIFIES its lead server-side, so the
      // picker's list is stale the moment this succeeds — a lead that has become an opportunity
      // should not still be offered as the start of another one.
      void listLeads()
        .then(setLeads)
        .catch(() => {
          /* the picker keeps the list it has; the row was still created */
        });
    } catch {
      /* the sheet stays open with what was typed still in it */
    } finally {
      setSaving(false);
    }
  };

  const onConvert = useCallback(async (id: string): Promise<void> => {
    setConverting(id);
    try {
      await convertOpportunity(id);
      setRows((current) =>
        current.map((r) => (r.opportunity_id === id ? { ...r, status: 'WON' as const } : r)),
      );
    } catch {
      /* the row keeps its state; the server rejected or the network did */
    } finally {
      setConverting(null);
    }
  }, []);

  return (
    <View testID="opportunities-screen" style={s.screen}>
      <SearchField
        testID="opportunities-search"
        value={query}
        onChangeText={setQuery}
        placeholder={t('crm.opportunities.searchPlaceholder')}
      >
        <SearchFieldButton
          testID="opportunities-tune"
          icon="tune"
          label={t('crm.opportunities.moreFilters')}
          onPress={() => soon('crm.opportunities.moreFilters')}
        />
      </SearchField>

      {/* No leading marks: this drawing gives OPEN/WON/LOST none, unlike the lead states. */}
      <FilterChips
        testIDPrefix="opportunities"
        chips={FILTERS.map(({ id, labelKey }) => ({
          id,
          label: t(labelKey),
          tone: id === 'ALL' ? p.primary : toneFor(p, id as Opportunity['status']),
        }))}
        selected={filter}
        counts={counts}
        onSelect={(id) => setFilter(id as Opportunity['status'] | 'ALL')}
      />

      {/* THE DRAWING'S SECTION HEAD, which this screen was missing: what the list is, how many
          rows are in it, and the order they are in. All three are real — the count is the filtered
          list's own length and the order is the sort above. */}
      <View style={s.sectionHead}>
        <Text style={s.sectionLabel} accessibilityRole="header">
          {t('crm.opportunities.title')}
        </Text>
        <View testID="opportunities-count" style={s.countChip}>
          <Text style={s.countText}>
            {t('crm.opportunities.dealCount', { count: visible.length })}
          </Text>
        </View>
        <Text style={s.sortNote} numberOfLines={1}>
          {t('crm.opportunities.sortBy')}
        </Text>
      </View>

      <LoadingBoundary
        loading={loading && rows.length === 0}
        variant="list"
        theme={dark ? 'dark' : 'light'}
        style={s.listRegion}
      >
        <FlatList
          testID="opportunity-list"
          data={visible}
          keyExtractor={(o) => o.opportunity_id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={<Text style={s.empty}>{t('crm.opportunities.empty')}</Text>}
          ListHeaderComponent={
            /* FORECAST — drawn in full; no historical series exists. */
            <View testID="opportunities-forecast" style={s.forecast}>
              <View style={[s.accent, { backgroundColor: p.accent }]} />
              <View style={s.forecastBody}>
                <View style={s.forecastHead}>
                  <View style={s.forecastPlate}>
                    <MaterialIcons name="psychology" size={18} color={p.accent} />
                  </View>
                  <Text style={s.forecastTitle} numberOfLines={1}>
                    {t('crm.opportunities.forecastTitle')}
                  </Text>
                </View>
                <View style={s.forecastRow}>
                  <View style={s.forecastCell}>
                    <Text style={s.factLabel}>{t('crm.opportunities.portfolioAverage')}</Text>
                    <View style={s.dateRow}>
                      <Text style={s.forecastValue}>{OPPORTUNITY_FORECAST.value.average}</Text>
                      <MaterialIcons name="arrow-upward" size={13} color={p.success} />
                      <Text style={s.delta}>{OPPORTUNITY_FORECAST.value.delta}</Text>
                    </View>
                  </View>
                  <View style={s.forecastCell}>
                    <Text style={s.factLabel}>{t('crm.opportunities.forecastLabel')}</Text>
                    <Text style={[s.forecastValue, { color: p.accent }]}>
                      {OPPORTUNITY_FORECAST.value.forecast}
                    </Text>
                  </View>
                </View>
                <View style={s.adviceRow}>
                  <MaterialIcons name="bolt" size={16} color={p.warning} />
                  <Text style={s.advice}>{t('crm.opportunities.advice')}</Text>
                </View>
                <Pressable
                  testID="opportunities-analysis"
                  accessibilityRole="button"
                  accessibilityLabel={t('crm.opportunities.viewAnalysis')}
                  onPress={() => soon('crm.opportunities.viewAnalysis')}
                  style={s.forecastAction}
                >
                  <MaterialIcons name="insights" size={16} color={p.bg} />
                  <Text style={s.forecastActionText} numberOfLines={1}>
                    {t('crm.opportunities.viewAnalysis')}
                  </Text>
                </Pressable>
                <AiCardFooter
                  testID="opportunities-forecast-foot"
                  percent={OPPORTUNITY_FORECAST.value.confidence}
                  source={t('crm.opportunities.title')}
                  confLabel={t('insight.confShort')}
                  sourceLabel={t('insight.sourceShort')}
                  bodyHasAction
                  palette={p}
                />
              </View>
            </View>
          }
          ListFooterComponent={
            visible.length === 0 ? null : (
              /* REAL — the open pipeline, in decimal. */
              <View testID="opportunities-total" style={s.totalRow}>
                <MaterialIcons name="account-balance-wallet" size={18} color={p.accent} />
                <Text style={s.totalLabel}>{t('crm.opportunities.totalValue')}</Text>
                <Text style={s.totalValue}>
                  {compactMoneyLabel(openTotal, 'THB', t, { maxScale: 'million' })}
                </Text>
              </View>
            )
          }
          renderItem={({ item, index }) => (
            <OpportunityItem
              opportunity={item}
              index={index}
              // BUSY IS GLOBAL, not per row: a convert writes finance.customers, and two in flight
              // at once is a race the server has no reason to referee. Every button greys while any
              // one of them is working — which is what the previous screen did.
              busy={converting !== null}
              working={converting === item.opportunity_id}
              onConvert={(id) => void onConvert(id)}
              onManage={() => soon('crm.opportunities.manageDeal')}
              s={s}
              p={p}
              t={t}
            />
          )}
        />
      </LoadingBoundary>

      <Fab
        testID="create-opportunity-fab"
        accessibilityLabel={t('crm.opportunities.create')}
        onPress={() => setSheet(true)}
      />

      <CreateSheet
        testID="create-opportunity-sheet"
        visible={sheet}
        onClose={() => setSheet(false)}
        title={t('crm.opportunities.newOpportunity')}
        closeLabel={t('common.close')}
        closeTestID="create-opportunity-close"
        saveTestID="create-opportunity-button"
        saveLabel={t('crm.opportunities.create')}
        savingLabel={t('crm.opportunities.saving')}
        canSave={canSave}
        saving={saving}
        onSave={() => void onCreate()}
      >
        <Text style={s.factLabel}>{t('crm.opportunities.fromLead')}</Text>
        {candidates.length === 0 ? (
          <Text style={s.empty}>{t('crm.opportunities.noLeads')}</Text>
        ) : (
          <View style={s.leadRow}>
            {candidates.map((l) => (
              <Pressable
                key={l.lead_id}
                testID={`opp-lead-${l.lead_id}`}
                accessibilityRole="button"
                accessibilityState={{ selected: leadId === l.lead_id }}
                // THE LABEL FALLS BACK TO THE ID, not to "Unnamed lead". Three nameless leads
                // would otherwise announce the same words three times, leaving a screen-reader
                // user no way to tell the chips apart. The visible text still reads as words.
                accessibilityLabel={l.company ?? l.contact_name ?? l.lead_id}
                // TOGGLES. Pressing the chosen lead again clears it — the previous screen did
                // this and the redraw dropped it, which left no way back out of a wrong pick
                // except closing the sheet and losing the title typed beside it.
                onPress={() => setLeadId((c) => (c === l.lead_id ? null : l.lead_id))}
                style={[s.chip, leadId === l.lead_id && s.chipOn]}
              >
                <Text style={[s.chipText, leadId === l.lead_id && { color: p.onPrimary }]}>
                  {l.company ?? l.contact_name ?? t('crm.leads.untitled')}
                </Text>
              </Pressable>
            ))}
          </View>
        )}

        <TextInput
          testID="opp-title-input"
          value={title}
          onChangeText={setTitle}
          placeholder={t('crm.opportunities.titleField')}
          placeholderTextColor={p.muted}
          accessibilityLabel={t('crm.opportunities.titleField')}
          style={sheetInput}
        />
        <TextInput
          testID="opp-value-input"
          value={value}
          onChangeText={setValue}
          placeholder={t('crm.opportunities.value')}
          placeholderTextColor={p.muted}
          accessibilityLabel={t('crm.opportunities.value')}
          keyboardType="numeric"
          style={sheetInput}
        />
      </CreateSheet>
    </View>
  );
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    chip: {
      minHeight: touchTarget.secondaryButton,
      paddingHorizontal: spacing.xs,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    leadRow: { flexDirection: 'row', gap: spacing.xs / 2, flexWrap: 'wrap' },
    screen: { flex: 1, backgroundColor: p.bg, padding: spacing.md, gap: spacing.sm },

    chipOn: { backgroundColor: p.primary, borderColor: p.primary },
    chipText: { color: p.text, fontFamily: fontFamily.medium, fontSize: 11 },
    chipCount: { color: p.muted, fontFamily: fontFamily.semibold, fontSize: 11 },

    listRegion: { flex: 1 },
    list: { gap: spacing.sm, paddingBottom: spacing.xl * 2 },
    empty: {
      marginTop: spacing.sm,
      textAlign: 'center',
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },

    // ── Forecast ──────────────────────────────────────────────────────────────────────────────
    forecast: {
      marginBottom: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${p.accent}4D`,
      backgroundColor: p.surface,
      flexDirection: 'row',
      overflow: 'hidden',
    },
    forecastBody: { flex: 1, padding: spacing.sm, gap: spacing.xs },
    forecastHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    forecastPlate: {
      width: PLATE,
      height: PLATE,
      borderRadius: plateRadius(PLATE),
      backgroundColor: `${p.accent}26`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    forecastTitle: {
      flex: 1,
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    forecastRow: { flexDirection: 'row', gap: spacing.sm },
    sectionHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    sectionLabel: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.body.fontSize,
    },
    countChip: {
      paddingHorizontal: 8,
      paddingVertical: 2,
      borderRadius: radius.xl,
      backgroundColor: p.surfaceBright,
    },
    countText: { color: p.muted, fontFamily: fontFamily.semibold, fontSize: 10 },
    // The order the list is actually in — it gives way first when the row is tight.
    sortNote: {
      flex: 1,
      textAlign: 'right',
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: 10,
    },

    forecastCell: {
      flex: 1,
      gap: 2,
      padding: spacing.xs,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      // PORTFOLIO AVERAGE and FORECAST — raised on the card, not sunk into it.
      backgroundColor: p.surfaceSoft,
    },
    forecastValue: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
    },
    delta: { color: p.success, fontFamily: fontFamily.semibold, fontSize: 11 },
    adviceRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs / 2 },
    advice: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: 11,
      lineHeight: 11 * 1.5,
    },
    forecastAction: {
      minHeight: touchTarget.secondaryButton,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: p.accent,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs / 2,
    },
    forecastActionText: {
      flexShrink: 1,
      color: p.bg,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },

    // ── A deal card ───────────────────────────────────────────────────────────────────────────
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
    ref: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.4,
    },
    name: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.body.fontSize,
      lineHeight: typography.body.fontSize * 1.25,
    },
    winBox: { alignItems: 'flex-end' },
    winLabel: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: 9,
      letterSpacing: 0.5,
      textTransform: 'uppercase',
    },
    winValue: { fontFamily: fontFamily.bold, fontSize: typography.title.fontSize },

    photoWrap: { borderRadius: radius.lg, overflow: 'hidden', backgroundColor: p.surfaceSoft },
    photo: { width: '100%', height: 108 },
    // The caption strip lies ON the photograph, so it stays translucent — what changed is WHICH
    // colour it is translucent in. `${p.bg}CC` was the page colour, which put a hole across the
    // bottom of every picture; `E6` over the raised surface keeps the text legible on a bright
    // photo while still reading as a layer above the card.
    photoFoot: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 4,
      backgroundColor: `${p.surfaceSoft}E6`,
    },
    photoText: { color: p.muted, fontFamily: fontFamily.medium, fontSize: 10 },

    factRow: { flexDirection: 'row', gap: spacing.sm },
    fact: { flex: 1, gap: 1 },
    factLabel: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    factValue: {
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    dateRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },

    cardFoot: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    stageChip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    // A circle: 999 marks a shape whose radius is half its width.
    dot: { width: 6, height: 6, borderRadius: 999 },
    stageText: {
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    footAction: {
      flex: 1,
      minHeight: touchTarget.iconButton,
      borderRadius: radius.md,
      backgroundColor: p.primary,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 4,
      paddingHorizontal: spacing.xs,
    },
    footActionOff: { opacity: 0.5 },
    // "Manage deal" — the un-filled foot action. Raised like every other panel on the card; on the
    // page colour it read as a slot rather than a button.
    footActionGhost: { backgroundColor: p.surfaceSoft, borderWidth: 1, borderColor: p.border },
    footActionText: {
      flexShrink: 1,
      color: p.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: 11,
    },
    footGhostText: { flexShrink: 1, color: p.text, fontFamily: fontFamily.semibold, fontSize: 11 },

    totalRow: {
      marginTop: spacing.sm,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      padding: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    totalLabel: {
      flex: 1,
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    totalValue: {
      color: p.accent,
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
    },
  });
}
