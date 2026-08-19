// Payments screen — FINANCE: pending payments + approve.
// List: GET /finance/payments. Approve: PATCH /finance/payments/:id/approve (offline-queued via
// mutate; backend marks PENDING → PROCESSED). Approved rows drop from the pending view optimistically.

import { memo, useCallback, useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, FlatList, RefreshControl, StyleSheet } from 'react-native';
import { get, mutate } from '../../api/client';
import { LoadingBoundary } from '../../components/LoadingBoundary';
import { StatusChip } from '../../components/StatusChip';
import { useT } from '../../i18n';
import type { TranslateFn } from '../../i18n';
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

/**
 * One payment, memoized.
 *
 * `open` is passed in rather than read from the screen so this row's props say everything about what
 * it draws — memo can then let every row except the two whose expansion changed skip a re-render
 * when the tap lands. The two callbacks take the id and are created once for the whole list, so they
 * do not defeat that; `t` is a useCallback keyed on locale (i18n/index.tsx) and is stable too.
 */
const PaymentItem = memo(function PaymentItem({
  payment,
  open,
  onToggle,
  onApprove,
  t,
}: {
  payment: PaymentRow;
  open: boolean;
  onToggle: (id: string) => void;
  onApprove: (id: string) => void;
  t: TranslateFn;
}) {
  return (
    <View testID="payment-item" style={screen.item}>
      <TouchableOpacity style={styles.row} onPress={() => onToggle(payment.payment_id)}>
        <Text style={screen.itemTitle}>
          {payment.payment_reference ?? payment.payment_id.slice(0, 8)}
        </Text>
        <StatusChip label={payment.status} />
      </TouchableOpacity>
      {payment.amount ? (
        <Text style={styles.sub}>
          {formatMoney(payment.amount, payment.currency_code ?? undefined)}
        </Text>
      ) : null}

      {/* Tap-to-view detail (master 3109). Deep invoice detail (line items) needs a
          GET /vendor-invoices/:id endpoint that does not exist yet — flagged as a follow-up. */}
      {open ? (
        <View testID="payment-detail" style={styles.detail}>
          {payment.invoice_id ? (
            <Text style={styles.sub}>
              {t('finance.payments.invoiceRef')}: {payment.invoice_id}
            </Text>
          ) : null}
          {payment.payment_date ? (
            <Text style={styles.sub}>
              {t('finance.payments.date')}: {payment.payment_date.slice(0, 10)}
            </Text>
          ) : null}
        </View>
      ) : null}

      {payment.status === 'PENDING' ? (
        <TouchableOpacity
          testID="approve-payment-button"
          style={styles.approve}
          onPress={() => onApprove(payment.payment_id)}
        >
          <Text style={styles.approveText}>{t('finance.payments.approve')}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
});

export default function PaymentsScreen() {
  const [payments, setPayments] = useState<PaymentRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const t = useT();

  const load = useCallback(async (): Promise<void> => {
    setLoading(true);
    try {
      const res = await get<{ items?: PaymentRow[] } | PaymentRow[]>('/finance/payments');
      setPayments(Array.isArray(res) ? res : (res.items ?? []));
    } catch {
      /* offline — keep cached */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // Both callbacks are created once for the whole list and take the id, so a row's props stay equal
  // between renders and memo can do its job. The state updates are functional for the same reason —
  // reading `expandedId` here would put it in the dependency list and rebuild the callback per tap.
  const toggle = useCallback((id: string): void => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  const approve = useCallback(async (id: string): Promise<void> => {
    await mutate('PATCH', `/finance/payments/${id}/approve`, {}, 'payment', id);
    setPayments((prev) => prev.filter((p) => p.payment_id !== id)); // drop from pending view
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: PaymentRow }) => (
      <PaymentItem
        payment={item}
        open={expandedId === item.payment_id}
        onToggle={toggle}
        onApprove={approve}
        t={t}
      />
    ),
    [expandedId, toggle, approve, t],
  );

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
          // `expandedId` lives outside `data`, so FlatList is told about it explicitly rather than
          // being left to infer the change from renderItem's identity.
          extraData={expandedId}
          renderItem={renderItem}
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
