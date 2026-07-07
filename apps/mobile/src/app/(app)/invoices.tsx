// Invoices screen — FINANCE: vendor invoices list with status filter (G-M14). Source:
// GET /procurement/vendor-invoices?status=. NOTE: per-invoice detail + add-note (nav 3112) are NOT
// built — there is no GET /vendor-invoices/:id nor a note endpoint yet (flagged as a backend follow-up).

import { useEffect, useState } from 'react';
import { View, Text, TextInput, TouchableOpacity, FlatList, StyleSheet } from 'react-native';
import { get, post } from '../../api/client';
import { StatusChip } from '../../components/StatusChip';
import { useT } from '../../i18n';
import { colors, fontFamily, spacing, typography } from '../../theme/tokens';

const STATUSES = ['RECEIVED', 'VERIFIED', 'APPROVED', 'PAID', 'DISPUTED'] as const;

interface InvoiceRow {
  vendor_invoice_id?: string;
  invoice_id?: string;
  invoice_number?: string;
  status?: string;
}
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
  const [status, setStatus] = useState<string>('');
  const [detail, setDetail] = useState<InvoiceDetail | null>(null);
  const [noteText, setNoteText] = useState('');
  const [noteSaved, setNoteSaved] = useState(false);
  const t = useT();

  const openDetail = async (id: string): Promise<void> => {
    try {
      const d = await get<InvoiceDetail>(`/procurement/vendor-invoices/${id}`);
      setDetail(d);
      setNoteText(d.note ?? '');
      setNoteSaved(false);
    } catch {
      /* offline / error — stay on list */
    }
  };

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
    get<{ items?: InvoiceRow[] } | InvoiceRow[]>(path)
      .then((res) => setRows(asList(res)))
      .catch(() => {
        /* offline — keep cached */
      });
  }, [status]);

  if (detail) {
    const fields: Array<[string, string]> = [
      [t('finance.invoices.number'), detail.invoice_number],
      [t('finance.invoices.amount'), `${detail.amount} ${detail.currency_code}`],
      [t('finance.invoices.statusLabel'), detail.status],
      [t('finance.invoices.dueDate'), detail.due_date.slice(0, 10)],
      [t('finance.invoices.poRef'), detail.po_id],
    ];
    return (
      <View testID="invoice-detail" style={styles.container}>
        <Text style={styles.heading}>{detail.invoice_number}</Text>
        {fields.map(([label, value]) => (
          <View key={label} style={styles.detailRow}>
            <Text style={styles.detailKey}>{label}</Text>
            <Text style={styles.detailVal}>{value}</Text>
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
        <TouchableOpacity testID="save-note-button" style={styles.noteButton} onPress={saveNote}>
          <Text style={styles.noteButtonText}>{t('finance.invoices.saveNote')}</Text>
        </TouchableOpacity>
        {noteSaved ? (
          <Text testID="note-saved" style={styles.savedText}>
            {t('finance.invoices.noteSaved')}
          </Text>
        ) : null}

        <TouchableOpacity testID="invoice-back" onPress={() => setDetail(null)}>
          <Text style={styles.back}>{t('common.back')}</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View testID="invoices-screen" style={styles.container}>
      <Text style={styles.heading}>{t('finance.invoices.title')}</Text>

      <View testID="invoice-status-filter" style={styles.filterRow}>
        <TouchableOpacity
          testID="filter-ALL"
          style={[styles.chip, status === '' && styles.chipOn]}
          onPress={() => setStatus('')}
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
          >
            <Text style={[styles.chipText, status === s && styles.chipTextOn]}>{s}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <FlatList
        testID="invoices-list"
        data={rows}
        keyExtractor={(r, i) => r.vendor_invoice_id ?? r.invoice_id ?? String(i)}
        ListEmptyComponent={<Text style={styles.empty}>{t('finance.invoices.empty')}</Text>}
        renderItem={({ item }) => {
          const id = item.vendor_invoice_id ?? item.invoice_id;
          return (
            <TouchableOpacity
              testID="invoice-item"
              style={styles.item}
              disabled={!id}
              onPress={() => id && openDetail(id)}
            >
              <Text style={styles.itemTitle}>
                {item.invoice_number ?? item.vendor_invoice_id ?? item.invoice_id ?? '—'}
              </Text>
              {item.status ? <StatusChip label={item.status} /> : null}
            </TouchableOpacity>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, padding: spacing.md, gap: spacing.sm },
  heading: {
    fontSize: typography.title.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
  },
  filterRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.xs },
  chip: {
    borderRadius: 16,
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
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
  },
  detailKey: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  detailVal: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.semibold,
    color: colors.textPrimary,
  },
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
    borderRadius: 8,
    padding: spacing.md,
    textAlignVertical: 'top',
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textPrimary,
  },
  noteButton: {
    minHeight: 44,
    backgroundColor: colors.primary,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.xs,
  },
  noteButtonText: {
    color: colors.bg,
    fontFamily: fontFamily.semibold,
    fontSize: typography.body.fontSize,
  },
  savedText: {
    color: colors.success,
    fontFamily: fontFamily.medium,
    fontSize: typography.caption.fontSize,
  },
  item: {
    paddingVertical: spacing.sm,
    borderBottomWidth: 1,
    borderBottomColor: colors.surface,
    gap: spacing.xs,
  },
  itemTitle: {
    fontSize: typography.body.fontSize,
    fontFamily: fontFamily.medium,
    color: colors.textPrimary,
  },
  empty: { color: colors.textSecondary, fontFamily: fontFamily.regular, padding: spacing.md },
});
