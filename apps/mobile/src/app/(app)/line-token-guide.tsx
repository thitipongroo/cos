// LINE Token Acquisition Guide (Mobile)
// Implements Stitch Screen "คู่มือการรับ LINE Token - Token Acquisition Guide" (db5b82682b314d01a04c5028ef17df14)
// and "อัปเดต LINE Channel Token - LINE Token Refresh" (a3a5393c9d1e4011af75776a6d531b31)
//
// Adheres to COS Mobile Design System (§32.7) with dark mode default, minimum 52px touch targets.

import { useMemo, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useT } from '../../i18n';
import { usePalette, useIsDark } from '../../theme/usePalette';
import { fontFamily, radius, spacing, touchTarget, typography } from '../../theme/tokens';

interface GuideStep {
  step: number;
  title: string;
  description: string;
  icon: keyof typeof MaterialIcons.glyphMap;
  hint: string;
}

export default function LineTokenGuideScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const router = useRouter();

  const handleOpenLineConsole = useCallback(() => {
    void Linking.openURL('https://developers.line.biz/console/');
  }, []);

  const handleGoToSettings = useCallback(() => {
    router.push('/system-settings');
  }, [router]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const steps: GuideStep[] = useMemo(
    () => [
      {
        step: 1,
        title: t('lineGuide.step1Title'),
        description: t('lineGuide.step1Desc'),
        icon: 'domain',
        hint: 'developers.line.biz > Create Provider',
      },
      {
        step: 2,
        title: t('lineGuide.step2Title'),
        description: t('lineGuide.step2Desc'),
        icon: 'chat',
        hint: 'Channel Type: Messaging API',
      },
      {
        step: 3,
        title: t('lineGuide.step3Title'),
        description: t('lineGuide.step3Desc'),
        icon: 'key',
        hint: 'Messaging API Tab > Issue Channel Access Token',
      },
      {
        step: 4,
        title: t('lineGuide.step4Title'),
        description: t('lineGuide.step4Desc'),
        icon: 'sync-alt',
        hint: 'COS System Settings > LINE Channel Token',
      },
    ],
    [t],
  );

  const styles = useMemo(() => makeStyles(p, isDark), [p, isDark]);

  return (
    <ScrollView
      style={styles.container}
      contentContainerStyle={styles.contentContainer}
      testID="line-token-guide-screen"
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBack}
          style={styles.backButton}
          testID="line-guide-back-btn"
        >
          <MaterialIcons name="arrow-back" size={24} color={p.text} />
        </Pressable>
        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t('lineGuide.headerTitle')}
          </Text>
          <View style={styles.badgeRow}>
            <MaterialIcons name="notifications-active" size={13} color={p.accent} />
            <Text style={styles.badgeText}>{t('lineGuide.badgeText')}</Text>
          </View>
        </View>
      </View>

      {/* Hero Notice Card */}
      <View style={styles.heroCard}>
        <View style={styles.heroIconBadge}>
          <MaterialIcons name="security" size={22} color="#00C853" />
        </View>
        <View style={styles.heroTextContainer}>
          <Text style={styles.heroTitle}>{t('lineGuide.heroTitle')}</Text>
          <Text style={styles.heroSubtitle}>{t('lineGuide.heroSubtitle')}</Text>
        </View>
      </View>

      {/* Sequential Steps */}
      <View style={styles.stepsContainer}>
        {steps.map((st) => (
          <View key={st.step} style={styles.stepCard} testID={`guide-step-${st.step}`}>
            <View style={styles.stepHeader}>
              <View style={styles.stepNumberBadge}>
                <Text style={styles.stepNumberText}>{st.step}</Text>
              </View>
              <View style={styles.stepTitleWrapper}>
                <Text style={styles.stepTitle}>{st.title}</Text>
                <Text style={styles.stepHint}>{st.hint}</Text>
              </View>
              <MaterialIcons name={st.icon} size={20} color={p.accent} />
            </View>
            <Text style={styles.stepDescription}>{st.description}</Text>
          </View>
        ))}
      </View>

      {/* Action Buttons */}
      <View style={styles.actionsContainer}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('lineGuide.goToSettings')}
          onPress={handleGoToSettings}
          style={({ pressed }) => [styles.primaryButton, pressed && styles.buttonPressed]}
          testID="line-guide-settings-btn"
        >
          <MaterialIcons name="settings" size={20} color={p.onPrimary} style={{ marginRight: 8 }} />
          <Text style={styles.primaryButtonText}>{t('lineGuide.goToSettings')}</Text>
        </Pressable>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('lineGuide.openConsole')}
          onPress={handleOpenLineConsole}
          style={({ pressed }) => [styles.secondaryButton, pressed && styles.buttonPressed]}
          testID="line-guide-console-btn"
        >
          <MaterialIcons name="open-in-new" size={18} color={p.text} style={{ marginRight: 8 }} />
          <Text style={styles.secondaryButtonText}>{t('lineGuide.openConsole')}</Text>
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
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    badgeText: {
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      color: p.muted,
    },
    heroCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      backgroundColor: isDark ? 'rgba(0, 200, 83, 0.1)' : '#DCFCE7',
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(0, 200, 83, 0.3)' : '#86EFAC',
      padding: spacing.md,
      gap: spacing.sm,
    },
    heroIconBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: isDark ? '#0F172A' : '#FFFFFF',
      alignItems: 'center',
      justifyContent: 'center',
    },
    heroTextContainer: {
      flex: 1,
    },
    heroTitle: {
      fontFamily: fontFamily.bold,
      fontSize: typography.body.fontSize,
      color: isDark ? '#F8FAFC' : '#14532D',
    },
    heroSubtitle: {
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      color: isDark ? '#94A3B8' : '#166534',
      marginTop: 2,
      lineHeight: 18,
    },
    stepsContainer: {
      gap: spacing.sm,
    },
    stepCard: {
      backgroundColor: p.surface,
      borderRadius: radius.md,
      borderWidth: 1,
      borderColor: p.border,
      padding: spacing.md,
      gap: spacing.xs,
    },
    stepHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    stepNumberBadge: {
      width: 26,
      height: 26,
      borderRadius: 13,
      backgroundColor: p.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepNumberText: {
      fontFamily: fontFamily.bold,
      fontSize: 12,
      color: p.onPrimary,
    },
    stepTitleWrapper: {
      flex: 1,
      marginHorizontal: spacing.sm,
    },
    stepTitle: {
      fontFamily: fontFamily.bold,
      fontSize: typography.body.fontSize,
      color: p.text,
    },
    stepHint: {
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      color: p.muted,
      marginTop: 1,
    },
    stepDescription: {
      fontFamily: fontFamily.regular,
      fontSize: typography.caption.fontSize,
      color: p.text,
      lineHeight: 19,
      marginTop: 4,
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
