// PromptPay / Thai QR Checkout Screen (Mobile)
// Implements mobile counterpart for Stitch screen "PromptPay/Thai QR Checkout - Financial Transactions"
// (Screen ID: b28493a31005468c91a366d69787d822)
//
// Adheres strictly to COS Industrial Design System (DESIGN.md / §32.7):
//   - Palantir/Linear industrial palette with dark-mode default
//   - Minimum 52px touch targets for primary action buttons
//   - Thai QR / PromptPay official settlement specs & B2B transaction metadata
//   - Real-time countdown timer & simulated banking confirmation callback

import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import Svg, { Rect, Path } from 'react-native-svg';
import { useT } from '../../i18n';
import { usePalette, useIsDark } from '../../theme/usePalette';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';

export default function CheckoutScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const router = useRouter();
  const redirectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 15-minute countdown timer (900 seconds)
  const [secondsLeft, setSecondsLeft] = useState(900);
  const [paymentStatus, setPaymentStatus] = useState<'PENDING' | 'SUCCESS'>('PENDING');

  useEffect(() => {
    if (paymentStatus === 'SUCCESS') return;
    const interval = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [paymentStatus]);

  useEffect(() => {
    return () => {
      if (redirectTimerRef.current) {
        clearTimeout(redirectTimerRef.current);
      }
    };
  }, []);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const timeFormatted = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;

  const handleSimulatePayment = useCallback(() => {
    setPaymentStatus('SUCCESS');
    redirectTimerRef.current = setTimeout(() => {
      router.back();
    }, 1800);
  }, [router]);

  const handleCancel = useCallback(() => {
    router.back();
  }, [router]);

  const styles = useMemo(() => makeStyles(p, isDark), [p, isDark]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      testID="checkout-screen"
    >
      {/* Top Header Navigation */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={handleCancel}
          style={styles.backButton}
          testID="checkout-back-btn"
        >
          <MaterialIcons name="arrow-back" size={24} color={p.text} />
        </Pressable>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t('checkout.headerTitle')}
          </Text>
          <View style={styles.sslBadge}>
            <MaterialIcons name="lock" size={13} color={p.accent} />
            <Text style={styles.sslText}>{t('checkout.secureSession')}</Text>
          </View>
        </View>
      </View>

      {/* Review & Settlement Summary Card */}
      <View style={styles.card} testID="checkout-summary-card">
        <View style={styles.cardHeader}>
          <View>
            <Text style={styles.cardSublabel}>{t('checkout.title')}</Text>
            <Text style={styles.txnId} testID="checkout-txn-id">
              TXN-2026-PP-9941
            </Text>
          </View>
          <View style={styles.timerBadge} testID="checkout-timer">
            <MaterialIcons
              name="timer"
              size={15}
              color={secondsLeft < 180 ? p.warning : p.accent}
            />
            <Text
              style={[styles.timerText, secondsLeft < 180 && { color: p.warning }]}
              testID="checkout-timer-text"
            >
              {timeFormatted}
            </Text>
          </View>
        </View>

        <View style={styles.amountContainer}>
          <Text style={styles.amountLabel}>{t('checkout.settlementAmount')}</Text>
          <Text style={styles.amountValue} testID="checkout-amount">
            ฿1,450,200.00
          </Text>
          <Text style={styles.amountCurrency}>THB (VAT Included)</Text>
        </View>

        <View style={styles.divider} />

        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Biller ID</Text>
          <Text style={styles.metaValue}>0-1055-61008-91-0</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Reference 1 (Inv)</Text>
          <Text style={styles.metaValue}>INV-2026-0891</Text>
        </View>
        <View style={styles.metaRow}>
          <Text style={styles.metaLabel}>Reference 2 (Project)</Text>
          <Text style={styles.metaValue}>PRJ-BKK-01</Text>
        </View>
      </View>

      {/* PromptPay / Thai QR Card */}
      <View style={styles.card} testID="checkout-qr-card">
        <View style={styles.qrHeader}>
          <View style={styles.qrTitleBadge}>
            <MaterialIcons name="qr-code-scanner" size={20} color={p.accent} />
            <Text style={styles.qrTitleText}>{t('checkout.promptPay')}</Text>
          </View>
          <Text style={styles.qrSubtitleText}>{t('checkout.promptPayDesc')}</Text>
        </View>

        {/* Thai QR Frame */}
        <View style={styles.thaiQrFrame}>
          {/* Header Strip mimicking Thai QR Payment */}
          <View style={styles.thaiQrBanner}>
            <Text style={styles.thaiQrBannerText}>THAI QR PAYMENT</Text>
          </View>

          {/* QR Code Graphic Container */}
          <View style={styles.qrVisualContainer}>
            <Svg width={200} height={200} viewBox="0 0 200 200" testID="checkout-qr-svg">
              {/* White Background */}
              <Rect x="0" y="0" width="200" height="200" fill="#FFFFFF" rx={8} />

              {/* Corner 1: Top-Left Finder */}
              <Rect x="20" y="20" width="46" height="46" fill="#0B1020" rx={4} />
              <Rect x="26" y="26" width="34" height="34" fill="#FFFFFF" rx={2} />
              <Rect x="32" y="32" width="22" height="22" fill="#0B1020" rx={2} />

              {/* Corner 2: Top-Right Finder */}
              <Rect x="134" y="20" width="46" height="46" fill="#0B1020" rx={4} />
              <Rect x="140" y="26" width="34" height="34" fill="#FFFFFF" rx={2} />
              <Rect x="146" y="32" width="22" height="22" fill="#0B1020" rx={2} />

              {/* Corner 3: Bottom-Left Finder */}
              <Rect x="20" y="134" width="46" height="46" fill="#0B1020" rx={4} />
              <Rect x="26" y="140" width="34" height="34" fill="#FFFFFF" rx={2} />
              <Rect x="32" y="146" width="22" height="22" fill="#0B1020" rx={2} />

              {/* Stylized QR Matrix modules */}
              <Rect x="76" y="24" width="10" height="10" fill="#0B1020" />
              <Rect x="96" y="24" width="10" height="10" fill="#0B1020" />
              <Rect x="114" y="24" width="10" height="10" fill="#0B1020" />

              <Rect x="76" y="44" width="10" height="10" fill="#0B1020" />
              <Rect x="90" y="36" width="10" height="10" fill="#0B1020" />
              <Rect x="104" y="52" width="10" height="10" fill="#0B1020" />

              <Rect x="24" y="76" width="10" height="10" fill="#0B1020" />
              <Rect x="42" y="76" width="10" height="10" fill="#0B1020" />
              <Rect x="60" y="76" width="10" height="10" fill="#0B1020" />
              <Rect x="78" y="76" width="10" height="10" fill="#0B1020" />
              <Rect x="132" y="76" width="10" height="10" fill="#0B1020" />
              <Rect x="156" y="76" width="10" height="10" fill="#0B1020" />

              <Rect x="24" y="96" width="10" height="10" fill="#0B1020" />
              <Rect x="52" y="96" width="10" height="10" fill="#0B1020" />
              <Rect x="140" y="96" width="10" height="10" fill="#0B1020" />
              <Rect x="166" y="96" width="10" height="10" fill="#0B1020" />

              <Rect x="76" y="116" width="10" height="10" fill="#0B1020" />
              <Rect x="96" y="116" width="10" height="10" fill="#0B1020" />
              <Rect x="116" y="116" width="10" height="10" fill="#0B1020" />
              <Rect x="136" y="116" width="10" height="10" fill="#0B1020" />

              <Rect x="76" y="136" width="10" height="10" fill="#0B1020" />
              <Rect x="116" y="136" width="10" height="10" fill="#0B1020" />
              <Rect x="146" y="136" width="10" height="10" fill="#0B1020" />

              <Rect x="76" y="156" width="10" height="10" fill="#0B1020" />
              <Rect x="96" y="156" width="10" height="10" fill="#0B1020" />
              <Rect x="126" y="156" width="10" height="10" fill="#0B1020" />
              <Rect x="156" y="156" width="10" height="10" fill="#0B1020" />

              {/* PromptPay Center Badge Overlay */}
              <Rect x="78" y="78" width="44" height="44" fill={p.primary} rx={radius.md} />
              <Rect x="80" y="80" width="40" height="40" fill={p.accent} rx={radius.sm} />
              <Path d="M90 92 L100 84 L110 92 L105 106 L95 106 Z" fill="#FFFFFF" />
              <Rect x="96" y="92" width="8" height="8" fill={p.primary} />
            </Svg>
          </View>

          {/* Status Bar inside QR Card */}
          <View style={styles.qrStatusContainer}>
            {paymentStatus === 'PENDING' ? (
              <View style={styles.statusPendingBadge}>
                <ActivityIndicator size="small" color={p.accent} style={{ marginRight: 6 }} />
                <Text style={styles.statusPendingText}>{t('checkout.waitingPayment')}</Text>
              </View>
            ) : (
              <View style={styles.statusSuccessBadge} testID="checkout-success-badge">
                <MaterialIcons
                  name="check-circle"
                  size={18}
                  color={p.success}
                  style={{ marginRight: 6 }}
                />
                <Text style={styles.statusSuccessText}>{t('checkout.paymentReceived')}</Text>
              </View>
            )}
          </View>
        </View>

        <Text style={styles.scanInstructions}>{t('checkout.scanInstructions')}</Text>
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        {paymentStatus === 'PENDING' && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('checkout.confirmSimulatedPayment')}
            onPress={handleSimulatePayment}
            style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
            testID="checkout-simulate-pay-btn"
          >
            <MaterialIcons name="bolt" size={20} color={p.onPrimary} style={{ marginRight: 8 }} />
            <Text style={styles.primaryButtonText}>{t('checkout.confirmSimulatedPayment')}</Text>
          </Pressable>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('checkout.cancel')}
          onPress={handleCancel}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
          testID="checkout-cancel-btn"
        >
          <Text style={styles.secondaryButtonText}>{t('checkout.cancel')}</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function makeStyles(p: ReturnType<typeof usePalette>, isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: p.bg,
    },
    contentContainer: {
      paddingHorizontal: spacing.md,
      paddingTop: spacing.sm,
      paddingBottom: spacing.xl,
      gap: spacing.md,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.xs,
    },
    backButton: {
      minWidth: touchTarget.iconButton,
      minHeight: touchTarget.iconButton,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitleContainer: {
      flex: 1,
    },
    headerTitle: {
      fontFamily: fontFamily.bold,
      fontSize: typography.title.fontSize,
      color: p.text,
    },
    sslBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    sslText: {
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      color: p.muted,
    },
    card: {
      backgroundColor: p.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.md,
      gap: spacing.sm,
    },
    cardHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    cardSublabel: {
      fontFamily: fontFamily.medium,
      fontSize: typography.caption.fontSize,
      color: p.muted,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    txnId: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.body.fontSize,
      color: p.text,
      marginTop: 2,
    },
    timerBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      backgroundColor: p.surfaceBright,
      paddingHorizontal: spacing.sm,
      paddingVertical: 4,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.border,
    },
    timerText: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
      color: p.accent,
    },
    amountContainer: {
      paddingVertical: spacing.xs,
    },
    amountLabel: {
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      color: p.muted,
    },
    amountValue: {
      fontFamily: fontFamily.bold,
      fontSize: typography.hero.fontSize,
      color: p.text,
      letterSpacing: -0.5,
      marginVertical: 2,
    },
    amountCurrency: {
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      color: p.muted,
    },
    divider: {
      height: 1,
      backgroundColor: p.border,
      marginVertical: 4,
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    metaLabel: {
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      color: p.muted,
    },
    metaValue: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.caption.fontSize,
      color: p.text,
    },
    qrHeader: {
      gap: 4,
      alignItems: 'center',
    },
    qrTitleBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    qrTitleText: {
      fontFamily: fontFamily.bold,
      fontSize: typography.body.fontSize,
      color: p.text,
    },
    qrSubtitleText: {
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      color: p.muted,
      textAlign: 'center',
    },
    thaiQrFrame: {
      backgroundColor: isDark ? p.surfaceSunk : p.surfaceSoft,
      borderRadius: radius.md,
      padding: spacing.sm,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: p.border,
      marginVertical: spacing.xs,
    },
    thaiQrBanner: {
      paddingVertical: 6,
      alignItems: 'center',
    },
    thaiQrBannerText: {
      fontFamily: fontFamily.bold,
      fontSize: 12,
      color: p.onPrimary,
      letterSpacing: 1.5,
    },
    qrVisualContainer: {
      padding: spacing.xs,
      backgroundColor: '#FFFFFF',
      borderRadius: radius.sm,
    },
    qrStatusContainer: {
      marginTop: spacing.sm,
      width: '100%',
      alignItems: 'center',
    },
    statusPendingBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(6, 182, 212, 0.15)' : 'rgba(6, 182, 212, 0.12)',
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.accent,
    },
    statusPendingText: {
      fontFamily: fontFamily.medium,
      fontSize: typography.caption.fontSize,
      color: p.accent,
    },
    statusSuccessBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: isDark ? 'rgba(0, 200, 83, 0.15)' : 'rgba(0, 200, 83, 0.12)',
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radius.xl,
      borderWidth: 1,
      borderColor: p.success,
    },
    statusSuccessText: {
      fontFamily: fontFamily.medium,
      fontSize: typography.caption.fontSize,
      color: p.success,
    },
    scanInstructions: {
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      color: p.muted,
      textAlign: 'center',
      lineHeight: 18,
      paddingHorizontal: spacing.sm,
    },
    actionsContainer: {
      gap: spacing.sm,
      marginTop: spacing.xs,
    },
    primaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.primary,
      minHeight: touchTarget.listItem,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.lg,
    },
    secondaryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: p.surfaceBright,
      borderWidth: 1,
      borderColor: p.border,
      minHeight: touchTarget.listItem,
      borderRadius: radius.sm,
      paddingHorizontal: spacing.lg,
    },
    buttonPressed: {
      opacity: 0.75,
    },
    primaryButtonText: {
      fontFamily: fontFamily.semibold,
      fontSize: typography.body.fontSize,
      color: p.onPrimary,
    },
    secondaryButtonText: {
      fontFamily: fontFamily.medium,
      fontSize: typography.body.fontSize,
      color: p.text,
    },
  });
}
