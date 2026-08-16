// Transparency Portal — hub (mockup 01_data_collection/00_data_collection_detail, withdrawn
// 2026-08-15 with the whole `01_data_collection/**` set — ~114 drawings; ADR-085 leaves this screen
// and its committed capture standing. See TransparencyKit.tsx's header for the full note).
//
// Reached from drawer → PRIVACY POLICY → the policy's Data Collection card (PO decision 2026-08-04;
// the push lives in privacy-policy.tsx). It was Profile → Transparency Portal at first; both halves
// of that path are gone — Profile is no longer a tab, and the portal row was removed from it.
// It lives in (app), not beside the pre-auth Privacy Policy where the mockups sit, because every
// screen below it describes — and one of them shows — the signed-in user's own record; AuthGate
// would bounce a pre-auth route before any of it loads.
//
// STRUCTURE DEVIATES FROM THE MOCKUP AND STAYS THAT WAY (ADR-085, PO decision 2026-08-06). The
// mockup builds "Compliance Breakdown" from accordion items that expand in place; these are
// navigation rows into a detail screen. The accordion exists in the mockup to hold a biometric hash,
// a 500m geofencing radius, an employee ID and a "real-time" sync frequency — not one of which this
// platform has (geofencing is refuted by ADR-080 and migration 20260705000001). The content that IS
// real already has thirteen screens of its own, so an accordion here would either duplicate them or
// expand to a summary that still needs a tap.
//
// Content is the corrected set, not the mockup's. The mockup's summary tile claimed "12 Data
// Categories", a global "5 Year Retention" and a biometric hash; none of those are true. The count
// here is the number of distinct @pdpa categories actually tagged in the schema by migration
// 20260803000001_tag_pii_columns (identity, contact, location, financial, operational = 5), and
// retention is described as per-record-type because that is what data-retention-policy.md defines.

import { ScrollView, Text, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useT } from '../../i18n';
import { usePalette } from '../../theme/usePalette';
import { fontFamily, spacing, typography } from '../../theme/tokens';
import type { Palette } from '../../theme/palette';
import {
  SectionLabel,
  NavCard,
  InfoCard,
  HeroCard,
  DashedPanel,
  DangerLink,
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
      {/* The mockup opens with a hero panel — eyebrow, badge, big count, one line of body — and the
          screen reads better for it than the flat tile that was here. What the panel SAYS is the
          corrected set: 5 categories rather than 12, and the encryption line names the two things
          the platform actually does instead of "AES-256 Multi-layer", which is not a real mode. */}
      <HeroCard
        testID="transparency-count"
        icon="verified-user"
        eyebrow={t('transparency.portal.summaryLabel')}
        badge={t('transparency.status.live')}
        title={t('transparency.portal.summaryValue')}
        body={t('transparency.portal.summaryNote')}
      />

      {/* No lede paragraph. The mockup goes straight from the hero to the breakdown, and the
          sentence that used to sit here was written for the first implementation (commit dc2fc8a)
          rather than taken from the design — a grep of mockup/ does not find it. What it needed to
          say (how many categories, and that Planned rows collect nothing) is already in the hero
          body and on the Planned pills themselves. */}
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

      {/* No `title` — the SectionLabel above already says it (see InfoCard). */}
      <SectionLabel>{t('transparency.portal.rights')}</SectionLabel>
      <InfoCard icon="gavel" body={t('transparency.portal.rightsBody')} />
      {/* Export is no longer a DisabledAction. PDPA-10/11 shipped (ADR-078), so the row that used
          to say "coming soon" now goes somewhere. */}
      <NavCard
        testID="transparency-export"
        icon="download"
        title={t('dataExport.title')}
        body={t('transparency.portal.exportBody')}
        onPress={() => router.push('/data-export')}
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

      {/* The mockup closes on a dashed retention panel with a red deletion link, and that shape is
          worth keeping — it reads as the end of the document and gives erasure a deliberate place
          rather than a row in a list.
          What it CANNOT say is the mockup's "Active Project Data: 5 Year Retention". There is no
          single retention period: check-in coordinates reduce to a daily count after 90 days,
          worker records anonymise two years after employment ends, and site reports are kept for the
          project's life plus seven years under accounting law (data-retention-policy.md). The panel
          states that instead, and the link goes to the erasure screen — which exists. */}
      <DashedPanel
        testID="transparency-retention"
        icon="policy"
        title={t('transparency.portal.retention')}
      >
        <Text style={styles.dashedBody}>{t('transparency.portal.retentionBody')}</Text>
        <DangerLink
          testID="transparency-cat-delete"
          icon="delete-outline"
          label={t('transparency.portal.requestDeletion')}
          onPress={() => router.push('/transparency-delete')}
        />
      </DashedPanel>
    </ScrollView>
  );
}

const makeStyles = (p: Palette) =>
  StyleSheet.create({
    content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
    dashedBody: {
      color: p.muted,
      fontFamily: fontFamily.regular,
      fontSize: typography.label.fontSize,
      lineHeight: typography.label.lineHeight * 1.15,
      textAlign: 'center',
    },
  });
