// Transparency Portal — hub (mockup 01_data_collection/00_data_collection_detail).
//
// Reached from drawer → PRIVACY POLICY → the policy's Data Collection card (PO decision 2026-08-04;
// the push lives in privacy-policy.tsx). It was Profile → Transparency Portal at first; both halves
// of that path are gone — Profile is no longer a tab, and the portal row was removed from it.
// It lives in (app), not beside the pre-auth Privacy Policy where the mockups sit, because every
// screen below it describes — and one of them shows — the signed-in user's own record; AuthGate
// would bounce a pre-auth route before any of it loads.
//
// Content is the corrected set, not the mockup's. The mockup's summary tile claimed "12 Data
// Categories", a global "5 Year Retention" and a biometric hash; none of those are true. The count
// here is the number of distinct @pdpa categories actually tagged in the schema by migration
// 20260803000001_tag_pii_columns (identity, contact, location, financial, operational = 5), and
// retention is described as per-record-type because that is what data-retention-policy.md defines.

import { ScrollView, View, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useT } from '../../i18n';
import { usePalette } from '../../theme/usePalette';
import { fontFamily, spacing, typography } from '../../theme/tokens';
import type { Palette } from '../../theme/palette';
import {
  SectionLabel,
  Lede,
  NavCard,
  InfoCard,
  SummaryTile,
  StatusPill,
} from '../../components/TransparencyKit';

/** Category rows. `route` is the detail screen each one opens. */
const CATEGORIES = [
  { key: 'identity', icon: 'badge', route: '/transparency-identity' },
  { key: 'location', icon: 'location-on', route: '/transparency-location' },
  { key: 'logs', icon: 'receipt-long', route: '/transparency-logs' },
  { key: 'manual', icon: 'edit-note', route: '/transparency-manual' },
  { key: 'payroll', icon: 'payments', route: '/transparency-manual' },
] as const;

/**
 * The technical detail screens behind the logs category.
 *
 * Separate from CATEGORIES because they describe the platform's own machinery rather than a category
 * of the subject's data — what the network address resolves to, what this device is trusted for, how
 * a session and a timestamp are recorded.
 */
const TECHNICAL = [
  { key: 'network', icon: 'router', route: '/transparency-network' },
  { key: 'device', icon: 'smartphone', route: '/device-details' },
  { key: 'security', icon: 'security', route: '/account-security' },
  { key: 'session', icon: 'vpn-key', route: '/transparency-session' },
  { key: 'timestamps', icon: 'schedule', route: '/transparency-timestamps' },
] as const;

/** How data arrives. IoT is `planned` — Stage 1 has no ingestion path at all (Phase 21/24). */
const INPUTS = [
  { key: 'manual', icon: 'edit-note', status: 'live', route: '/transparency-manual' },
  { key: 'camera', icon: 'photo-camera', status: 'live', route: '/transparency-ai' },
  { key: 'iot', icon: 'sensors', status: 'planned', route: '/transparency-iot' },
] as const;

export default function TransparencyScreen(): React.JSX.Element {
  const t = useT();
  const pal = usePalette();
  const router = useRouter();
  const styles = makeStyles(pal);

  return (
    <ScrollView
      testID="transparency"
      style={{ backgroundColor: pal.bg }}
      contentContainerStyle={styles.content}
    >
      <Lede>{t('transparency.portal.lede')}</Lede>

      <SummaryTile>
        <View style={styles.summaryRow}>
          <View style={styles.summaryFlex}>
            <Text style={styles.summaryLabel}>{t('transparency.portal.summaryLabel')}</Text>
            <Text testID="transparency-count" style={styles.summaryValue}>
              {t('transparency.portal.summaryValue')}
            </Text>
          </View>
          <StatusPill status="live" label={t('transparency.status.live')} />
        </View>
        <Text style={styles.summaryNote}>{t('transparency.portal.summaryNote')}</Text>
      </SummaryTile>

      <SectionLabel>{t('transparency.portal.breakdown')}</SectionLabel>
      {CATEGORIES.map((c) => (
        <NavCard
          key={c.key}
          testID={`transparency-cat-${c.key}`}
          icon={c.icon}
          title={t(`transparency.portal.cat.${c.key}.title`)}
          body={t(`transparency.portal.cat.${c.key}.body`)}
          onPress={() => router.push(c.route)}
        />
      ))}

      <SectionLabel>{t('transparency.portal.inputs')}</SectionLabel>
      {INPUTS.map((i) => (
        <NavCard
          key={i.key}
          testID={`transparency-input-${i.key}`}
          icon={i.icon}
          tint={i.status === 'planned' ? pal.muted : pal.primary}
          title={t(`transparency.portal.input.${i.key}.title`)}
          body={t(`transparency.portal.input.${i.key}.body`)}
          onPress={() => router.push(i.route)}
          status={i.status}
          statusLabel={t(`transparency.status.${i.status}`)}
        />
      ))}

      <SectionLabel>{t('transparency.portal.retention')}</SectionLabel>
      <InfoCard
        icon="schedule"
        title={t('transparency.portal.retention')}
        body={t('transparency.portal.retentionBody')}
      />

      <SectionLabel>{t('transparency.portal.rights')}</SectionLabel>
      <InfoCard
        icon="gavel"
        title={t('transparency.portal.rights')}
        body={t('transparency.portal.rightsBody')}
      />
      {/* Export is no longer a DisabledAction. PDPA-10/11 shipped (ADR-078), so the row that used
          to say "coming soon" now goes somewhere. */}
      <NavCard
        testID="transparency-export"
        icon="download"
        title={t('dataExport.title')}
        body={t('transparency.portal.exportBody')}
        onPress={() => router.push('/data-export')}
      />
      <NavCard
        testID="transparency-cat-delete"
        icon="delete-outline"
        tint={pal.danger}
        title={t('transparency.delete.title')}
        body={t('transparency.delete.lede')}
        onPress={() => router.push('/transparency-delete')}
      />
      {/* Contact preferences is a LINK, not a screen of its own. The mockup drew one, but
          notification-preferences.tsx already writes exactly these settings against the real §19.4
          event catalog — a second surface would be two ways to change one thing (ADR-084). */}
      <NavCard
        testID="transparency-preferences"
        icon="tune"
        title={t('transparency.portal.preferences.title')}
        body={t('transparency.portal.preferences.body')}
        onPress={() => router.push('/notification-preferences')}
      />

      <SectionLabel>{t('transparency.portal.technical')}</SectionLabel>
      {TECHNICAL.map((r) => (
        <NavCard
          key={r.key}
          testID={`transparency-tech-${r.key}`}
          icon={r.icon}
          title={t(`transparency.portal.tech.${r.key}.title`)}
          body={t(`transparency.portal.tech.${r.key}.body`)}
          onPress={() => router.push(r.route)}
        />
      ))}
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
    summaryRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
    summaryFlex: { flex: 1 },
    summaryLabel: {
      color: p.muted,
      fontFamily: fontFamily.semibold,
      fontSize: 11,
      letterSpacing: 1,
      textTransform: 'uppercase',
    },
    summaryValue: {
      color: p.text,
      fontFamily: fontFamily.bold,
      fontSize: typography.hero.fontSize,
      lineHeight: typography.hero.lineHeight,
    },
    summaryNote: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight * 1.15,
    },
  });
