// Customers — CRM_SALES_MANAGER: the read-only client list (§20.7.10).
//
// DRAWING: mockup/mobile/12_crm_manager/07_customers/01_crm_customers, from Stitch 2026-09-10.
//
// "Read-only" is the spec's word, not a shortcut: the row is created by converting a won
// opportunity (crm.service.ts writes finance.customers), so there is no create action to render
// here. Source is GET /crm/customers, which reads finance.customers — the canonical store
// (ADR-024/029) — rather than a CRM-local copy.
//
// ── IT LEFT `<FetchListScreen>` (2026-09-10) ────────────────────────────────────────────────────
//
// This screen was 29 lines: a heading, an endpoint and a three-field row mapper, all handed to the
// shared list component. The drawing asks for an avatar plate, a tier chip, a two-column fact panel
// and a contact row per card, none of which that component can express — it renders title, status
// and nothing else by design, which is what makes it shareable.
//
// `rfqs.tsx` is the other caller and is NOT touched: the component stays exactly as it is, and this
// screen stops being one of its two consumers rather than bending it into a third shape.
//
// ── WHAT IS REAL, AND IT IS THE SPINE OF EVERY CARD ────────────────────────────────────────────
//
//   company_name    the card's title
//   customer_type   the line under it
//   status          the state the card is coloured by
//   the count       the "all" chip, over the fetched list
//
// ── WHAT IS DRAWN (lib/mockupFigures.ts, ADR-099) ──────────────────────────────────────────────
//
//   CUSTOMER_RELATIONSHIP  the trust index and the repeat rate at the top. `finance.customers` is
//                          six columns and none of them scores anything
//   CUSTOMER_DETAIL        the tier chip, the project count and value, the payment terms and the
//                          contact person on each card — the drawing's whole middle section
//
// The card's AVATAR is the company's own initials, computed here rather than drawn: the drawing
// shows a logo, and no customer record carries an image.

import { useMemo, useState } from 'react';
import { View, Text, FlatList, Pressable, RefreshControl, StyleSheet } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { useT } from '../../i18n';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { useCountedList } from '../../hooks/useCountedList';
import { SearchCountChip, SearchField, SearchFieldButton } from '../../components/SearchField';
import { AiCardFooter } from '../../components/AiCardFooter';
import { useComingSoon } from '../../components/useComingSoon';
import { CUSTOMER_DETAIL, CUSTOMER_RELATIONSHIP } from '../../lib/mockupFigures';
import { listCustomers, type Customer } from '../../api/crm';
import {
  fontFamily,
  plateRadius,
  radius,
  spacing,
  touchTarget,
  typography,
} from '../../theme/tokens';

/** Up to two letters from the company's own name — no customer record carries a logo. */
function initials(name: string): string {
  return name
    .split(/\s+/)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

/** The relationship card's glyph plate. */
const PLATE = 32;

/**
 * The tone a status chip takes.
 *
 * `finance.customers.status` is VARCHAR(32) with an ACTIVE default and no enum, so this cannot be a
 * total map: anything not ACTIVE is drawn in the muted tone rather than assumed to be bad news.
 */
function statusTone(p: Palette, status: string): string {
  return status === 'ACTIVE' ? p.success : p.muted;
}

export default function CustomersScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const dark = useIsDark();
  const s = useMemo(() => makeStyles(p), [p]);
  const soon = useComingSoon();

  const [query, setQuery] = useState('');
  const { rows, loading, reload } = useCountedList<Customer>(listCustomers);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (q === '') return rows;
    return rows.filter((c) => c.company_name.toLowerCase().includes(q));
  }, [rows, query]);

  return (
    <View testID="customers-screen" style={s.screen}>
      <SearchField
        testID="customers-search"
        value={query}
        onChangeText={setQuery}
        placeholder={t('crm.customers.searchPlaceholder')}
      >
        <SearchFieldButton
          testID="customers-tune"
          icon="tune"
          label={t('crm.customers.moreFilters')}
          onPress={() => soon('crm.customers.moreFilters')}
        />
      </SearchField>

      {/* The drawing's chip row is four filters over attributes `finance.customers` does not have —
          Enterprise, Active, new-this-quarter. Only the count is real, so only the count is drawn:
          one chip, saying how many clients there are. */}
      <View style={s.chipRow}>
        <SearchCountChip
          testID="customers-count"
          icon="check-circle"
          label={t('crm.customers.title')}
          count={rows.length}
        />
      </View>

      <LoadingBoundary
        loading={loading && rows.length === 0}
        variant="list"
        theme={dark ? 'dark' : 'light'}
        style={s.listRegion}
      >
        <FlatList
          testID="customer-list"
          data={visible}
          keyExtractor={(c) => c.customer_id}
          contentContainerStyle={s.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void reload()} />}
          ListEmptyComponent={<Text style={s.empty}>{t('crm.customers.empty')}</Text>}
          ListHeaderComponent={
            /* RELATIONSHIP — drawn in full. Nothing scores a customer. */
            <View>
              <View testID="customers-relationship" style={s.relationship}>
                <View style={[s.accent, { backgroundColor: p.accent }]} />
                <View style={s.relBody}>
                  <View style={s.relHead}>
                    <View style={s.relPlate}>
                      <MaterialIcons name="psychology" size={18} color={p.accent} />
                    </View>
                    <Text style={s.relTitle} numberOfLines={1}>
                      {t('crm.customers.relationship')}
                    </Text>
                  </View>
                  <View style={s.relRow}>
                    <View style={s.relCell}>
                      <Text style={s.factLabel}>{t('crm.customers.trustIndex')}</Text>
                      <View style={s.relValueRow}>
                        <Text style={s.relValue}>{CUSTOMER_RELATIONSHIP.value.trustIndex}</Text>
                        {/* A bare "89" does not say what it is out of. The denominator is part of
                            the same registered figure's presentation, not a second claim. */}
                        <Text style={s.relOutOf}>/100</Text>
                      </View>
                    </View>
                    <View style={s.relCell}>
                      <Text style={s.factLabel}>{t('crm.customers.repeatRate')}</Text>
                      <Text style={[s.relValue, { color: p.success }]}>
                        {CUSTOMER_RELATIONSHIP.value.repeatRate}
                      </Text>
                      <Text style={s.relMeta} numberOfLines={1}>
                        {t('crm.customers.repeatProjects', {
                          count: String(CUSTOMER_RELATIONSHIP.value.repeatProjects),
                        })}
                      </Text>
                    </View>
                  </View>
                  <AiCardFooter
                    testID="customers-relationship-foot"
                    percent={null}
                    source={t('crm.customers.title')}
                    confLabel={t('insight.confShort')}
                    sourceLabel={t('insight.sourceShort')}
                    palette={p}
                  />
                </View>
              </View>
              <Text style={s.sectionLabel} accessibilityRole="header">
                {t('crm.customers.heading')}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => {
            // DRAWN, by position so a given list renders the same figures every time.
            const detail = CUSTOMER_DETAIL.value[index % CUSTOMER_DETAIL.value.length]!;
            return (
              <View testID="customer-item" style={s.card}>
                <View style={[s.accent, { backgroundColor: p.primary }]} />
                <View style={s.cardBody}>
                  <View style={s.cardTop}>
                    <View style={s.avatar}>
                      <Text style={s.avatarText}>{initials(item.company_name)}</Text>
                    </View>
                    <View style={s.cardText}>
                      {/* REAL — the company, and what kind of client it is. */}
                      {/* ONE LINE, ellipsised (PO 2026-09-10). A company name that wrapped made
                          a taller card than its neighbours and pushed the tier chip out of line
                          with the row above it — "Ladprao Property Development Co., Ltd." was the
                          one that showed it. */}
                      <Text style={s.name} numberOfLines={1} ellipsizeMode="tail">
                        {item.company_name}
                      </Text>
                      <View style={s.subRow}>
                        {/* `customer_type` IS NULLABLE and is null for every customer this product
                            creates — crm.repository.ts inserts only tenant, opportunity, company and
                            status. A null draws NOTHING: no dash, no placeholder, and above all no
                            substituted status, which would put one fact under two labels. */}
                        {item.customer_type === null ? null : (
                          <Text style={s.sub} numberOfLines={1}>
                            {item.customer_type}
                          </Text>
                        )}
                        {/* REAL — `finance.customers.status`, ACTIVE by default. */}
                        <View
                          style={[
                            s.statusChip,
                            {
                              borderColor: `${statusTone(p, item.status)}55`,
                              backgroundColor: `${statusTone(p, item.status)}1A`,
                            },
                          ]}
                        >
                          <Text style={[s.statusText, { color: statusTone(p, item.status) }]}>
                            {t(`status.${item.status}`)}
                          </Text>
                        </View>
                      </View>
                    </View>
                    {/* DRAWN — no tier column exists. */}
                    <View style={s.tier}>
                      <Text style={s.tierText}>{detail.tier}</Text>
                    </View>
                  </View>

                  <View style={s.factPanel}>
                    <View style={s.fact}>
                      <Text style={s.factLabel}>{t('crm.customers.activeProjects')}</Text>
                      <Text style={s.factValue} numberOfLines={1}>
                        {t('crm.customers.projectsValue', {
                          count: detail.projects,
                          value: detail.value,
                        })}
                      </Text>
                    </View>
                    <View style={s.factDivider} />
                    <View style={s.fact}>
                      <Text style={s.factLabel}>{t('crm.customers.terms')}</Text>
                      <View style={s.termRow}>
                        <MaterialIcons name="verified-user" size={13} color={p.success} />
                        <Text style={[s.factValue, { color: p.success }]} numberOfLines={1}>
                          {detail.terms}
                        </Text>
                      </View>
                    </View>
                  </View>

                  <View style={s.cardFoot}>
                    <View style={s.contact}>
                      <MaterialIcons name="person" size={14} color={p.muted} />
                      <Text style={s.contactText} numberOfLines={1}>
                        {detail.contact}
                      </Text>
                    </View>
                    <Pressable
                      testID={`customer-history-${item.customer_id}`}
                      accessibilityRole="button"
                      accessibilityLabel={`${t('crm.customers.viewHistory')} — ${item.company_name}`}
                      onPress={() => soon('crm.customers.viewHistory')}
                      style={s.historyBtn}
                    >
                      <Text style={s.historyText} numberOfLines={1}>
                        {t('crm.customers.viewHistory')}
                      </Text>
                      <MaterialIcons name="arrow-forward" size={14} color={p.text} />
                    </Pressable>
                  </View>
                </View>
              </View>
            );
          }}
        />
      </LoadingBoundary>
    </View>
  );
}

function makeStyles(p: Palette) {
  return StyleSheet.create({
    screen: { flex: 1, backgroundColor: p.bg, padding: spacing.md, gap: spacing.sm },

    chipRow: { flexDirection: 'row', gap: spacing.xs / 2 },

    listRegion: { flex: 1 },
    list: { gap: spacing.sm, paddingBottom: spacing.xl },
    empty: {
      marginTop: spacing.lg,
      textAlign: 'center',
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },

    accent: { width: 4 },

    // ── Relationship ──────────────────────────────────────────────────────────────────────────
    relationship: {
      marginBottom: spacing.sm,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${p.accent}4D`,
      backgroundColor: p.surface,
      flexDirection: 'row',
      overflow: 'hidden',
    },
    relBody: { flex: 1, padding: spacing.sm, gap: spacing.xs },
    relHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    relPlate: {
      width: PLATE,
      height: PLATE,
      borderRadius: plateRadius(PLATE),
      backgroundColor: `${p.accent}26`,
      alignItems: 'center',
      justifyContent: 'center',
    },
    relTitle: {
      flex: 1,
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    relRow: { flexDirection: 'row', gap: spacing.sm },
    relCell: {
      flex: 1,
      gap: 1,
      padding: spacing.xs,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      // CONTRACT HEALTH INDEX and REPEAT RATE — raised on the card, not sunk into it.
      backgroundColor: p.surfaceSoft,
    },
    relValueRow: { flexDirection: 'row', alignItems: 'baseline', gap: 2 },
    relValue: { color: p.text, fontFamily: fontFamily.bold, fontSize: typography.hero.fontSize },
    relOutOf: { color: p.muted, fontFamily: fontFamily.medium, fontSize: 11 },
    relMeta: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10 },

    // ── A customer card ───────────────────────────────────────────────────────────────────────
    card: {
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      flexDirection: 'row',
      overflow: 'hidden',
    },
    cardBody: { flex: 1, padding: spacing.sm, gap: spacing.xs },
    cardTop: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.xs },
    avatar: {
      width: 40,
      height: 40,
      borderRadius: plateRadius(40),
      backgroundColor: p.surfaceBright,
      alignItems: 'center',
      justifyContent: 'center',
    },
    avatarText: { color: p.text, fontFamily: fontFamily.bold, fontSize: 12 },
    cardText: { flex: 1, gap: 2 },
    name: { color: p.text, fontFamily: fontFamily.bold, fontSize: typography.body.fontSize },
    subRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexWrap: 'wrap' },
    sub: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 11 },
    statusChip: {
      paddingHorizontal: 6,
      paddingVertical: 1,
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    statusText: { fontFamily: fontFamily.semibold, fontSize: 10, letterSpacing: 0.4 },
    sectionLabel: {
      marginTop: spacing.xs,
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    tier: {
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${p.accent}55`,
      backgroundColor: `${p.accent}1A`,
    },
    tierText: {
      color: p.accent,
      fontFamily: fontFamily.bold,
      fontSize: 10,
      letterSpacing: 0.5,
    },

    factPanel: {
      flexDirection: 'row',
      gap: spacing.sm,
      padding: spacing.xs,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      // ACTIVE PROJECTS and PAYMENT TERMS — SUNK INTO the card, not floating above it (PO
      // 2026-09-10). The drawing is explicit: this panel is `bg-surface-container-low` on a
      // `bg-surface-container` card, one step DOWN. It holds the card's own facts, and a recess is
      // what says they belong to it.
      backgroundColor: p.surfaceSunk,
    },
    fact: { flex: 1, gap: 1 },
    factDivider: { width: 1, backgroundColor: p.border },
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
    termRow: { flexDirection: 'row', alignItems: 'center', gap: 3 },

    cardFoot: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    contact: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 4 },
    contactText: { flex: 1, color: p.muted, fontFamily: fontFamily.regular, fontSize: 11 },
    historyBtn: {
      minHeight: touchTarget.iconButton,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      // A button that sat on the page colour read as a slot cut into the card rather than a
      // control resting on it.
      backgroundColor: p.surfaceSoft,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    historyText: { color: p.text, fontFamily: fontFamily.semibold, fontSize: 11 },
  });
}
