// Payments screen — FINANCE: pending payments + approve.
// List: GET /finance/payments. Approve: PATCH /finance/payments/:id/approve (offline-queued via
// mutate; backend marks PENDING → PROCESSED). Approved rows drop from the pending view optimistically.

import { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { get, mutate } from '../../api/client';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { StatusChip } from '../../components/StatusChip';
import { useT } from '../../i18n';
import { colors, fontFamily, radius, spacing, typography } from '../../theme/tokens';
import { screen } from '../../theme/screenStyles';
import { formatMoney } from '@cos/financial';

interface PaymentRow {
  payment_id: string;
  payment_reference?: string | null;
  amount?: string;
  currency_code?: string;
  invoice_id?: string;
  payment_date?: string;
  status: string;
}

export default function PaymentsScreen() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const t = useT();

  const load = async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await get<{ items?: PaymentRow[] } | PaymentRow[]>('/finance/payments');
      setPayments(Array.isArray(res) ? res : (res.items ?? []));
    } catch {
      /* offline — keep cached */
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const approve = async (id: string): Promise<void> => {
    await mutate('PATCH', `/finance/payments/${id}/approve`, {}, 'payment', id);
    setPayments((prev) => prev.filter((p) => p.payment_id !== id)); // drop from pending view
  };

  return (
    <View testID="payments-screen" style={screen.container}>
      <LoadingBoundary
        loading={loading && payments.length === 0}
        variant="list"
        theme="light"
        style={styles.boundary}
      >
        <FlatList
          testID="payments-list"
          data={payments}
          keyExtractor={(p, i) => p.payment_id || String(i)}
          refreshControl={<RefreshControl refreshing={loading} onRefresh={load} />}
          ListEmptyComponent={<Text style={screen.empty}>{t('finance.payments.empty')}</Text>}
          renderItem={({ item }) => {
            const open = expandedId === item.payment_id;
            return (
              <View testID="payment-item" style={screen.item}>
                <TouchableOpacity
                  style={styles.row}
                  onPress={() => setExpandedId(open ? null : item.payment_id)}
                >
                  <Text style={screen.itemTitle}>
                    {item.payment_reference ?? item.payment_id.slice(0, 8)}
                  </Text>
                  <StatusChip label={item.status} />
                </TouchableOpacity>
                {item.amount ? (
                  <Text style={styles.sub}>
                    {formatMoney(item.amount, item.currency_code ?? undefined)}
                  </Text>
                ) : null}

                {/* Tap-to-view detail (master 3109). Deep invoice detail (line items) needs a
                  GET /vendor-invoices/:id endpoint that does not exist yet — flagged as a follow-up. */}
                {open ? (
                  <View testID="payment-detail" style={styles.detail}>
                    {item.invoice_id ? (
                      <Text style={styles.sub}>
                        {t('finance.payments.invoiceRef')}: {item.invoice_id}
                      </Text>
                    ) : null}
                    {item.payment_date ? (
                      <Text style={styles.sub}>
                        {t('finance.payments.date')}: {item.payment_date.slice(0, 10)}
                      </Text>
                    ) : null}
                  </View>
                ) : null}

                {item.status === 'PENDING' ? (
                  <TouchableOpacity
                    testID="approve-payment-button"
                    style={styles.approve}
                    onPress={() => approve(item.payment_id)}
                  >
                    <Text style={styles.approveText}>{t('finance.payments.approve')}</Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            );
          }}
        />
      </LoadingBoundary>
    </View>
  );
}

const styles = StyleSheet.create({
  boundary: { flex: 1 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  sub: {
    fontSize: typography.caption.fontSize,
    fontFamily: fontFamily.regular,
    color: colors.textSecondary,
  },
  detail: { gap: spacing.xs, paddingVertical: spacing.xs },
  approve: {
    alignSelf: 'flex-start',
    backgroundColor: colors.success,
    borderRadius: radius.lg,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
  },
  approveText: {
    color: colors.bg,
    fontFamily: fontFamily.semibold,
    fontSize: typography.caption.fontSize,
    textTransform: 'uppercase',
  },
});
