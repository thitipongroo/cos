// Drone Mission Detail & Survey Summary (Mobile)
// Implements Stitch Screen "Survey Summary - Orthophoto & Cut/Fill" (520a47753d8e4b449595d4b98344e7b2)
// and "Mission Detail - 2D Orthomosaic Inspection" (0078815fc8cb49ff947e04450b7f0445)
//
// Adheres to COS Mobile Design System (§32.7) with dark mode default, minimum 52px touch targets.

import { useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useT } from '../../i18n';
import { usePalette, useIsDark } from '../../theme/usePalette';
import { colors, fontFamily, radius, spacing, touchTarget } from '../../theme/tokens';

export default function DroneMissionDetailScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const router = useRouter();

  const [activeLayer, setActiveLayer] = useState<'ortho' | 'heatmap' | 'contours'>('ortho');

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  // No export exists behind this screen yet (D36, 2026-11-12). It used to announce "generated
  // successfully" for a report nobody generated; it now says so plainly.
  const handleExportReport = useCallback(() => {
    Alert.alert(t('drone.exportUnavailableTitle'), t('drone.exportUnavailableBody'), [
      { text: t('drone.exportUnavailableOk') },
    ]);
  }, [t]);

  const styles = useMemo(() => makeStyles(p, isDark), [p, isDark]);

  return (
    <View style={styles.container} testID="drone-mission-detail-screen">
      {/* Top Header */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('common.back')}
          onPress={handleBack}
          style={styles.backButton}
          testID="mission-back-btn"
        >
          <MaterialIcons name="arrow-back" size={24} color={p.text} />
        </Pressable>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t('drone.mission.title', { sector: 'Sector 7B' })}
          </Text>
          <View style={styles.badgeRow}>
            <MaterialIcons name="check-circle" size={13} color={p.success} />
            <Text style={styles.badgeText}>{t('drone.mission.rtkProcessed')}</Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('drone.mission.exportComingSoon')}
          onPress={handleExportReport}
          style={styles.actionIconButton}
          testID="mission-export-btn"
        >
          <MaterialIcons name="share" size={22} color={p.accent} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer}>
        {/* Layer Selector */}
        <View style={styles.layerBar}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('drone.mission.a11yOrtho')}
            onPress={() => setActiveLayer('ortho')}
            style={[styles.layerButton, activeLayer === 'ortho' && styles.layerButtonActive]}
          >
            <Text style={[styles.layerText, activeLayer === 'ortho' && styles.layerTextActive]}>
              {t('drone.mission.layerOrtho')}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('drone.mission.a11yHeatmap')}
            onPress={() => setActiveLayer('heatmap')}
            style={[styles.layerButton, activeLayer === 'heatmap' && styles.layerButtonActive]}
          >
            <Text style={[styles.layerText, activeLayer === 'heatmap' && styles.layerTextActive]}>
              {t('drone.mission.layerDsm')}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('drone.mission.a11yContours')}
            onPress={() => setActiveLayer('contours')}
            style={[styles.layerButton, activeLayer === 'contours' && styles.layerButtonActive]}
          >
            <Text style={[styles.layerText, activeLayer === 'contours' && styles.layerTextActive]}>
              {t('drone.mission.layerContours', { interval: '0.5m' })}
            </Text>
          </Pressable>
        </View>

        {/* Orthophoto Preview Card */}
        <View style={styles.mapViewer}>
          <View style={styles.mapInner}>
            <View style={styles.mapOverlayTop}>
              <View style={styles.pillBadge}>
                <Text style={styles.pillText}>GSD: 1.42 cm/px</Text>
              </View>
              <View style={styles.pillBadge}>
                <Text style={styles.pillText}>
                  {t('drone.mission.area', { area: '42,500 m²' })}
                </Text>
              </View>
            </View>

            {/* Simulated Ortho Wireframe / Contours */}
            <View style={styles.mapCenterGraphic}>
              <MaterialIcons
                name={
                  activeLayer === 'ortho'
                    ? 'map'
                    : activeLayer === 'heatmap'
                      ? 'thermostat'
                      : 'terrain'
                }
                size={54}
                color={activeLayer === 'ortho' ? p.accent : colors.syncing}
              />
              <Text style={styles.mapCenterLabel}>
                {activeLayer === 'ortho'
                  ? t('drone.mission.orthoCaption')
                  : activeLayer === 'heatmap'
                    ? t('drone.mission.dsmCaption', { min: '-2.4m', max: '+18.2m' })
                    : t('drone.mission.contoursCaption', { interval: '0.5m' })}
              </Text>
            </View>
          </View>
        </View>

        {/* Earthwork Cut & Fill Volumetric Card */}
        <View style={styles.volumetricCard}>
          <View style={styles.volumetricHeader}>
            <MaterialIcons name="straighten" size={20} color={p.accent} />
            <Text style={styles.volumetricTitle}>{t('drone.cutFillCalculation')}</Text>
          </View>

          <View style={styles.volumeRow}>
            {/* Cut */}
            <View style={styles.volumeCol}>
              <Text style={styles.volumeLabel}>{t('drone.mission.cutLabel')}</Text>
              <Text style={[styles.volumeVal, { color: p.danger }]}>14,250 m³</Text>
              <Text style={styles.volumeSub}>{t('drone.mission.cutSub')}</Text>
            </View>

            {/* Fill */}
            <View style={styles.volumeCol}>
              <Text style={styles.volumeLabel}>{t('drone.mission.fillLabel')}</Text>
              <Text style={[styles.volumeVal, { color: p.success }]}>8,920 m³</Text>
              <Text style={styles.volumeSub}>{t('drone.mission.fillSub')}</Text>
            </View>
          </View>

          {/* Net Balance */}
          <View style={styles.netBalanceRow}>
            <View>
              <Text style={styles.netLabel}>{t('drone.mission.netBalance')}</Text>
              <Text style={styles.netSurplus}>
                {t('drone.mission.surplusCut', { amount: '+5,330 m³' })}
              </Text>
            </View>
            <View style={styles.exportBadge}>
              <Text style={styles.exportBadgeText}>{t('drone.mission.landxmlReady')}</Text>
            </View>
          </View>
        </View>

        {/* Metadata Details */}
        <View style={styles.metaCard}>
          <Text style={styles.metaTitle}>{t('drone.mission.metaTitle')}</Text>
          <View style={styles.metaGrid}>
            <View style={styles.metaItem}>
              <Text style={styles.metaItemLabel}>{t('drone.mission.sensor')}</Text>
              <Text style={styles.metaItemVal}>Zenmuse P1 (45MP Full Frame)</Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaItemLabel}>{t('drone.mission.gcp')}</Text>
              <Text style={styles.metaItemVal}>
                {t('drone.mission.gcpValue', { count: 6, rmse: '1.1cm' })}
              </Text>
            </View>
            <View style={styles.metaItem}>
              <Text style={styles.metaItemLabel}>{t('drone.mission.crs')}</Text>
              <Text style={styles.metaItemVal}>WGS84 / UTM Zone 47N (EPSG:32647)</Text>
            </View>
          </View>
        </View>

        {/* Action Button */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('drone.mission.exportComingSoon')}
          onPress={handleExportReport}
          style={({ pressed }) => [styles.downloadButton, pressed && styles.buttonPressed]}
          testID="download-survey-btn"
        >
          <MaterialIcons
            name="picture-as-pdf"
            size={20}
            color={p.onPrimary}
            style={{ marginRight: 8 }}
          />
          <Text style={styles.downloadButtonText}>{t('drone.mission.exportComingSoon')}</Text>
        </Pressable>
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
    actionIconButton: {
      minWidth: touchTarget.iconButton,
      minHeight: touchTarget.iconButton,
      justifyContent: 'center',
      alignItems: 'center',
    },
    headerTitleContainer: {
      flex: 1,
    },
    headerTitle: {
      fontSize: 17,
      fontWeight: 'bold',
      color: p.text,
      fontFamily: fontFamily.bold,
    },
    badgeRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 2,
    },
    badgeText: {
      fontSize: 11,
      color: p.muted,
      fontFamily: fontFamily.regular,
    },
    contentContainer: {
      padding: spacing.md,
      gap: spacing.md,
      paddingBottom: spacing.xl,
    },
    layerBar: {
      flexDirection: 'row',
      backgroundColor: p.surfaceSoft,
      padding: 3,
      borderRadius: radius.md,
      gap: 4,
    },
    layerButton: {
      flex: 1,
      minHeight: touchTarget.listItem,
      justifyContent: 'center',
      alignItems: 'center',
      borderRadius: radius.sm,
    },
    layerButtonActive: {
      backgroundColor: p.primary,
    },
    layerText: {
      fontSize: 12,
      fontWeight: '600',
      color: p.muted,
      fontFamily: fontFamily.medium,
    },
    layerTextActive: {
      color: p.onPrimary,
    },
    mapViewer: {
      height: 220,
      borderRadius: radius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceSunk,
    },
    mapInner: {
      flex: 1,
      padding: spacing.sm,
      justifyContent: 'space-between',
    },
    mapOverlayTop: {
      flexDirection: 'row',
      justifyContent: 'space-between',
    },
    pillBadge: {
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.xl,
    },
    pillText: {
      fontSize: 10,
      fontFamily: fontFamily.medium,
      color: p.onPrimary,
      fontWeight: '600',
    },
    mapCenterGraphic: {
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
    },
    mapCenterLabel: {
      fontSize: 11,
      color: 'rgba(255, 255, 255, 0.7)',
      fontFamily: fontFamily.regular,
    },
    volumetricCard: {
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      gap: spacing.md,
    },
    volumetricHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    volumetricTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      color: p.text,
      fontFamily: fontFamily.bold,
    },
    volumeRow: {
      flexDirection: 'row',
      gap: spacing.md,
    },
    volumeCol: {
      flex: 1,
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: p.surfaceSunk,
    },
    volumeLabel: {
      fontSize: 11,
      color: p.muted,
      fontFamily: fontFamily.regular,
    },
    volumeVal: {
      fontSize: 18,
      fontWeight: 'bold',
      fontFamily: fontFamily.bold,
      marginVertical: 2,
    },
    volumeSub: {
      fontSize: 10,
      color: p.muted,
      fontFamily: fontFamily.regular,
    },
    netBalanceRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      borderTopWidth: 1,
      borderTopColor: p.border,
      paddingTop: spacing.sm,
    },
    netLabel: {
      fontSize: 11,
      color: p.muted,
      fontFamily: fontFamily.regular,
    },
    netSurplus: {
      fontSize: 15,
      fontWeight: 'bold',
      color: p.accent,
      fontFamily: fontFamily.bold,
    },
    exportBadge: {
      backgroundColor: isDark ? 'rgba(6, 182, 212, 0.15)' : 'rgba(6, 182, 212, 0.12)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.xl,
    },
    exportBadgeText: {
      fontSize: 10,
      color: p.accent,
      fontWeight: 'bold',
      fontFamily: fontFamily.medium,
    },
    metaCard: {
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: p.surface,
      borderWidth: 1,
      borderColor: p.border,
      gap: spacing.sm,
    },
    metaTitle: {
      fontSize: 13,
      fontWeight: 'bold',
      color: p.text,
      fontFamily: fontFamily.bold,
    },
    metaGrid: {
      gap: spacing.xs,
    },
    metaItem: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: 2,
    },
    metaItemLabel: {
      fontSize: 11,
      color: p.muted,
      fontFamily: fontFamily.regular,
    },
    metaItemVal: {
      fontSize: 11,
      color: p.text,
      fontFamily: fontFamily.medium,
    },
    downloadButton: {
      minHeight: touchTarget.listItem,
      backgroundColor: p.primary,
      borderRadius: radius.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    downloadButtonText: {
      fontSize: 14,
      fontWeight: 'bold',
      color: p.onPrimary,
      fontFamily: fontFamily.bold,
    },
    buttonPressed: {
      opacity: 0.85,
    },
  });
}
