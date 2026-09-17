// Invoices screen — FINANCE: the AP queue of vendor invoices.
// Implements the Stitch screen "รายการใบแจ้งหนี้ - ฝ่ายการเงิน (Finance Invoices Mobile)"; before
// 2026-09-17 it implemented mockup/mobile/09_finance/04_invoices/01_fn_invoice.
//
// REDRAWN 2026-09-17 (R21) to the Stitch screen. What changed against the 2026-09-08 build:
//   · the hero header ("Vendor invoices" + a scan icon) is gone — the drawing opens with the
//     project strip, and its only scan control is the full-width button at the END of the list
//   · <ProjectContextBar /> leads the screen (D28, D30), and the list is that project's (below)
//   · five chips as drawn (D36): All with a count bubble; รอตรวจ, ตรวจแล้ว, มีข้อพิพาท with a dot
//     and a bracketed count; จ่ายแล้ว with neither. APPROVED has no chip — its count still goes
//     into All, because every invoice is in exactly one status
//   · the banner, the cards and the action bar take the drawing's shapes, and everything the
//     drawing draws is drawn (D31, reversing the 2026-09-08 exclusions): the "ส่งมอบบางส่วน" state,
//     the "PO"/"GRN" words in the banner sentence, and the banner's drawn source line (D33)
//   · the disputed card carries the drawing's two buttons — chat history and "เปิดข้อพิพาท" — and no
//     telemetry strip, as drawn
//
// THE PROJECT FILTER IS THE APP'S, NOT THE SERVER'S (D30, D37). `GET /procurement/vendor-invoices`
// filters by `po_id` or `status` and has no project filter, so the screen fetches the ACTIVE
// PROJECT's purchase orders (`GET /procurement/purchase-orders?project_id=`, every page, through
// `projectPoIndex`) and keeps the invoices whose `po_id` is one of them. The chip counts stay the
// TENANT's (D30) — a per-project count would need that missing server filter. With no project
// chosen the bar renders nothing and the list is the tenant's, as before.
// The 2026-09-08 header said "the drawing does not have a project bar"; the Stitch drawing does.
//
// WHAT IS REAL.
//   The list           `GET /procurement/vendor-invoices?status=`. FILTERED BY THE SERVER, then
//                      narrowed to the project on the app.
//   The chip counts    the server's own `COUNT(*)`, one `limit=1` request per status reading
//                      `total`. Counting the rows this screen received would count the page — the
//                      endpoint caps at 100.
//   Vendor             `vendor_name`, LEFT-joined into that endpoint on 2026-09-08.
//   PO reference       `po_number`, through the PO index. One walk for the project, not one per row.
//   "ส่งมอบบางส่วน"      the PO's own `status` = `PARTIALLY_DELIVERED`, a value of the CHECK constraint
//                      on `procurement.purchase_orders`.
//   "Over PO +5.2%"    the invoice amount against the PO's `total_amount`, in decimal.js. Shown
//                      only when it IS over.
//   Approve / Dispute  `POST /procurement/vendor-invoices/:id/approve` and `.../dispute`, offered
//                      only where the server's guards (422 otherwise) would accept them.
//   The detail + note  `GET /procurement/vendor-invoices/:id` and `POST .../note`, KEPT. The drawing
//                      has neither; ADR-085 keeps composition outside a mockup's authority.
//
// WHAT IS DRAWN (lib/mockupFigures.ts, ADR-099) — COMING SOON. Three-way matching does not exist in
// `backend/src`: the banner's figures and its confidence (`THREE_WAY_MATCH`), the per-card match
// percentages, the GRN references (`DELIVERY_GRN`), the discrepancy figures (`INVOICE_DISCREPANCY`)
// and the source line (`FINANCE_AI_SOURCES`). The drawing puts the confidence in a header chip; it
// sits in the standard <AiCardFooter /> instead (D33).
//
// DRAWN ACTIONS, each opening the coming-soon dialog: the OCR scan button (the AI gateway has
// `/ai/transcribe` and no OCR), "ดูประวัติแชท" (an invoice carries a note, not a thread) and
// "เปิดข้อพิพาท" on a card that is ALREADY disputed (the server refuses a second dispute).

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
  projectPoIndex,
  type PurchaseOrderRow,
  type VendorInvoice,
} from '../../api/procurement';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { AiCardFooter } from '../../components/AiCardFooter';
import { ProjectContextBar } from '../../components/ProjectContextBar';
import { spacedMoney } from '../../lib/compactMoney';
import { toIsoDate } from '../../lib/isoDate';
import {
  DELIVERY_GRN,
  FINANCE_AI_SOURCES,
  INVOICE_DISCREPANCY,
  THREE_WAY_MATCH,
} from '../../lib/mockupFigures';
import { useAuthStore } from '../../store/authStore';
import { useProjectStore } from '../../store/projectStore';
import { canRenderWriteControls } from '../../lib/readOnlyRole';
import { useT, useI18n } from '../../i18n';
import { useComingSoon } from '../../components/useComingSoon';
import type { TranslateFn } from '../../i18n';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';
import { usePalette, useIsDark, type Palette } from '../../theme/usePalette';

/** The status values `procurement.invoices` allows — every one is counted into All. */
const STATUSES = ['RECEIVED', 'VERIFIED', 'DISPUTED', 'APPROVED', 'PAID'] as const;
type InvoiceStatus = (typeof STATUSES)[number];

/** The drawing's chips after All, in its order (D36). APPROVED has none. */
const CHIP_STATUSES = ['RECEIVED', 'VERIFIED', 'DISPUTED', 'PAID'] as const;

/** The one chip the drawing gives neither a dot nor a count. */
const BARE_CHIP: InvoiceStatus = 'PAID';

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
  const projectId = useProjectStore((s) => s.active?.projectId ?? '');

  const [filter, setFilter] = useState<InvoiceStatus | ''>('');
  const [rows, setRows] = useState<VendorInvoice[]>([]);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState<Record<string, number> | null>(null);
  // Null until the index for the CURRENT project has landed — a list filtered through the previous
  // project's orders would be the wrong project's list.
  const [pos, setPos] = useState<Map<string, PurchaseOrderRow> | null>(null);
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
   * The chip counts — five `limit=1` requests read for their `total`, the server's `COUNT(*)` over
   * the whole status. Tenant-wide (D30): the endpoint has no project filter to count with.
   */
  const loadCounts = useCallback(async (): Promise<void> => {
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
  }, []);

  useEffect(() => {
    void loadCounts();
  }, [loadCounts]);

  /** The PO index: the active project's orders (D37), or the tenant's first page with none. */
  useEffect(() => {
    let live = true;
    setPos(null);
    void (projectId === '' ? poIndex() : projectPoIndex(projectId)).then((next) => {
      if (live) setPos(next);
    });
    return () => {
      live = false;
    };
  }, [projectId]);

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
        await Promise.all([load(), loadCounts()]);
      } catch {
        Alert.alert(t(`finance.invoices.${action}`), t(`finance.invoices.${action}Failed`));
      } finally {
        setBusy(false);
      }
    },
    [busy, load, loadCounts, t],
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

  /**
   * The rows this screen shows: the project's, sorted for reading.
   *
   * With a project chosen and its index not yet in, NOTHING — see `pos`. Both sort keys are on the
   * rows in hand, so sorting is a re-read, not a re-fetch.
   */
  const visible = useMemo(() => {
    const mine =
      projectId === '' ? rows : pos === null ? [] : rows.filter((row) => pos.has(row.po_id));
    const key = byDueDate ? 'due_date' : 'invoice_date';
    return [...mine].sort((a, b) => a[key].localeCompare(b[key]));
  }, [rows, pos, projectId, byDueDate]);

  /** How many of the visible rows are due today or already past it, and not yet paid. */
  const urgent = useMemo(() => {
    const today = toIsoDate(new Date());
    return visible.filter((row) => row.status !== 'PAID' && row.due_date.slice(0, 10) <= today)
      .length;
  }, [visible]);

  const renderItem = useCallback(
    ({ item, index }: { item: VendorInvoice; index: number }) => (
      <InvoiceCard
        invoice={item}
        po={pos?.get(item.po_id) ?? null}
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
        onOpenDispute={() => soon('finance.invoices.openDispute')}
      />
    ),
    [pos, busy, styles, p, t, locale, openDetail, act, soon],
  );

  if (detail !== null) {
    return (
      <InvoiceDetailView
        detail={detail}
        po={pos?.get(detail.po_id) ?? null}
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

  const waiting = loading || (projectId !== '' && pos === null);

  return (
    <View testID="invoices-screen" style={styles.page}>
      <ProjectContextBar />

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
            bubble
            tone={null}
            on={filter === ''}
            onPress={() => setFilter('')}
            styles={styles}
          />
          {CHIP_STATUSES.map((status) => (
            <FilterChip
              key={status}
              testID={`filter-${status}`}
              label={t(`finance.invoices.status.${status}`)}
              count={status === BARE_CHIP ? null : (counts?.[status] ?? null)}
              bubble={false}
              tone={status === BARE_CHIP ? null : statusTone(status, p)}
              on={filter === status}
              onPress={() => setFilter(status)}
              styles={styles}
            />
          ))}
        </ScrollView>
      </View>

      <LoadingBoundary
        loading={waiting && visible.length === 0}
        variant="list"
        theme={isDark ? 'dark' : 'light'}
        style={styles.fill}
      >
        <FlatList
          testID="invoices-list"
          data={visible}
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
              <MatchingBanner
                styles={styles}
                palette={p}
                t={t}
                onOpen={() => soon('finance.invoices.matching')}
              />

              <View style={styles.sectionRow}>
                <View style={styles.sectionLabel}>
                  <Text style={styles.sectionTitle} numberOfLines={1}>
                    {t('finance.invoices.pending')}
                  </Text>
                  {urgent === 0 ? null : (
                    <View style={styles.urgentChip}>
                      <Text style={styles.urgentText} numberOfLines={1}>
                        {t('finance.invoices.urgent', { count: urgent })}
                      </Text>
                    </View>
                  )}
                </View>
                {/* REAL: both keys are columns on the rows in hand. */}
                <Pressable
                  testID="invoices-sort"
                  accessibilityRole="button"
                  accessibilityLabel={t(
                    byDueDate ? 'finance.invoices.sortIssued' : 'finance.invoices.sortDue',
                  )}
                  onPress={() => setByDueDate((on) => !on)}
                  style={styles.sortButton}
                >
                  <MaterialIcons name="tune" size={16} color={p.accent} />
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
          ListFooterComponent={
            // Drawn — the drawing's full-width OCR button, at the end of the list.
            <Pressable
              testID="invoice-scan"
              accessibilityRole="button"
              accessibilityLabel={t('finance.invoices.scan')}
              onPress={() => soon('finance.invoices.scan')}
              style={styles.scanButton}
            >
              <MaterialIcons name="center-focus-weak" size={22} color={p.onPrimary} />
              <Text style={styles.scanButtonText} numberOfLines={1}>
                {t('finance.invoices.scan')}
              </Text>
            </Pressable>
          }
          renderItem={renderItem}
        />
      </LoadingBoundary>
    </View>
  );
}

/** One filter chip: the status, its dot, and the server's count of it. */
function FilterChip({
  testID,
  label,
  count,
  bubble,
  tone,
  on,
  onPress,
  styles,
}: {
  testID: string;
  label: string;
  count: number | null;
  /** All's count sits in a bubble; the others are bracketed, as drawn. */
  bubble: boolean;
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
      {/* No number at all where the count could not be read: never a zero it did not get. */}
      {count === null ? null : bubble ? (
        <View style={styles.countBubble}>
          <Text style={[styles.chipCount, on && styles.chipTextOn]}>{String(count)}</Text>
        </View>
      ) : (
        <Text style={[styles.chipCount, on && styles.chipTextOn]}>{`(${count})`}</Text>
      )}
    </Pressable>
  );
}

/**
 * The drawing's 3-Way Matching advisory banner.
 *
 * ENTIRELY DRAWN. Nothing in `backend/src` reconciles a purchase order against a delivery against
 * an invoice; see `THREE_WAY_MATCH`. The sentence's words are i18n, its figures the register's.
 */
function MatchingBanner({
  styles,
  palette,
  t,
  onOpen,
}: {
  styles: ReturnType<typeof makeStyles>;
  palette: Palette;
  t: TranslateFn;
  /** The footer chevron — the card's one way in (R22, D38). */
  onOpen: () => void;
}): React.JSX.Element {
  const match = THREE_WAY_MATCH.value;
  return (
    <View testID="invoices-matching" style={styles.banner}>
      <View style={styles.bannerTitleRow}>
        <MaterialIcons name="psychology" size={20} color={palette.accent} />
        <Text style={styles.bannerTitle}>{t('finance.invoices.matching')}</Text>
      </View>
      <Text style={styles.bannerBody}>
        {t('finance.invoices.matchLead')} <Text style={styles.bannerPo}>{`#${match.po}`}</Text>{' '}
        {t('finance.invoices.matchMid')} <Text style={styles.bannerGrn}>{`GRN #${match.grn}`}</Text>{' '}
        {t('finance.invoices.matchTail', { percent: match.agreement, count: match.ready })}
      </Text>

      {/* THE PROJECT'S STANDARD AI-CARD FOOT (spec §32.7) with the drawing's source (D33). */}
      <AiCardFooter
        testID="invoices-matching-foot"
        percent={match.confidence}
        source={FINANCE_AI_SOURCES.value.invoices}
        confLabel={t('insight.confShort')}
        sourceLabel={t('insight.sourceShort')}
        onPress={onOpen}
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
  onOpenDispute,
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
  onOpenDispute: () => void;
}): React.JSX.Element {
  const tone = statusTone(invoice.status, palette);
  const over = overPo(invoice, po);
  const due = dueTone(invoice, palette);
  const disputed = invoice.status === 'DISPUTED';
  // TWO CONDITIONS, AND THEY ANSWER DIFFERENT QUESTIONS. The status decides whether the server
  // would accept the action (`procurement.service.ts` answers 422 otherwise); `canWrite` decides
  // whether this reader may be offered it at all (§20.7.9 — a VIEWER is shown no write control).
  const canWrite = useAuthStore((s) => canRenderWriteControls(s.role));
  const canApprove = canWrite && (invoice.status === 'RECEIVED' || invoice.status === 'VERIFIED');
  const canDispute = canWrite && invoice.status !== 'PAID' && !disputed;
  const hasActions = disputed || canDispute || canApprove;
  const pending = invoice.status === 'RECEIVED';
  const partial = po?.status === 'PARTIALLY_DELIVERED';
  const percentages = THREE_WAY_MATCH.value.percentages;

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
            <View style={[styles.tag, { backgroundColor: `${tone}26` }]}>
              <Text style={[styles.tagText, { color: tone }]} numberOfLines={1}>
                {t(`finance.invoices.tag.${invoice.status}`)}
              </Text>
            </View>
          </View>
          <Text style={styles.cardVendor} numberOfLines={1}>
            {invoice.vendor_name ?? '—'}
          </Text>
        </View>
        <View style={styles.cardFigures}>
          <Text
            style={[styles.cardAmount, over === null ? null : { color: palette.danger }]}
            numberOfLines={1}
          >
            {spacedMoney(invoice.amount, invoice.currency_code)}
          </Text>
          {over === null ? (
            <Text style={[styles.cardDue, { color: due.colour }]} numberOfLines={1}>
              {t(due.key, { date: formatDay(invoice.due_date, locale) })}
            </Text>
          ) : (
            // REAL: the invoice amount against the PO's `total_amount`.
            <View style={styles.overRow}>
              <MaterialIcons name="trending-up" size={12} color={palette.danger} />
              <Text style={[styles.cardDue, styles.overText]} numberOfLines={1}>
                {t('finance.invoices.overPo', { percent: over })}
              </Text>
            </View>
          )}
        </View>
      </Pressable>

      {/* The drawing puts no telemetry on a disputed card; the discrepancy box takes its place. */}
      {disputed ? (
        // DRAWN — naming which line differs needs the comparison that produces the score.
        <View testID={`invoice-discrepancy-${invoice.invoice_id}`} style={styles.discrepancy}>
          <MaterialIcons name="error" size={18} color={palette.danger} />
          <Text style={styles.discrepancyText}>
            {t('finance.invoices.discrepancy', { ...INVOICE_DISCREPANCY.value })}
          </Text>
        </View>
      ) : (
        <View testID={`invoice-telemetry-${invoice.invoice_id}`} style={styles.telemetry}>
          <Text style={styles.telemetryCell} numberOfLines={1}>
            {po === null ? '—' : `#${po.po_number}`}
          </Text>
          {partial ? (
            // REAL: the PO's own status.
            <Text style={[styles.telemetryCell, { color: palette.warning }]} numberOfLines={1}>
              {t('finance.invoices.partial')}
            </Text>
          ) : (
            // DRAWN — `deliveries` has a free-text note and no GRN number. See the register.
            <Text style={styles.telemetryCell} numberOfLines={1}>
              {`#${DELIVERY_GRN.value[index % DELIVERY_GRN.value.length]}`}
            </Text>
          )}
          <View style={styles.telemetryScore}>
            <MaterialIcons
              name={pending ? 'pending' : 'verified'}
              size={14}
              color={pending ? palette.warning : palette.success}
            />
            {/* DRAWN — there is no matching score. See the register. */}
            <Text
              style={[styles.scoreText, { color: pending ? palette.text : palette.success }]}
              numberOfLines={1}
            >
              {t('finance.invoices.matchScore', {
                percent: percentages[index % percentages.length],
              })}
            </Text>
          </View>
        </View>
      )}

      {hasActions ? (
        <View style={styles.actions}>
          {disputed ? (
            // Drawn — an invoice carries a note, not a thread. The note lives in the detail.
            <Pressable
              testID={`invoice-chat-${invoice.invoice_id}`}
              accessibilityRole="button"
              accessibilityLabel={t('finance.invoices.chat')}
              onPress={onChat}
              style={[styles.action, styles.actionChat]}
            >
              <MaterialIcons name="forum" size={18} color={palette.accent} />
              <Text style={[styles.actionText, { color: palette.accent }]} numberOfLines={1}>
                {t('finance.invoices.chat')}
              </Text>
            </Pressable>
          ) : null}
          {disputed && canWrite ? (
            // Drawn — the invoice is already disputed and the server refuses a second dispute.
            <Pressable
              testID={`invoice-open-dispute-${invoice.invoice_id}`}
              accessibilityRole="button"
              accessibilityLabel={t('finance.invoices.openDispute')}
              onPress={onOpenDispute}
              style={[styles.action, { backgroundColor: palette.danger }]}
            >
              <MaterialIcons name="gavel" size={18} color={palette.onPrimary} />
              <Text style={[styles.actionText, { color: palette.onPrimary }]} numberOfLines={1}>
                {t('finance.invoices.openDispute')}
              </Text>
            </Pressable>
          ) : null}
          {canDispute ? (
            <Pressable
              testID={`invoice-dispute-${invoice.invoice_id}`}
              accessibilityRole="button"
              accessibilityLabel={t('finance.invoices.disputeShort')}
              accessibilityState={{ disabled: busy }}
              disabled={busy}
              onPress={onDispute}
              style={[
                styles.action,
                { backgroundColor: `${palette.danger}26` },
                busy && styles.disabled,
              ]}
            >
              <MaterialIcons name="flag" size={18} color={palette.danger} />
              <Text style={[styles.actionText, { color: palette.danger }]} numberOfLines={1}>
                {t('finance.invoices.disputeShort')}
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
              style={[styles.action, { backgroundColor: palette.primary }, busy && styles.disabled]}
            >
              <MaterialIcons name="check-circle" size={18} color={palette.onPrimary} />
              <Text style={[styles.actionText, { color: palette.onPrimary }]} numberOfLines={1}>
                {t('finance.invoices.approve')}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
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

      <View style={styles.detailCard}>
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
        <View style={styles.detailCard}>
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
 * Compared as DATE STRINGS, both `YYYY-MM-DD`, with today read off the LOCAL calendar
 * (`toIsoDate`). `due_date` is a Postgres DATE; `toISOString()` would be UTC, and a Bangkok
 * reader's "today" would lag seven hours behind the wall clock.
 */
function dueTone(invoice: VendorInvoice, p: Palette): { key: string; colour: string } {
  const today = toIsoDate(new Date());
  const due = invoice.due_date.slice(0, 10);
  if (invoice.status !== 'PAID' && due < today) {
    return { key: 'finance.invoices.overdue', colour: p.danger };
  }
  return { key: 'finance.invoices.dueOn', colour: p.muted };
}

/**
 * The date as the drawing writes it — day/month/year in figures ("15/04/2026").
 *
 * `en-GB` rather than `en-US` because the drawing puts the day first. Buddhist era follows for
 * `th` (QM-3), so a Thai reader sees 15/04/2569.
 */
function formatDay(date: string, locale: string): string {
  const value = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(value.getTime())) return date;
  return new Intl.DateTimeFormat(locale === 'th' ? 'th-TH-u-ca-buddhist' : 'en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(value);
}

/** The "All" chip's number: the five statuses summed, because every invoice is in exactly one. */
function sumCounts(counts: Record<string, number>): number {
  return Object.values(counts).reduce((sum, n) => sum + n, 0);
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    page: { flex: 1, backgroundColor: p.bg, padding: spacing.md, gap: spacing.sm },
    fill: { flex: 1 },
    // No pinned bar under the list since the scan button became its footer (R21).
    list: { gap: spacing.sm, paddingBottom: spacing.md },
    listHead: { gap: spacing.sm },

    chipRow: { marginVertical: 2 },
    chipContent: { gap: spacing.xs, paddingRight: spacing.md },
    chip: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      paddingHorizontal: 14,
      minHeight: touchTarget.iconButton - 12,
      borderRadius: radius.xl,
      backgroundColor: p.surfaceSoft,
    },
    chipOn: { backgroundColor: p.primary },
    // 999 is the documented capsule marker (§32.7) — a status dot is a circle.
    chipDot: { width: 8, height: 8, borderRadius: 999 },
    chipText: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: typography.label.fontSize,
    },
    chipCount: { color: p.muted, fontFamily: fontFamily.medium, fontSize: 11 },
    chipTextOn: { color: p.onPrimary },
    countBubble: {
      paddingHorizontal: 6,
      borderRadius: radius.xl,
      backgroundColor: `${p.bg}66`,
    },

    banner: {
      backgroundColor: p.surfaceSoft,
      borderRadius: radius.xl,
      borderLeftWidth: 6,
      borderLeftColor: p.accent,
      padding: spacing.sm,
      gap: spacing.xs,
    },
    bannerTitleRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
    bannerTitle: {
      color: p.accent,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    bannerBody: {
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: 12,
      lineHeight: 12 * 1.625,
    },
    bannerPo: { color: p.primary, fontFamily: fontFamily.medium },
    bannerGrn: { color: p.accent, fontFamily: fontFamily.medium },

    sectionRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      paddingTop: 4,
    },
    sectionLabel: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, flexShrink: 1 },
    sectionTitle: {
      flexShrink: 1,
      color: p.muted,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    eyebrow: {
      color: p.muted,
      fontFamily: fontFamily.medium,
      fontSize: 10,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },
    urgentChip: {
      paddingHorizontal: spacing.xs,
      paddingVertical: 2,
      borderRadius: radius.xl,
      backgroundColor: p.surfaceSoft,
    },
    urgentText: { color: p.muted, fontFamily: fontFamily.medium, fontSize: 11 },
    sortButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 2,
      minHeight: touchTarget.iconButton,
      paddingLeft: spacing.xs,
      flexShrink: 0,
    },
    sortText: { color: p.accent, fontFamily: fontFamily.medium, fontSize: 11 },
    truncated: { color: p.muted, fontFamily: fontFamily.regular, fontSize: 10 },

    card: {
      backgroundColor: p.surface,
      borderRadius: radius.xl,
      borderLeftWidth: 6,
      borderLeftColor: p.border,
      overflow: 'hidden',
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: spacing.xs,
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
    },
    cardText: { flex: 1, gap: 4 },
    cardTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    cardNumber: {
      flexShrink: 1,
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
    },
    tag: { paddingHorizontal: spacing.xs, paddingVertical: 2, borderRadius: radius.xl },
    tagText: { fontFamily: fontFamily.bold, fontSize: 11, textTransform: 'uppercase' },
    cardVendor: { color: p.text, fontFamily: fontFamily.semibold, fontSize: 14 },
    cardFigures: { alignItems: 'flex-end', flexShrink: 0 },
    cardAmount: { color: p.text, fontFamily: fontFamily.bold, fontSize: 20, lineHeight: 28 },
    cardDue: { fontFamily: fontFamily.medium, fontSize: 11 },
    overRow: { flexDirection: 'row', alignItems: 'center', gap: 2 },
    overText: { color: p.danger, fontFamily: fontFamily.semibold },

    telemetry: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.xs,
      backgroundColor: p.surfaceSunk,
      borderRadius: radius.lg,
      padding: spacing.xs,
      marginHorizontal: spacing.md,
      marginTop: spacing.sm,
    },
    telemetryCell: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.semibold,
      fontSize: 12,
    },
    telemetryScore: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'flex-end',
      gap: 4,
    },
    scoreText: { fontFamily: fontFamily.bold, fontSize: typography.label.fontSize },

    discrepancy: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: spacing.xs,
      borderRadius: radius.lg,
      backgroundColor: `${p.danger}1F`,
      padding: 10,
      marginHorizontal: spacing.md,
      marginTop: 10,
    },
    discrepancyText: {
      flex: 1,
      color: p.text,
      fontFamily: fontFamily.regular,
      fontSize: 12,
      lineHeight: 12 * 1.35,
    },

    actions: {
      flexDirection: 'row',
      gap: spacing.xs,
      marginTop: spacing.sm,
      paddingHorizontal: spacing.md,
      paddingVertical: 10,
      backgroundColor: `${p.surfaceBright}33`,
    },
    action: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      minHeight: touchTarget.iconButton,
      borderRadius: radius.lg,
      paddingHorizontal: spacing.xs,
    },
    actionChat: {
      backgroundColor: p.surfaceBright,
      borderWidth: 1,
      borderColor: `${p.accent}66`,
    },
    actionText: {
      flexShrink: 1,
      fontFamily: fontFamily.bold,
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
      minHeight: 52,
      borderRadius: radius.xl,
      backgroundColor: p.primary,
      paddingHorizontal: spacing.md,
      marginTop: spacing.sm,
    },
    scanButtonText: {
      color: p.onPrimary,
      fontFamily: fontFamily.bold,
      fontSize: typography.label.fontSize,
      letterSpacing: 0.8,
      textTransform: 'uppercase',
    },

    detailPage: { padding: spacing.md, gap: spacing.sm, backgroundColor: p.bg, flexGrow: 1 },
    detailCard: {
      backgroundColor: p.surface,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.md,
      gap: spacing.xs,
    },
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
