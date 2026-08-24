// Invoices screen — FINANCE: vendor invoices list with status filter (G-M14). Source:
// GET /procurement/vendor-invoices?status=. NOTE: per-invoice detail + add-note (nav 3112) are NOT
// built — there is no GET /vendor-invoices/:id nor a note endpoint yet (flagged as a backend follow-up).

import { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { get, post } from '../../api/client';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { StatusChip } from '../../components/StatusChip';
import { useT } from '../../i18n';
import { colors, fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';
import { formatMoney } from '@cos/financial';

const STATUSES = ['RECEIVED', 'VERIFIED', 'APPROVED', 'PAID', 'DISPUTED'] as const;

interface InvoiceRow {
  vendor_invoice_id?: string;
  invoice_id?: string;
  invoice_number?: string;
  status?: string;
}
/**
 * One vendor invoice, memoized.
 *
 * `onOpen` takes the id, so one callback serves the whole list and a row's props stay equal between
 * renders — which is what lets memo skip the rows that did not change when the status filter
 * re-queries or a detail opens.
 */
const InvoiceItem = memo(function InvoiceItem({
  invoice,
  onOpen,
}: {
  invoice: InvoiceRow;
  onOpen: (id: string) => void;
}) {
  const id = invoice.vendor_invoice_id ?? invoice.invoice_id;
  return (
    <TouchableOpacity
      testID="invoice-item"
      style={screen.item}
      disabled={!id}
      onPress={() => id && onOpen(id)}
      accessibilityRole="button"
      accessibilityLabel={
        invoice.invoice_number ?? invoice.vendor_invoice_id ?? invoice.invoice_id ?? '—'
      }
      // A row with no id opens nothing; saying so is the difference between a control that is
      // unavailable and one that is broken.
      accessibilityState={{ disabled: !id }}
    >
      <Text style={screen.itemTitle}>
        {invoice.invoice_number ?? invoice.vendor_invoice_id ?? invoice.invoice_id ?? '—'}
      </Text>
      {invoice.status ? <StatusChip label={invoice.status} /> : null}
    </TouchableOpacity>
  );
});

interface InvoiceDetail {
  invoice_id: string;
  po_id: string;
  invoice_number: string;
  amount: string;
  currency_code: string;
  invoice_date: string;
  due_date: string;
  status: string;
  note?: string | null;
}

function asList<T>(res: { items?: T[] } | T[]): T[] {
  return Array.isArray(res) ? res : (res.items ?? []);
}

export default function InvoicesScreen() {
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true); // initial vendor-invoice fetch is in flight on mount
  const [status, setStatus] = useState<string>('');
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const t = useT();

  const openDetail = useCallback(async (id: string): Promise<void> => {
    try {
      const d = await get<InvoiceDetail>(`/procurement/vendor-invoices/${id}`);
      setDetail(d);
      setNoteText(d.note ?? '');
      setNoteSaved(false);
    } catch {
      /* offline / error — stay on list */
    }
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: InvoiceRow }) => <InvoiceItem invoice={item} onOpen={openDetail} />,
    [openDetail],
  );

  const saveNote = (): void => {
    if (!detail) return;
    // Online-only (post throws offline rather than queuing a bogus note sync). G-M14.
    post(`/procurement/vendor-invoices/${detail.invoice_id}/note`, { note: noteText.trim() })
      .then(() => setNoteSaved(true))
      .catch(() => {
        /* offline/error — user can retry */
      });
  };

  useEffect(() => {
    const path = status
      ? `/procurement/vendor-invoices?status=${status}`
      : '/procurement/vendor-invoices';
    setLoading(true);
    get<{ items?: InvoiceRow[] } | InvoiceRow[]>(path)
      .then((res) => setRows(asList(res)))
      .catch(() => {
        /* offline — keep cached */
      })
      .finally(() => setLoading(false));
  }, [status]);

  if (detail) {
    const fields: Array<[string, string]> = [
      [t('finance.invoices.number'), detail.invoice_number],
      [t('finance.invoices.amount'), formatMoney(detail.amount, detail.currency_code)],
      [t('finance.invoices.statusLabel'), detail.status],
      [t('finance.invoices.dueDate'), detail.due_date.slice(0, 10)],
      [t('finance.invoices.poRef'), detail.po_id],
    ];
    return (
      <View testID="invoice-detail" style={screen.container}>
        <Text style={screen.heading}>{detail.invoice_number}</Text>
        {fields.map(([label, value]) => (
          <View key={label} style={screen.kvRow}>
            <Text style={screen.kvKey}>{label}</Text>
            <Text style={screen.kvValue}>{value}</Text>
          </View>
        ))}

        <Text style={styles.noteLabel}>{t('finance.invoices.note')}</Text>
        <TextInput
          testID="invoice-note-input"
          style={styles.noteInput}
          multiline
          value={noteText}
          onChangeText={setNoteText}
          placeholder={t('finance.invoices.notePlaceholder')}
          placeholderTextColor={colors.textSecondary}
        />
        <TouchableOpacity
          testID="save-note-button"
          style={styles.noteButton}
          onPress={saveNote}
          accessibilityRole="button"
          accessibilityLabel={t('finance.invoices.saveNote')}
        >
          <Text style={styles.noteButtonText}>{t('finance.invoices.saveNote')}</Text>
        </TouchableOpacity>
        {noteSaved ? (
          <Text testID="note-saved" style={styles.savedText}>
            {t('finance.invoices.noteSaved')}
          </Text>
        ) : null}

        <TouchableOpacity
          testID="invoice-back"
          onPress={() => setDetail(null)}
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
        >
          <Text style={styles.back}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View testID="invoices-screen" style={screen.container}>
      <View testID="invoice-status-filter" style={styles.filterRow}>
        <TouchableOpacity
          testID="filter-ALL"
          style={[styles.chip, status === '' && styles.chipOn]}
          onPress={() => setStatus('')}
          accessibilityRole="radio"
          accessibilityLabel={t('finance.invoices.all')}
          accessibilityState={{ selected: status === '' }}
        >
          <Text style={[styles.chipText, status === '' && styles.chipTextOn]}>
            {t('finance.invoices.all')}
          </Text>
        </TouchableOpacity>
        {STATUSES.map((s) => (
          <TouchableOpacity
            key={s}
            testID={`filter-${s}`}
            style={[styles.chip, status === s && styles.chipOn]}
            onPress={() => setStatus(s)}
            accessibilityRole="radio"
            accessibilityLabel={s}
            accessibilityState={{ selected: status === s }}
          >
            <Text style={[styles.chipText, status === s && styles.chipTextOn]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <LoadingBoundary
        loading={loading && rows.length === 0}
        variant="list"
        theme="light"
        style={styles.boundary}
      >
        <FlatList
          testID="invoices-list"
          data={rows}
          keyExtractor={(r, i) => r.vendor_invoice_id ?? r.invoice_id ?? String(i)}
          ListEmptyComponent={<Text style={screen.empty}>{t('finance.invoices.empty')}</Text>}
          renderItem={renderItem}
        />
      </LoadingBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  boundary: { flex: 1 },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    borderRadius: radius.xl,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  chipOn: { backgroundColor: colors.primary, borderColor: colors.primary },
  chipText: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textSecondary,
  },
  chipTextOn: { color: colors.bg },
  back: { color: colors.primary, fontFamily: fontFamily.medium, marginTop: spacing.md },
  noteLabel: {
    marginTop: spacing.md,
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textSecondary,
  },
  noteInput: {
    minHeight: 72,
    borderWidth: 1,
    borderColor: colors.textSecondary,
    borderRadius: radius.lg,
    padding: spacing.md,
    textAlignVertical: 'top',
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
  },
  noteButton: {
    minHeight: 44,
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  noteButtonText: {
    color: colors.bg,
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
    textTransform: 'uppercase',
  },
  savedText: {
    color: colors.success,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
});
