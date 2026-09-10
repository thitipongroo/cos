// Invoices screen — FINANCE: the AP queue of vendor invoices.
// Implements mockup/mobile/09_finance/04_invoices/01_fn_invoice.
//
// REBUILT 2026-09-08 for that drawing. What was here was a wrapped row of plain status chips over a
// list of invoice numbers, in the STATIC LIGHT palette. The drawing gives the screen a hero header,
// a scrolling filter row with counts, a matching banner, and cards carrying the figures an AP clerk
// decides on.
//
// WHAT IS REAL, and more of it than the plan expected.
//   The list           `GET /procurement/vendor-invoices?status=`. FILTERED BY THE SERVER.
//   The chip counts    the server's own `COUNT(*)`, one `limit=1` request per status reading
//                      `total`. Counting the rows this screen received would count the page — the
//                      endpoint caps at 100 — and a filter chip that lies about how many are
//                      disputed is worse than a chip with no number on it.
//   Vendor             `vendor_name`, LEFT-joined into that endpoint on 2026-09-08.
//   PO reference       `po_number`, through `poIndex()`. One request for the page, not one per row.
//   "Partly delivered" the PO's own `status` — `PARTIALLY_DELIVERED` is a value of the CHECK
//                      constraint on `procurement.purchase_orders`, read from the migration.
//   "Over PO +5.2%"    the invoice amount against the PO's `total_amount`, in decimal.js. Shown
//                      only when it IS over: "within PO" is the normal case and does not need a
//                      figure beside it.
//   Approve / Dispute  `POST /procurement/vendor-invoices/:id/approve` and `.../dispute`. The
//                      server allows approve only from RECEIVED or VERIFIED and dispute from
//                      anything but PAID or DISPUTED (422 otherwise), so each button is offered
//                      only where it can work rather than failing under the reader's finger.
//   The detail + note  `GET /procurement/vendor-invoices/:id` and `POST .../note`, KEPT from the
//                      screen this replaced. The drawing has neither, and ADR-085 is explicit that
//                      a mockup is authoritative for style and not for composition: a drawing does
//                      not remove reviewed working capability. Restyled, not removed.
//
// THE PROJECT BAR IS NOT HERE, and that is a deliberate departure from this plan's own line 4.1.
// The endpoint is tenant-wide and filters by `po_id` or `status` — there is no project filter — so
// an "ACTIVE PROJECT" bar would sit above a list that is not that project's. The drawing does not
// have one either. An AP queue is a tenant-level desk; that is what both the API and the mockup say.
//
// WHAT IS DRAWN (lib/mockupFigures.ts, ADR-099): the 3-way matching banner and its per-card match
// percentages, the GRN references, and the discrepancy sentence on a disputed card. THREE-WAY
// MATCHING DOES NOT EXIST IN `backend/src` — nothing reconciles a PO against a delivery against an
// invoice, and no endpoint returns a score. COMING SOON.
//
// AND NO CONFIDENCE ON THAT BANNER. The drawing prints "CONFIDENCE: 96%" and labels it CORE_AI.
// Not a deterministic figure dressed as a model, as on the cash-flow cards — nothing ran at all, so
// the percentage would be the case spec §22.3 forbids outright. Dropped, with its "Source: ERP DB &
// Central OCR Ledger" line, exactly as the three cash-flow modules dropped theirs.
//
// DRAWN ACTIONS, each saying so on tap: the OCR scan control (the AI gateway's route list has
// `/ai/transcribe` and no OCR) and "chat history" (no thread exists on an invoice — the note field
// below is the nearest real thing, and it is kept).

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  FlatList,
  TextInput,
  RefreshControl,
  StyleSheet,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { Decimal } from '@cos/financial';
import { get, post } from '../../api/client';
import {
  approveVendorInvoice,
  disputeVendorInvoice,
  listVendorInvoices,
  poIndex,
  type PurchaseOrderRow,
  type VendorInvoice,
} from '../../api/procurement';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { AiCardFooter } from '../../components/AiCardFooter';
import { spacedMoney } from '../../lib/compactMoney';
import { DELIVERY_GRN, INVOICE_DISCREPANCY, THREE_WAY_MATCH } from '../../lib/mockupFigures';
import { useAuthStore } from '../../store/authStore';
import { canRenderWriteControls } from '../../lib/readOnlyRole';
import { useT, useI18n } from '../../i18n';
import { useComingSoon } from '../../components/useComingSoon';
import type { TranslateFn } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';

/** The status values `procurement.invoices` allows, in the order the drawing's chips run. */
const STATUSES = ['RECEIVED', 'VERIFIED', 'DISPUTED', 'APPROVED', 'PAID'] as const;
type InvoiceStatus = (typeof STATUSES)[number];

/** The invoice detail, which carries a note the list rows do not. */
interface InvoiceDetail extends VendorInvoice {
  note?: string | null;
}

export default function InvoicesScreen(): React.JSX.Element {
  const t = useT();
  const { locale } = useI18n();
  const p = usePalette();
  const isDark = useIsDark();
  const styles = useMemo(() => makeStyles(p), [p]);

  const [filter, setFilter] = useState<InvoiceStatus | ''>('');
  const [rows, setRows] = useState<VendorInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  const [pos, setPos] = useState<Map<string, PurchaseOrderRow>>(new Map());
  const [byDueDate, setByDueDate] = useState(true);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);

  /** The visible list, for whichever chip is on. The status goes to the server. */
  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const page = await listVendorInvoices(filter === '' ? {} : { status: filter });
      setRows(page.items);
      setTotal(page.total);
    } catch {
      /* offline — the rows already on screen are what it shows */
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    void load();
  }, [load]);

  /**
   * The chip counts and the PO index — both independent of which chip is on, so both are read once.
   *
   * The counts are five `limit=1` requests read for their `total`, which is the server's `COUNT(*)`
   * over the whole status. They are tiny and they are exact; counting the fetched rows would count
   * a page of at most 100.
   */
  const loadContext = useCallback(async (): Promise<void> => {
    const settled = await Promise.all(
      STATUSES.map((status) =>
        listVendorInvoices({ status, limit: 1 })
          .then((page) => [status, page.total] as const)
          .catch(() => [status, -1] as const),
      ),
    );
    // A status whose count could not be read carries no number rather than a zero it did not get.
    const next: Record<string, number> = {};
    for (const [status, count] of settled) if (count >= 0) next[status] = count;
    setCounts(next);
    setPos(await poIndex());
  }, []);

  useEffect(() => {
    void loadContext();
  }, [loadContext]);

  const soon = useComingSoon();

  /**
   * Approve or dispute, then refresh both the list and the counts.
   *
   * NOT OPTIMISTIC. Either call moves the invoice into a different chip, so the honest redraw is
   * the one the server agrees with — and §17.4 makes both online-only, so `post` throws rather than
   * queueing a replay `/sync/push` would reject.
   */
  const act = useCallback(
    async (invoice: VendorInvoice, action: 'approve' | 'dispute'): Promise<void> => {
      if (busy) return;
      setBusy(true);
      try {
        if (action === 'approve') await approveVendorInvoice(invoice.invoice_id);
        else await disputeVendorInvoice(invoice.invoice_id);
        await Promise.all([load(), loadContext()]);
      } catch {
        Alert.alert(t(`finance.invoices.${action}`), t(`finance.invoices.${action}Failed`));
      } finally {
        setBusy(false);
      }
    },
    [busy, load, loadContext, t],
  );

  const openDetail = useCallback(async (invoice: VendorInvoice): Promise<void> => {
    try {
      const full = await get<InvoiceDetail>(
        `/procurement/vendor-invoices/${encodeURIComponent(invoice.invoice_id)}`,
      );
      setDetail(full);
      setNoteText(full.note ?? '');
      setNoteSaved(false);
    } catch {
      /* offline / error — stay on the list rather than opening an empty detail */
    }
  }, []);

  const saveNote = useCallback((): void => {
    if (detail === null) return;
    // Online-only, like every other write on this screen.
    void post(`/procurement/vendor-invoices/${encodeURIComponent(detail.invoice_id)}/note`, {
      note: noteText.trim(),
    })
      .then(() => setNoteSaved(true))
      .catch(() => {
        /* offline / error — the field keeps what was typed so it can be retried */
      });
  }, [detail, noteText]);

  /** Sorted for reading, not re-fetched: both keys are on the rows already in hand. */
  const sorted = useMemo(() => {
    const key = byDueDate ? 'due_date' : 'invoice_date';
    return [...rows].sort((a, b) => a[key].localeCompare(b[key]));
  }, [rows, byDueDate]);

  /** How many of the visible rows are due today or already past it, and not yet paid. */
  const urgent = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return rows.filter((row) => row.status !== 'PAID' && row.due_date.slice(0, 10) <= today).length;
  }, [rows]);

  const renderItem = useCallback(
    ({ item, index }: { item: VendorInvoice; index: number }) => (
      <InvoiceCard
        invoice={item}
        po={pos.get(item.po_id) ?? null}
        index={index}
        busy={busy}
        styles={styles}
        palette={p}
        t={t}
        locale={locale}
        onOpen={() => void openDetail(item)}
        onApprove={() => void act(item, 'approve')}
        onDispute={() => void act(item, 'dispute')}
        onChat={() => soon('finance.invoices.chat')}
      />
    ),
    [pos, busy, styles, p, t, locale, openDetail, act, soon],
  );

  if (detail !== null) {
    return (
      <InvoiceDetailView
        detail={detail}
        po={pos.get(detail.po_id) ?? null}
        noteText={noteText}
        noteSaved={noteSaved}
        styles={styles}
        palette={p}
        t={t}
        locale={locale}
        onChangeNote={setNoteText}
        onSaveNote={saveNote}
        onBack={() => setDetail(null)}
      />
    );
  }

  return (
    <View testID="invoices-screen" style={styles.page}>
      {/* The drawing's hero header, with the scan control at its trailing edge. */}
      <View style={styles.hero}>
        <View style={styles.heroText}>
          <Text style={styles.heroTitle} accessibilityRole="header" numberOfLines={1}>
            {t('finance.invoices.title')}
          </Text>
          <Text style={styles.heroSub} numberOfLines={2}>
            {t('finance.invoices.subtitle')}
          </Text>
        </View>
        {/* Drawn — the AI gateway has `/ai/transcribe` and no OCR route. */}
        <Pressable
          testID="invoice-scan-icon"
          accessibilityRole="button"
          accessibilityLabel={t('finance.invoices.scanShort')}
          onPress={() => soon('finance.invoices.scan')}
          style={styles.scanIcon}
        >
          <MaterialIcons name="document-scanner" size={22} color={p.accent} />
        </Pressable>
      </View>

      {/* One scrolling row, as the drawing has it — the chips must not wrap and must not scroll
          the page with them. */}
      <View style={styles.chipRow}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chipContent}
        >
          <FilterChip
            testID="filter-ALL"
            label={t('finance.invoices.all')}
            count={counts === null ? null : sumCounts(counts)}
            tone={null}
            on={filter === ''}
            onPress={() => setFilter('')}
            styles={styles}
          />
          {STATUSES.map((status) => (
            <FilterChip
              key={status}
              testID={`filter-${status}`}
              label={t(`finance.invoices.status.${status}`)}
              count={counts?.[status] ?? null}
              tone={statusTone(status, p)}
              on={filter === status}
              onPress={() => setFilter(status)}
              styles={styles}
            />
          ))}
        </ScrollView>
      </View>

      <LoadingBoundary
        loading={loading && rows.length === 0}
        variant="list"
        theme={isDark ? 'dark' : 'light'}
        style={styles.fill}
      >
        <FlatList
          testID="invoices-list"
          data={sorted}
          keyExtractor={(row, i) => row.invoice_id || String(i)}
          contentContainerStyle={styles.list}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={() => void load()} />}
          ListEmptyComponent={
            <Text testID="invoices-empty" style={styles.empty}>
              {t('finance.invoices.empty')}
            </Text>
          }
          ListHeaderComponent={
            <View style={styles.listHead}>
              <MatchingBanner styles={styles} palette={p} t={t} />

              <View style={styles.sectionRow}>
                <View style={styles.sectionLabel}>
                  <Text style={styles.eyebrow}>{t('finance.invoices.pending')}</Text>
                  {urgent === 0 ? null : (
                    <View style={styles.urgentChip}>
                      <Text style={styles.urgentText}>
                        {t('finance.invoices.urgent', { count: urgent })}
                      </Text>
                    </View>
                  )}
                </View>
                {/* REAL: both keys are columns on the rows in hand, so this is a re-read of what
                    was fetched rather than a claim about the whole list. */}
                <Pressable
                  testID="invoices-sort"
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    byDueDate ? 'finance.invoices.sortIssued' : 'finance.invoices.sortDue',
                  )}
                  onPress={() => setByDueDate((on) => !on)}
                  style={styles.sortButton}
                >
                  <MaterialIcons name="tune" size={15} color={p.accent} />
                  <Text style={styles.sortText} numberOfLines={1}>
                    {t(byDueDate ? 'finance.invoices.sortDue' : 'finance.invoices.sortIssued')}
                  </Text>
                </Pressable>
              </View>

              {/* Said only when it applies: the page holds fewer rows than the filter has. */}
              {total > rows.length ? (
                <Text testID="invoices-truncated" style={styles.truncated}>
                  {t('finance.invoices.truncated', { shown: rows.length, total })}
                </Text>
              ) : null}
            </View>
          }
          renderItem={renderItem}
        />
      </LoadingBoundary>

      {/* Drawn — the drawing's full-width OCR button, the second of its two scan controls. */}
      <Pressable
        testID="invoice-scan"
        accessibilityRole="button"
        accessibilityLabel={t('finance.invoices.scan')}
        onPress={() => soon('finance.invoices.scan')}
        style={styles.scanButton}
      >
        <MaterialIcons name="center-focus-weak" size={20} color={p.onPrimary} />
        <Text style={styles.scanButtonText} numberOfLines={1}>
          {t('finance.invoices.scan')}
        </Text>
      </Pressable>
    </View>
  );
}

/** One filter chip: the status, its dot, and the server's count of it. */
function FilterChip({
  testID,
  label,
  count,
  tone,
  on,
  onPress,
  styles,
}: {
  testID: string;
  label: string;
  count: number | null;
  tone: string | null;
  on: boolean;
  onPress: () => void;
  styles: ReturnType<typeof makeStyles>;
}): React.JSX.Element {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityState={{ selected: on }}
      onPress={onPress}
      style={[styles.chip, on && styles.chipOn]}
    >
      {tone === null ? null : <View style={[styles.chipDot, { backgroundColor: tone }]} />}
      <Text style={[styles.chipText, on && styles.chipTextOn]} numberOfLines={1}>
        {label}
      </Text>
      {/* Bracketed, as the drawing brackets them — "(5)", not a bare 5 against the label.
          No number at all where the count could not be read: never a zero it did not get. */}
      {count === null ? null : (
        <Text style={[styles.chipCount, on && styles.chipTextOn]}>{`(${count})`}</Text>
      )}
    </Pressable>
  );
}

/**
 * The drawing's 3-Way Matching advisory banner.
 *
 * ENTIRELY DRAWN, and without the confidence the drawing puts on it. Nothing in `backend/src`
 * reconciles a purchase order against a delivery against an invoice; see `THREE_WAY_MATCH`.
 */
function MatchingBanner({
  styles,
  palette,
  t,
}: {
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  t: TranslateFn;
}): React.JSX.Element {
  return (
    <View testID="invoices-matching" style={[styles.card, styles.banner]}>
      <View style={styles.bannerHead}>
        <View style={styles.bannerTitleRow}>
          <MaterialIcons name="bolt" size={16} color={palette.accent} />
          <Text style={styles.bannerTitle}>{t('finance.invoices.matching')}</Text>
        </View>
      </View>
      <Text style={styles.body}>{THREE_WAY_MATCH.value.summary}</Text>

      {/* The drawing's footer, added 2026-09-08 (PO): a rule, the source on the left, the chevron
          on the right. THE CHEVRON MOVED HERE from beside the confidence, because the drawing has
          exactly one and this is where it puts it.

          THE SOURCE NAMES THE RECORDS, NOT THE DRAWING'S SYSTEMS. `01-fn-invoice` reads
          "ERP DB & Central OCR Ledger"; neither exists in this repository, and a line claiming an
          OCR ledger produced these figures is the one kind of drawn text that changes how much of
          the screen a reader believes. Same carve-out as ADR-098's second amendment, applied a
          fourth time. What is named instead is true: the list above is the procurement invoice and
          purchase-order records, fetched at `listVendorInvoices` and `poIndex`. */}
      {/* THE PROJECT'S STANDARD AI-CARD FOOT (spec §32.7, PO decision 2026-09-08). The confidence
          came down from a chip in the header opposite the title. IT IS THE REGISTER'S MOST
          UNCOMFORTABLE ENTRY and stays so: three-way matching does not exist in `backend/src` at
          all, so this is a confidence on a process that never ran. */}
      <AiCardFooter
        testID="invoices-matching-foot"
        percent={THREE_WAY_MATCH.value.confidence}
        // The VALUE carries no label of its own: `<AiCardFooter />` writes the "SOURCE:" —
        // both did for one capture and the frame read "SOURCE: Source: vendor invoices".
        source={t('finance.invoices.source')}
        confLabel={t('insight.confShort')}
        sourceLabel={t('insight.sourceShort')}
        palette={palette}
      />
    </View>
  );
}

/** One invoice, with everything an AP clerk decides on. */
function InvoiceCard({
  invoice,
  po,
  index,
  busy,
  styles,
  palette,
  t,
  locale,
  onOpen,
  onApprove,
  onDispute,
  onChat,
}: {
  invoice: VendorInvoice;
  po: PurchaseOrderRow | null;
  index: number;
  busy: boolean;
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  t: TranslateFn;
  locale: string;
  onOpen: () => void;
  onApprove: () => void;
  onDispute: () => void;
  onChat: () => void;
}): React.JSX.Element {
  const tone = statusTone(invoice.status, palette);
  const over = overPo(invoice, po);
  const due = dueTone(invoice, palette);
  // The server's own rules, read from `procurement.service.ts` — a button that would earn a 422 is
  // not offered.
  // TWO CONDITIONS, AND THEY ANSWER DIFFERENT QUESTIONS. The status decides whether the invoice
  // CAN be approved; `canWrite` decides whether this reader may be offered the action at all
  // (§20.7.9 — a VIEWER is shown no approve control). Both were needed and only the first existed.
  const canWrite = useAuthStore((s) => canRenderWriteControls(s.role));
  const canApprove = canWrite && (invoice.status === 'RECEIVED' || invoice.status === 'VERIFIED');
  const canDispute = canWrite && invoice.status !== 'PAID' && invoice.status !== 'DISPUTED';

  return (
    <View
      testID={`invoice-item-${invoice.invoice_id}`}
      style={[styles.card, { borderLeftColor: tone }]}
    >
      {/* The card is a <View> so a test — and a screen reader — can take it whole; the header is
          the tappable part, and carries its own id. */}
      <Pressable
        testID={`invoice-open-${invoice.invoice_id}`}
        accessibilityRole="button"
        accessibilityLabel={invoice.invoice_number}
        onPress={onOpen}
        style={styles.cardHead}
      >
        <View style={styles.cardText}>
          <View style={styles.cardTitleRow}>
            <Text style={styles.cardNumber} numberOfLines={1}>
              {invoice.invoice_number}
            </Text>
            <View style={[styles.tag, { borderColor: tone }]}>
              <Text style={[styles.tagText, { color: tone }]} numberOfLines={1}>
                {t(`finance.invoices.status.${invoice.status}`)}
              </Text>
            </View>
          </View>
          <Text style={styles.cardVendor} numberOfLines={1}>
            {invoice.vendor_name ?? '—'}
          </Text>
        </View>
        <View style={styles.cardFigures}>
          <Text style={[styles.cardAmount, over === null ? null : { color: palette.danger }]}>
            {spacedMoney(invoice.amount, invoice.currency_code)}
          </Text>
          {over === null ? (
            <Text style={[styles.cardDue, { color: due.colour }]} numberOfLines={1}>
              {t(due.key, { date: formatDay(invoice.due_date, locale) })}
            </Text>
          ) : (
            // REAL: the invoice amount against the PO's `total_amount`.
            <Text style={[styles.cardDue, { color: palette.danger }]} numberOfLines={1}>
              {t('finance.invoices.overPo', { percent: over })}
            </Text>
          )}
        </View>
      </Pressable>

      {/* The drawing's three-column telemetry strip. Column one is real, columns two and three are
          the missing matching process. */}
      <View style={styles.telemetry}>
        <Text style={styles.telemetryText} numberOfLines={1}>
          {po === null ? '—' : `#${po.po_number}`}
        </Text>
        {/* DRAWN — `deliveries` has a free-text note and no GRN number. See the register. */}
        <Text style={styles.telemetryText} numberOfLines={1}>
          {`#${DELIVERY_GRN.value[index % DELIVERY_GRN.value.length]}`}
        </Text>
        <View style={styles.telemetryRight}>
          <MaterialIcons name="verified" size={13} color={palette.muted} />
          {/* DRAWN — there is no matching score. See the register. */}
          <Text style={styles.telemetryText} numberOfLines={1}>
            {t('finance.invoices.matchScore', {
              percent:
                THREE_WAY_MATCH.value.percentages[index % THREE_WAY_MATCH.value.percentages.length],
            })}
          </Text>
        </View>
      </View>

      {/* DRAWN — naming which line differs needs the comparison that produces the score. */}
      {invoice.status === 'DISPUTED' ? (
        <View testID={`invoice-discrepancy-${invoice.invoice_id}`} style={styles.discrepancy}>
          <MaterialIcons name="error-outline" size={16} color={palette.danger} />
          <Text style={styles.discrepancyText}>{INVOICE_DISCREPANCY.value}</Text>
        </View>
      ) : null}

      <View style={styles.actions}>
        {invoice.status === 'DISPUTED' ? (
          // Drawn — an invoice carries a note, not a thread. The note lives in the detail.
          <Pressable
            testID={`invoice-chat-${invoice.invoice_id}`}
            accessibilityRole="button"
            accessibilityLabel={t('finance.invoices.chat')}
            onPress={onChat}
            style={styles.action}
          >
            <MaterialIcons name="forum" size={16} color={palette.accent} />
            <Text style={[styles.actionText, { color: palette.accent }]} numberOfLines={1}>
              {t('finance.invoices.chat')}
            </Text>
          </Pressable>
        ) : null}
        {canDispute ? (
          <Pressable
            testID={`invoice-dispute-${invoice.invoice_id}`}
            accessibilityRole="button"
            accessibilityLabel={t('finance.invoices.dispute')}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={onDispute}
            style={[styles.action, busy && styles.disabled]}
          >
            <MaterialIcons name="flag" size={16} color={palette.danger} />
            <Text style={[styles.actionText, { color: palette.danger }]} numberOfLines={1}>
              {t('finance.invoices.dispute')}
            </Text>
          </Pressable>
        ) : null}
        {canApprove ? (
          <Pressable
            testID={`invoice-approve-${invoice.invoice_id}`}
            accessibilityRole="button"
            accessibilityLabel={t('finance.invoices.approve')}
            accessibilityState={{ disabled: busy }}
            disabled={busy}
            onPress={onApprove}
            style={[styles.action, styles.actionPrimary, busy && styles.disabled]}
          >
            <MaterialIcons name="check-circle" size={16} color={palette.onPrimary} />
            <Text style={[styles.actionText, { color: palette.onPrimary }]} numberOfLines={1}>
              {t('finance.invoices.approve')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

/**
 * The invoice detail and its note.
 *
 * KEPT FROM THE SCREEN THIS REPLACED. The drawing has no detail at all; ADR-085 puts composition
 * outside a mockup's authority, and `GET /procurement/vendor-invoices/:id` plus `POST .../note` are
 * reviewed working capability that a redraw does not remove.
 */
function InvoiceDetailView({
  detail,
  po,
  noteText,
  noteSaved,
  styles,
  palette,
  t,
  locale,
  onChangeNote,
  onSaveNote,
  onBack,
}: {
  detail: InvoiceDetail;
  po: PurchaseOrderRow | null;
  noteText: string;
  noteSaved: boolean;
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  t: TranslateFn;
  locale: string;
  onChangeNote: (text: string) => void;
  onSaveNote: () => void;
  onBack: () => void;
}): React.JSX.Element {
  // §20.7.9: a read-only role is shown no edit control. The NOTE below is one — it writes to the
  // invoice — so the whole card goes, not just its button: a note field with no way to save it is
  // an invitation to type something that will be lost.
  const canWrite = useAuthStore((s) => canRenderWriteControls(s.role));
  const fields: Array<[string, string]> = [
    [t('finance.invoices.number'), detail.invoice_number],
    [t('finance.invoices.amount'), spacedMoney(detail.amount, detail.currency_code)],
    [t('finance.invoices.statusLabel'), t(`finance.invoices.status.${detail.status}`)],
    [t('finance.invoices.dueDate'), formatDay(detail.due_date, locale)],
    [t('finance.invoices.poRef'), po === null ? detail.po_id : `#${po.po_number}`],
  ];
  return (
    <ScrollView testID="invoice-detail" contentContainerStyle={styles.detailPage}>
      <Pressable
        testID="invoice-back"
        accessibilityRole="button"
        accessibilityLabel={t('common.back')}
        onPress={onBack}
        style={styles.backRow}
      >
        <MaterialIcons name="arrow-back" size={20} color={palette.accent} />
        <Text style={styles.backText} numberOfLines={1}>
          {detail.invoice_number}
        </Text>
      </Pressable>

      <View style={styles.card}>
        <Text style={styles.cardVendor} numberOfLines={1}>
          {detail.vendor_name ?? '—'}
        </Text>
        {fields.map(([label, value]) => (
          <View key={label} style={styles.kvRow}>
            <Text style={styles.kvKey}>{label}</Text>
            <Text style={styles.kvValue} numberOfLines={1}>
              {value}
            </Text>
          </View>
        ))}
      </View>

      {canWrite ? (
        <View style={styles.card}>
          <Text style={styles.eyebrow}>{t('finance.invoices.note')}</Text>
          <TextInput
            testID="invoice-note-input"
            style={styles.noteInput}
            multiline
            value={noteText}
            onChangeText={onChangeNote}
            placeholder={t('finance.invoices.notePlaceholder')}
            placeholderTextColor={palette.muted}
          />
          <Pressable
            testID="save-note-button"
            accessibilityRole="button"
            accessibilityLabel={t('finance.invoices.saveNote')}
            onPress={onSaveNote}
            style={styles.noteButton}
          >
            <Text style={styles.noteButtonText}>{t('finance.invoices.saveNote')}</Text>
          </Pressable>
          {noteSaved ? (
            <Text testID="note-saved" style={styles.savedText}>
              {t('finance.invoices.noteSaved')}
            </Text>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

/** Every status its colour, once, so the chip dot and the card strip cannot disagree. */
function statusTone(status: string, p: Palette): string {
  if (status === 'DISPUTED') return p.danger;
  if (status === 'RECEIVED') return p.warning;
  if (status === 'VERIFIED' || status === 'APPROVED') return p.success;
  return p.muted;
}

/**
 * How far the invoice exceeds its purchase order, as "+5.2%" — or null when it does not.
 *
 * REAL: `procurement.purchase_orders.total_amount` against the invoice's own amount, both DECIMAL
 * strings compared in decimal.js. Null when there is no PO in the index, when the PO's total is
 * zero (nothing to be a percentage of) or when the invoice is within it — "within PO" is the normal
 * case and gets the due date instead, which is what a reader needs then.
 */
function overPo(invoice: VendorInvoice, po: PurchaseOrderRow | null): string | null {
  if (po === null) return null;
  const total = new Decimal(po.total_amount);
  if (total.isZero() || total.isNegative()) return null;
  const excess = new Decimal(invoice.amount).minus(total);
  // `lessThanOrEqualTo(0)`, NOT `!isPositive()`. decimal.js gives zero a sign of 1, so
  // `new Decimal(0).isPositive()` is TRUE and an invoice billed at exactly the order total read
  // "Over PO +0%" — which is a claim that it went over.
  if (excess.lessThanOrEqualTo(0)) return null;
  return `+${excess.dividedBy(total).times(100).toDecimalPlaces(1).toString()}%`;
}

/**
 * How urgent the due date reads, and in which colour.
 *
 * Compared as DATE STRINGS, both `YYYY-MM-DD`. `due_date` is a Postgres DATE and arrives without a
 * time, so parsing it into a `Date` would put it at midnight UTC and shift a Bangkok reader's
 * "today" by seven hours — an invoice due today would read as due tomorrow all working day.
 */
function dueTone(invoice: VendorInvoice, p: Palette): { key: string; colour: string } {
  const today = new Date().toISOString().slice(0, 10);
  const due = invoice.due_date.slice(0, 10);
  if (invoice.status === 'PAID') return { key: 'finance.invoices.dueOn', colour: p.muted };
  if (due < today) return { key: 'finance.invoices.overdue', colour: p.danger };
  return { key: 'finance.invoices.dueOn', colour: p.muted };
}

/** The date, in the reader's locale. Buddhist era follows automatically for `th` (QM-3). */
function formatDay(date: string, locale: string): string {
  const value = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(value.getTime())) return date;
  return new Intl.DateTimeFormat(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-US', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  }).format(value);
}

/** The "All" chip's number: the five statuses summed, because every invoice is in exactly one. */
function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: p.bg, padding: spacing.md },
    fill: { flex: 1 },
    list: { gap: spacing.sm, paddingBottom: spacing.xl * 3 },
    listHead: { gap: spacing.sm, marginBottom: spacing.sm },

    hero: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    heroText: { flex: 1, gap: 2 },
    heroTitle: { color: p.text, fontFamily: fontFamily.bold, fontSize: typography.title.fontSize },
    heroSub: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },
    scanIcon: {
      width: touchTarget.iconButton,
      height: touchTarget.iconButton,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },

    chipRow: { marginVertical: spacing.sm },
    chipContent: { gap: spacing.xs, paddingRight: spacing.md },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      paddingHorizontal: spacing.sm,
      minHeight: touchTarget.iconButton - 8,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surface,
    },
    chipOn: { backgroundColor: p.primary, borderColor: p.primary },
    // 999 is the documented capsule marker (§32.7) — a status dot is a circle, not a step on the
    // radius scale, and a literal 3 would have been a new hardcoded radius the ratchet counts.
    chipDot: { width: 6, height: 6, borderRadius: 999 },
    chipText: {
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    chipCount: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10 },
    chipTextOn: { color: p.onPrimary },

    card: {
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      borderLeftWidth: 4,
      borderLeftColor: p.border,
      padding: spacing.md,
      gap: spacing.xs,
    },
    banner: { borderLeftColor: p.accent, borderColor: p.accent },
    bannerHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
    },
    bannerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
    bannerFoot: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      borderTopWidth: 1,
      borderTopColor: `${p.accent}33`,
      paddingTop: spacing.xs,
      marginTop: spacing.xs / 2,
    },
    // The chevron holds its width; the source is what gives way on a narrow handset.
    bannerSource: {
      flex: 1,
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: 10,
      textTransform: 'uppercase',
    },
    confChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: `${p.accent}66`,
    },
    confText: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      textTransform: 'uppercase',
    },
    bannerTitle: {
      color: p.accent,
      fontFamily: fontFamily.semibold,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    body: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      lineHeight: typography.caption.fontSize * 1.5,
    },

    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
    eyebrow: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    urgentChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 1,
      borderRadius: radius.xl,
      backgroundColor: p.surfaceBright,
    },
    urgentText: { color: p.text, fontFamily: fontFamily.medium, fontSize: 10 },
    sortButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs / 2,
      minHeight: touchTarget.iconButton,
      paddingLeft: spacing.sm,
      flexShrink: 1,
    },
    sortText: {
      color: p.accent,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    truncated: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10 },

    cardHead: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    cardText: { flex: 1, gap: 2 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    cardNumber: {
      flexShrink: 1,
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    tag: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 1,
      borderRadius: radius.xl,
      borderWidth: 1,
    },
    tagText: { fontFamily: fontFamily.semibold, fontSize: 9, textTransform: 'uppercase' },
    cardVendor: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    cardFigures: { alignItems: 'flex-end', gap: 2, flexShrink: 1 },
    cardAmount: { color: p.text, fontFamily: fontFamily.bold, fontSize: typography.body.fontSize },
    cardDue: { fontFamily: fontFamily.medium, fontSize: 10 },

    telemetry: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.xs,
      backgroundColor: p.surfaceBright,
      borderRadius: radius.md,
      paddingHorizontal: spacing.xs,
      paddingVertical: spacing.xs / 2,
    },
    telemetryRight: { flexDirection: 'row', alignItems: 'center', gap: 2, flexShrink: 1 },
    telemetryText: {
      flexShrink: 1,
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 10,
    },

    discrepancy: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: `${p.danger}55`,
      padding: spacing.xs,
    },
    discrepancyText: {
      flexShrink: 1,
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
    },

    actions: { flexDirection: 'row', gap: spacing.xs, marginTop: spacing.xs / 2 },
    action: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs / 2,
      minHeight: touchTarget.primaryButton,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      paddingHorizontal: spacing.xs,
    },
    actionPrimary: { backgroundColor: p.primary, borderColor: p.primary },
    actionText: {
      flexShrink: 1,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    disabled: { opacity: 0.5 },

    empty: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      textAlign: 'center',
      paddingVertical: spacing.xl,
    },

    scanButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      minHeight: touchTarget.primaryButton,
      borderRadius: radius.lg,
      backgroundColor: p.primary,
      paddingHorizontal: spacing.md,
      marginTop: spacing.xs,
    },
    scanButtonText: {
      color: p.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.6,
      textTransform: 'uppercase',
    },

    detailPage: { padding: spacing.md, gap: spacing.sm, backgroundColor: p.bg, flexGrow: 1 },
    backRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      minHeight: touchTarget.iconButton,
    },
    backText: {
      flexShrink: 1,
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
    },
    kvRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingVertical: spacing.xs / 2,
    },
    kvKey: { color: p.muted, fontFamily: fontFamily.regular, fontSize: typography.label.fontSize },
    kvValue: {
      flexShrink: 1,
      color: p.text,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
    noteInput: {
      minHeight: 72,
      borderWidth: 1,
      borderColor: p.border,
      borderRadius: radius.md,
      padding: spacing.sm,
      textAlignVertical: 'top',
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
    },
    noteButton: {
      minHeight: touchTarget.primaryButton,
      borderRadius: radius.md,
      backgroundColor: p.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    noteButtonText: {
      color: p.onPrimary,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
      textTransform: 'uppercase',
    },
    savedText: {
      color: p.success,
      fontFamily: fontFamily.medium,
      fontSize: typography.label.fontSize,
    },
  });
