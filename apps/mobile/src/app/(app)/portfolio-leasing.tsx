// Portfolio & Property Leasing Screen (Mobile)
// Implements Stitch Screen "Portfolio Dashboard - Real Estate V3" (972fe96c934d4bdbac54e01024c6ca52 / c10f4a8c3fcb47198320b2d396883029)
//
// Adheres to COS Mobile Design System (§32.7) with dark mode default, minimum 52px touch targets.

import { useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useT } from '../../i18n';
import { usePalette, useIsDark } from '../../theme/usePalette';
import { fontFamily, radius, spacing, touchTarget } from '../../theme/tokens';

interface MobileProperty {
  id: string;
  name: string;
  type: string;
  occupancy: number;
  availableUnits: number;
  yieldPercent: number;
  location: string;
}

const SAMPLE_MOBILE_PROPERTIES: MobileProperty[] = [
  {
    id: 'vanguard-tower',
    name: 'Vanguard Tower',
    type: 'Commercial Office',
    occupancy: 84.2,
    availableUnits: 12,
    yieldPercent: 6.8,
    location: 'London, UK',
  },
  {
    id: 'logipark-central',
    name: 'LogiPark Central',
    type: 'Logistics Hub',
    occupancy: 100.0,
    availableUnits: 0,
    yieldPercent: 6.2,
    location: 'Chicago, IL',
  },
  {
    id: 'arctic-cold-store',
    name: 'Arctic Cold Store',
    type: 'Cold Storage',
    occupancy: 96.0,
    availableUnits: 2,
    yieldPercent: 7.1,
    location: 'Seattle, WA',
  },
];

export default function MobilePortfolioLeasingScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const router = useRouter();

  const [activeTab, setActiveTab] = useState<'all' | 'office' | 'logistics'>('all');

  const filteredProperties = useMemo(() => {
    if (activeTab === 'office') {
      return SAMPLE_MOBILE_PROPERTIES.filter((prop) => prop.type.includes('Office'));
    }
    if (activeTab === 'logistics') {
      return SAMPLE_MOBILE_PROPERTIES.filter(
        (prop) => prop.type.includes('Logistics') || prop.type.includes('Storage'),
      );
    }
    return SAMPLE_MOBILE_PROPERTIES;
  }, [activeTab]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const styles = useMemo(() => makeStyles(p, isDark), [p, isDark]);

  return (
    <View style={styles.container} testID="portfolio-leasing-screen">
      {/* Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={handleBack}
          style={styles.backButton}
          testID="portfolio-back-btn"
        >
          <MaterialIcons name="arrow-back" size={24} color={p.text} />
        </Pressable>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t('leasing.portfolioOverview')}
          </Text>
          <View style={styles.badgeRow}>
            <View style={styles.activeDot} />
            <Text style={styles.badgeText}>Real Estate V3</Text>
          </View>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer}>
        {/* KPI Bento Row */}
        <View style={styles.kpiRow}>
          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>{t('leasing.portfolioOccupancy')}</Text>
            <Text style={styles.kpiValue}>94.2%</Text>
            <Text style={styles.kpiSub}>
              {t('leasing.mobile.kpiOccupancyChange', { change: '+1.4%' })}
            </Text>
          </View>

          <View style={[styles.kpiCard, styles.kpiCardAccent]}>
            <Text style={styles.kpiLabel}>{t('leasing.noiYield')}</Text>
            <Text style={[styles.kpiValue, { color: p.accent }]}>6.8%</Text>
            <Text style={styles.kpiSub}>{t('leasing.mobile.avgCapRate')}</Text>
          </View>

          <View style={styles.kpiCard}>
            <Text style={styles.kpiLabel}>{t('leasing.unitsAvailable')}</Text>
            <Text style={styles.kpiValue}>14</Text>
            <Text style={styles.kpiSub}>{t('leasing.mobile.inPortfolio')}</Text>
          </View>
        </View>

        {/* Tab Filters */}
        <View style={styles.tabBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('leasing.mobile.a11yAll')}
            onPress={() => setActiveTab('all')}
            style={[styles.tabButton, activeTab === 'all' && styles.tabButtonActive]}
          >
            <Text style={[styles.tabText, activeTab === 'all' && styles.tabTextActive]}>
              {t('leasing.mobile.tabAll')}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('leasing.mobile.a11yOffice')}
            onPress={() => setActiveTab('office')}
            style={[styles.tabButton, activeTab === 'office' && styles.tabButtonActive]}
          >
            <Text style={[styles.tabText, activeTab === 'office' && styles.tabTextActive]}>
              {t('leasing.mobile.tabCommercial')}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('leasing.mobile.a11yLogistics')}
            onPress={() => setActiveTab('logistics')}
            style={[styles.tabButton, activeTab === 'logistics' && styles.tabButtonActive]}
          >
            <Text style={[styles.tabText, activeTab === 'logistics' && styles.tabTextActive]}>
              {t('leasing.mobile.tabLogistics')}
            </Text>
          </Pressable>
        </View>

        {/* Property List Cards */}
        <View style={styles.listContainer}>
          {filteredProperties.map((prop) => (
            <View key={prop.id} style={styles.propertyCard} testID={`property-card-${prop.id}`}>
              <View style={styles.propertyHeader}>
                <View style={styles.iconCircle}>
                  <MaterialIcons name="apartment" size={20} color={p.accent} />
                </View>
                <View style={styles.propertyTitleWrapper}>
                  <Text style={styles.propertyName}>{prop.name}</Text>
                  <Text style={styles.propertyLocation}>
                    {prop.location} • {prop.type}
                  </Text>
                </View>
                <View style={styles.occupancyBadge}>
                  <Text style={styles.occupancyText}>{prop.occupancy}%</Text>
                </View>
              </View>

              <View style={styles.propertyStatsRow}>
                <View style={styles.statCol}>
                  <Text style={styles.statLabel}>{t('leasing.mobile.statAvailable')}</Text>
                  <Text style={styles.statVal}>
                    {t('leasing.mobile.unitsValue', { count: prop.availableUnits })}
                  </Text>
                </View>
                <View style={styles.statCol}>
                  <Text style={styles.statLabel}>{t('leasing.mobile.statGrossYield')}</Text>
                  <Text style={[styles.statVal, { color: p.accent }]}>{prop.yieldPercent}%</Text>
                </View>
                <View style={styles.statCol}>
                  <Text style={styles.statLabel}>{t('leasing.mobile.statStatus')}</Text>
                  <Text style={[styles.statVal, { color: p.success }]}>
                    {t('leasing.mobile.statusActive')}
                  </Text>
                </View>
              </View>
            </View>
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

function makeStyles(p: ReturnType<typeof usePalette>, isDark: boolean) {
  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: p.bg,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.sm,
      gap: spacing.sm,
      borderBottomWidth: 1,
      borderBottomColor: p.border,
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
      fontSize: 18,
      fontWeight: 'bold',
      color: p.text,
      fontFamily: fontFamily.bold,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 2,
    },
    activeDot: {
      width: 7,
      height: 7,
      borderRadius: 999,
      backgroundColor: p.success,
    },
    badgeText: {
      fontSize: 11,
      color: p.muted,
      fontFamily: fontFamily.medium,
    },
    contentContainer: {
      padding: spacing.md,
      gap: spacing.md,
      paddingBottom: spacing.xl,
    },
    kpiRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    kpiCard: {
      flex: 1,
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
    },
    kpiCardAccent: {
      borderLeftWidth: 3,
      borderLeftColor: p.accent,
    },
    kpiLabel: {
      fontSize: 10,
      fontWeight: '600',
      color: p.muted,
      textTransform: 'uppercase',
      fontFamily: fontFamily.semibold,
    },
    kpiValue: {
      fontSize: 18,
      fontWeight: 'bold',
      color: p.text,
      marginVertical: 4,
      fontFamily: fontFamily.bold,
    },
    kpiSub: {
      fontSize: 10,
      color: p.muted,
      fontFamily: fontFamily.regular,
    },
    tabBar: {
      flexDirection: 'row',
      backgroundColor: p.surfaceSoft,
      padding: 3,
      borderRadius: radius.md,
      gap: 4,
    },
    tabButton: {
      flex: 1,
      minHeight: touchTarget.listItem,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: radius.sm,
    },
    tabButtonActive: {
      backgroundColor: p.primary,
    },
    tabText: {
      fontSize: 12,
      fontWeight: '600',
      color: p.muted,
      fontFamily: fontFamily.medium,
    },
    tabTextActive: {
      color: p.onPrimary,
    },
    listContainer: {
      gap: spacing.md,
    },
    propertyCard: {
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      gap: spacing.sm,
    },
    propertyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
    },
    iconCircle: {
      width: 40,
      height: 40,
      borderRadius: radius.md,
      backgroundColor: isDark ? 'rgba(6, 182, 212, 0.15)' : 'rgba(6, 182, 212, 0.12)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    propertyTitleWrapper: {
      flex: 1,
    },
    propertyName: {
      fontSize: 15,
      fontWeight: 'bold',
      color: p.text,
      fontFamily: fontFamily.bold,
    },
    propertyLocation: {
      fontSize: 11,
      color: p.muted,
      fontFamily: fontFamily.regular,
    },
    occupancyBadge: {
      paddingHorizontal: 8,
      paddingVertical: 3,
      borderRadius: radius.xl,
      backgroundColor: isDark ? 'rgba(0, 200, 83, 0.15)' : 'rgba(0, 200, 83, 0.12)',
    },
    occupancyText: {
      fontSize: 12,
      fontWeight: 'bold',
      color: p.success,
      fontFamily: fontFamily.bold,
    },
    propertyStatsRow: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: p.border,
      paddingTop: spacing.xs,
      justifyContent: 'space-between',
    },
    statCol: {
      flex: 1,
    },
    statLabel: {
      fontSize: 10,
      color: p.muted,
      fontFamily: fontFamily.regular,
    },
    statVal: {
      fontSize: 12,
      fontWeight: 'bold',
      color: p.text,
      marginTop: 2,
      fontFamily: fontFamily.bold,
    },
  });
}
