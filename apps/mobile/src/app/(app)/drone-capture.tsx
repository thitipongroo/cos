// Drone Reality Capture Hub (Mobile)
// Implements Stitch Screen "Drone Reality Capture - Site Engineer" (643f7a7b6ede40bcb6c8a5b4a61e7c32)
//
// Adheres to COS Mobile Design System (§32.7) with dark mode default, minimum 52px touch targets.

import { useState, useMemo, useCallback } from 'react';
import { View, Text, ScrollView, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { MaterialIcons } from '@expo/vector-icons';
import { useT } from '../../i18n';
import { usePalette, useIsDark } from '../../theme/usePalette';
import { colors, fontFamily, radius, spacing, touchTarget } from '../../theme/tokens';

export default function DroneRealityCaptureScreen(): React.JSX.Element {
  const t = useT();
  const p = usePalette();
  const isDark = useIsDark();
  const router = useRouter();

  const [isSurveying, setIsSurveying] = useState(false);
  const [activeMode, setActiveMode] = useState<'mesh' | 'ortho' | 'orbit'>('mesh');

  const handleToggleSurvey = useCallback(() => {
    setIsSurveying((prev) => !prev);
  }, []);

  const handleOpenMissionDetail = useCallback(() => {
    router.push('/drone-mission-detail');
  }, [router]);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const styles = useMemo(() => makeStyles(p, isDark), [p, isDark]);

  return (
    <View style={styles.container} testID="drone-capture-screen">
      {/* Top App Bar */}
      <View style={styles.header}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Back"
          onPress={handleBack}
          style={styles.backButton}
          testID="drone-back-btn"
        >
          <MaterialIcons name="arrow-back" size={24} color={p.text} />
        </Pressable>

        <View style={styles.headerTitleContainer}>
          <Text style={styles.headerTitle} numberOfLines={1}>
            {t('drone.realityCapture')}
          </Text>
          <View style={styles.badgeRow}>
            <View style={styles.activeDot} />
            <Text style={styles.badgeText}>DJI M300 RTK • CONNECTED</Text>
          </View>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Mission Details"
          onPress={handleOpenMissionDetail}
          style={styles.actionIconButton}
          testID="drone-detail-nav-btn"
        >
          <MaterialIcons name="layers" size={22} color={p.accent} />
        </Pressable>
      </View>

      <ScrollView contentContainerStyle={styles.contentContainer}>
        {/* Live Telemetry Grid */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('drone.liveTelemetry')}</Text>
          <Text style={styles.droneModelText}>RTK FIX: 1.2cm</Text>
        </View>

        <View style={styles.telemetryGrid}>
          <View style={styles.telemetryCard}>
            <MaterialIcons name="battery-charging-full" size={20} color={p.success} />
            <Text style={styles.telemetryVal}>84%</Text>
            <Text style={styles.telemetryLabel}>Power</Text>
          </View>

          <View style={styles.telemetryCard}>
            <MaterialIcons name="height" size={20} color={p.accent} />
            <Text style={styles.telemetryVal}>122m</Text>
            <Text style={styles.telemetryLabel}>Altitude</Text>
          </View>

          <View style={[styles.telemetryCard, styles.telemetryCardActive]}>
            <MaterialIcons name="satellite-alt" size={20} color={colors.syncing} />
            <Text style={styles.telemetryVal}>18</Text>
            <Text style={styles.telemetryLabel}>GPS Sat</Text>
          </View>

          <View style={styles.telemetryCard}>
            <MaterialIcons name="signal-cellular-alt" size={20} color={p.primary} />
            <Text style={styles.telemetryVal}>-65dB</Text>
            <Text style={styles.telemetryLabel}>Signal</Text>
          </View>
        </View>

        {/* Viewport HUD Simulation */}
        <View style={styles.viewportContainer}>
          <View style={styles.viewportBg}>
            {/* Top HUD */}
            <View style={styles.hudTopRow}>
              <View style={styles.recBadge}>
                <View style={[styles.recDot, isSurveying ? styles.recDotRecording : null]} />
                <Text style={styles.recText}>
                  {isSurveying ? 'SURVEYING 00:14:22' : 'STANDBY READY'}
                </Text>
              </View>

              <View style={styles.hudButtonsCol}>
                <View style={styles.hudCircleBtn}>
                  <MaterialIcons name="zoom-in" size={18} color={p.onPrimary} />
                </View>
                <View style={styles.hudCircleBtn}>
                  <MaterialIcons name="grid-on" size={18} color={p.onPrimary} />
                </View>
              </View>
            </View>

            {/* Center Crosshair Overlay */}
            <View style={styles.crosshairCenter}>
              <MaterialIcons name="filter-center-focus" size={48} color="rgba(6, 182, 212, 0.6)" />
              <Text style={styles.crosshairCoord}>13.7563° N, 100.5018° E</Text>
            </View>

            {/* Bottom HUD Compass */}
            <View style={styles.hudBottomRow}>
              <View style={styles.compassBox}>
                <MaterialIcons name="navigation" size={20} color={p.accent} />
                <Text style={styles.compassText}>N 45°</Text>
              </View>
              <Text style={styles.gsdText}>GSD: 1.42 cm/px</Text>
            </View>
          </View>
        </View>

        {/* Capture Controls */}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={isSurveying ? 'Stop Survey' : 'Start Real-Time Survey'}
          onPress={handleToggleSurvey}
          style={({ pressed }) => [
            styles.primaryActionButton,
            isSurveying && styles.primaryActionButtonStop,
            pressed && styles.buttonPressed,
          ]}
          testID="toggle-survey-btn"
        >
          <MaterialIcons
            name={isSurveying ? 'stop' : 'play-arrow'}
            size={24}
            color={p.onPrimary}
            style={{ marginRight: 8 }}
          />
          <Text style={styles.primaryActionText}>
            {isSurveying ? t('drone.stopSurvey') : t('drone.startSurvey')}
          </Text>
        </Pressable>

        {/* Scan Modes */}
        <View style={styles.modeButtonsRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Point Cloud"
            onPress={() => setActiveMode('mesh')}
            style={[styles.modeButton, activeMode === 'mesh' && styles.modeButtonActive]}
          >
            <MaterialIcons
              name="cloud-done"
              size={18}
              color={activeMode === 'mesh' ? p.primary : p.muted}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[styles.modeButtonText, activeMode === 'mesh' && styles.modeButtonTextActive]}
            >
              Point Cloud
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Orbit Scan"
            onPress={() => setActiveMode('orbit')}
            style={[styles.modeButton, activeMode === 'orbit' && styles.modeButtonActive]}
          >
            <MaterialIcons
              name="published-with-changes"
              size={18}
              color={activeMode === 'orbit' ? p.primary : p.muted}
              style={{ marginRight: 6 }}
            />
            <Text
              style={[styles.modeButtonText, activeMode === 'orbit' && styles.modeButtonTextActive]}
            >
              Orbit Scan
            </Text>
          </Pressable>
        </View>

        {/* AI Reality Scan Card */}
        <View style={styles.aiModuleCard}>
          <View style={styles.aiHeader}>
            <View style={styles.aiTitleRow}>
              <MaterialIcons name="psychology" size={20} color={p.accent} />
              <Text style={styles.aiTitle}>{t('drone.aiRealityScan')}</Text>
            </View>
            <View style={styles.liveTag}>
              <Text style={styles.liveTagText}>AI EDGE</Text>
            </View>
          </View>

          <View style={styles.aiStatsRow}>
            <View>
              <Text style={styles.aiSubText}>Edge Confidence</Text>
              <Text style={styles.aiConfidence}>98.2%</Text>
            </View>
            <View style={{ alignItems: 'flex-end' }}>
              <Text style={styles.aiSubText}>Detected Elements</Text>
              <Text style={styles.aiElements}>14 Rebar Columns</Text>
            </View>
          </View>
        </View>

        {/* Recent Missions */}
        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>{t('drone.recentMissions')}</Text>
          {/* "View all" (D36): it read "Close" while opening the mission detail, with no role. */}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('drone.viewAll')}
            onPress={handleOpenMissionDetail}
            testID="recent-missions-view-all"
          >
            <Text style={styles.viewAllText}>{t('drone.viewAll')}</Text>
          </Pressable>
        </View>

        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Sector 7B Mesh Gen"
          onPress={handleOpenMissionDetail}
          style={styles.missionCard}
          testID="recent-mission-card-1"
        >
          <View style={styles.missionThumbnail}>
            <MaterialIcons name="view-in-ar" size={28} color={p.accent} />
          </View>
          <View style={styles.missionInfo}>
            <View style={styles.missionHeaderRow}>
              <Text style={styles.missionTitle}>Sector 7B Mesh Gen</Text>
              <MaterialIcons name="check-circle" size={18} color={p.success} />
            </View>
            <Text style={styles.missionDate}>24 Oct 2026 • 14:20</Text>
            <View style={styles.missionTagsRow}>
              <Text style={styles.missionTag}>4.2 GB</Text>
              <Text style={styles.missionTag}>12k Polygons</Text>
              <Text style={styles.missionTag}>Orthomosaic 2D</Text>
            </View>
          </View>
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
      fontSize: 10,
      color: p.muted,
      fontFamily: fontFamily.medium,
    },
    contentContainer: {
      padding: spacing.md,
      gap: spacing.md,
      paddingBottom: spacing.xl,
    },
    sectionHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginTop: spacing.xs,
    },
    sectionTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      color: p.text,
      fontFamily: fontFamily.bold,
    },
    droneModelText: {
      fontSize: 11,
      fontFamily: fontFamily.medium,
      color: p.accent,
      fontWeight: '600',
    },
    viewAllText: {
      fontSize: 12,
      color: p.primary,
      fontWeight: '600',
      fontFamily: fontFamily.medium,
    },
    telemetryGrid: {
      flexDirection: 'row',
      gap: spacing.xs,
    },
    telemetryCard: {
      flex: 1,
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: p.surface,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: p.border,
    },
    telemetryCardActive: {
      borderBottomWidth: 2,
      borderBottomColor: colors.syncing,
    },
    telemetryVal: {
      fontSize: 15,
      fontWeight: 'bold',
      color: p.text,
      marginVertical: 2,
      fontFamily: fontFamily.bold,
    },
    telemetryLabel: {
      fontSize: 10,
      color: p.muted,
      textTransform: 'uppercase',
      fontFamily: fontFamily.regular,
    },
    viewportContainer: {
      height: 200,
      borderRadius: radius.lg,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: p.border,
      backgroundColor: p.surfaceSunk,
    },
    viewportBg: {
      flex: 1,
      padding: spacing.sm,
      justifyContent: 'space-between',
    },
    hudTopRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
    },
    recBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.xl,
      gap: 6,
    },
    recDot: {
      width: 7,
      height: 7,
      borderRadius: 999,
      backgroundColor: p.muted,
    },
    recDotRecording: {
      backgroundColor: p.danger,
    },
    recText: {
      color: p.onPrimary,
      fontSize: 11,
      fontWeight: 'bold',
      fontFamily: fontFamily.medium,
    },
    hudButtonsCol: {
      gap: 6,
    },
    hudCircleBtn: {
      width: 32,
      height: 32,
      borderRadius: 16,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      justifyContent: 'center',
      alignItems: 'center',
    },
    crosshairCenter: {
      alignItems: 'center',
      justifyContent: 'center',
    },
    crosshairCoord: {
      color: 'rgba(255, 255, 255, 0.6)',
      fontSize: 10,
      fontFamily: fontFamily.regular,
      marginTop: 2,
    },
    hudBottomRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    compassBox: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: radius.sm,
      gap: 4,
    },
    compassText: {
      color: p.onPrimary,
      fontSize: 11,
      fontWeight: 'bold',
      fontFamily: fontFamily.medium,
    },
    gsdText: {
      color: p.muted,
      fontSize: 10,
      fontFamily: fontFamily.regular,
    },
    primaryActionButton: {
      minHeight: touchTarget.listItem,
      backgroundColor: p.primary,
      borderRadius: radius.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    primaryActionButtonStop: {
      backgroundColor: p.danger,
    },
    primaryActionText: {
      fontSize: 14,
      fontWeight: 'bold',
      color: p.onPrimary,
      fontFamily: fontFamily.bold,
    },
    buttonPressed: {
      opacity: 0.85,
    },
    modeButtonsRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    modeButton: {
      flex: 1,
      minHeight: touchTarget.listItem,
      backgroundColor: p.surface,
      borderRadius: radius.md,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: p.border,
    },
    modeButtonActive: {
      borderColor: p.primary,
      backgroundColor: isDark ? 'rgba(37, 99, 235, 0.15)' : 'rgba(37, 99, 235, 0.08)',
    },
    modeButtonText: {
      fontSize: 12,
      fontWeight: '600',
      color: p.muted,
      fontFamily: fontFamily.medium,
    },
    modeButtonTextActive: {
      color: p.primary,
    },
    aiModuleCard: {
      padding: spacing.md,
      borderRadius: radius.lg,
      backgroundColor: p.surface,
      borderLeftWidth: 4,
      borderLeftColor: p.accent,
      borderWidth: 1,
      borderColor: p.border,
      gap: spacing.sm,
    },
    aiHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    aiTitleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    aiTitle: {
      fontSize: 13,
      fontWeight: 'bold',
      color: p.accent,
      textTransform: 'uppercase',
      fontFamily: fontFamily.bold,
    },
    liveTag: {
      backgroundColor: isDark ? 'rgba(6, 182, 212, 0.2)' : 'rgba(6, 182, 212, 0.12)',
      paddingHorizontal: 6,
      paddingVertical: 2,
      borderRadius: radius.xl,
    },
    liveTagText: {
      fontSize: 10,
      fontWeight: 'bold',
      color: p.accent,
      fontFamily: fontFamily.medium,
    },
    aiStatsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
    },
    aiSubText: {
      fontSize: 11,
      color: p.muted,
      fontFamily: fontFamily.regular,
    },
    aiConfidence: {
      fontSize: 20,
      fontWeight: 'bold',
      color: p.text,
      fontFamily: fontFamily.bold,
      marginTop: 2,
    },
    aiElements: {
      fontSize: 13,
      fontWeight: 'bold',
      color: p.text,
      fontFamily: fontFamily.semibold,
      marginTop: 2,
    },
    missionCard: {
      flexDirection: 'row',
      padding: spacing.sm,
      borderRadius: radius.md,
      backgroundColor: p.surface,
      borderLeftWidth: 4,
      borderLeftColor: p.success,
      gap: spacing.sm,
      alignItems: 'center',
    },
    missionThumbnail: {
      width: 50,
      height: 50,
      borderRadius: radius.sm,
      backgroundColor: p.surfaceSunk,
      justifyContent: 'center',
      alignItems: 'center',
    },
    missionInfo: {
      flex: 1,
    },
    missionHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    missionTitle: {
      fontSize: 14,
      fontWeight: 'bold',
      color: p.text,
      fontFamily: fontFamily.bold,
    },
    missionDate: {
      fontSize: 11,
      color: p.muted,
      marginVertical: 2,
      fontFamily: fontFamily.regular,
    },
    missionTagsRow: {
      flexDirection: 'row',
      gap: 6,
      marginTop: 2,
    },
    missionTag: {
      fontSize: 10,
      fontFamily: fontFamily.medium,
      color: p.muted,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.06)' : p.surfaceSoft,
      paddingHorizontal: 5,
      paddingVertical: 1,
      borderRadius: radius.xl,
    },
  });
}
