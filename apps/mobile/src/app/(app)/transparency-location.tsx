// Transparency Portal — Site & location (mockup 02_site_gps_privacy_details).
//
// Corrected against migration 20260705000001_geo_coordinates, which is the whole truth about GPS in
// this platform: it adds nullable latitude/longitude to FIVE tables — workforce_telemetry
// .attendance_logs, site_ops.site_reports, .issues, .incidents and .inspections. There is no
// background location service, so the mockup's "monitoring is active only within geofenced
// boundaries and during authorized working hours" describes a control that does not exist; the
// honest framing is that coordinates are attached per saved record and are optional on all of them.
//
// Also corrected: the mockup's pipeline shows an "Anonymization Layer" and claims "PII Masking —
// personal identities removed from logs". Neither exists (pdpa-controls PDPA-45 is OPEN). What the
// pipeline really has that is worth telling a user is the reverse-geocode step, which runs against
// a SELF-HOSTED Nominatim container (backend/src/modules/geo/geo.service.ts + docker-compose.yml) —
// coordinates never reach a third-party mapping provider.

import { ScrollView, StyleSheet } from 'react-native';
import { useT } from '../../i18n';
import { spacing } from '../../theme/tokens';
import { SectionLabel, Lede, InfoCard, FlowStep } from '../../components/TransparencyKit';

/** The five record types that can carry a coordinate. */
const RECORDS = [
  { key: 'attendance', icon: 'how-to-reg' },
  { key: 'reports', icon: 'description' },
  { key: 'issues', icon: 'report-problem' },
  { key: 'incidents', icon: 'health-and-safety' },
  { key: 'inspections', icon: 'fact-check' },
] as const;

const FLOW = [
  { key: 'capture', icon: 'my-location' },
  { key: 'transit', icon: 'lock' },
  { key: 'geocode', icon: 'place' },
  { key: 'store', icon: 'storage' },
] as const;

/** `geofence` is the one Planned row — the rest are verifiable today. */
const SAFEGUARDS = [
  { key: 'optional', icon: 'check-circle-outline', status: 'live' },
  { key: 'noTracking', icon: 'location-off', status: 'live' },
  { key: 'purge', icon: 'auto-delete', status: 'live' },
  { key: 'geofence', icon: 'fence', status: 'planned' },
] as const;

export default function TransparencyLocationScreen(): React.JSX.Element {
  const t = useT();

  return (
    <ScrollView testID="transparency-location" contentContainerStyle={styles.content}>
      <Lede>{t('transparency.location.lede')}</Lede>

      <SectionLabel>{t('transparency.location.where')}</SectionLabel>
      <InfoCard
        icon="place"
        title={t('transparency.location.where')}
        body={t('transparency.location.whereBody')}
      />
      {RECORDS.map((r) => (
        <InfoCard
          key={r.key}
          testID={`location-rec-${r.key}`}
          icon={r.icon}
          title={t(`transparency.location.rec.${r.key}.title`)}
          body={t(`transparency.location.rec.${r.key}.body`)}
        />
      ))}

      <SectionLabel>{t('transparency.location.pipeline')}</SectionLabel>
      {FLOW.map((f, i) => (
        <FlowStep
          key={f.key}
          icon={f.icon}
          title={t(`transparency.location.flow.${f.key}.title`)}
          caption={t(`transparency.location.flow.${f.key}.caption`)}
          last={i === FLOW.length - 1}
        />
      ))}

      <SectionLabel>{t('transparency.location.safeguards')}</SectionLabel>
      {SAFEGUARDS.map((s) => (
        <InfoCard
          key={s.key}
          testID={`location-safeguard-${s.key}`}
          icon={s.icon}
          title={t(`transparency.location.safeguard.${s.key}.title`)}
          body={t(`transparency.location.safeguard.${s.key}.body`)}
          status={s.status}
          statusLabel={t(`transparency.status.${s.status}`)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
});
