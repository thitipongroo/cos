// Transparency Portal — Equipment sensors (mockup 05_00_iot_telemetry_details_mobile).
//
// EVERY row here is Planned, and the screen says so before anything else. IoT ingestion is Phase
// 21/24 work (EMQX → ingestion worker → Kafka → TimescaleDB); Stage 1 has no broker, no ingestion
// worker and no device registry, so nothing described below is collected today.
//
// Dropped from the mockup: "Active Node: IoT-Bangkok-Alpha", "1,428 Online Devices", "99.98%
// Uptime". Those are live-looking figures for a subsystem that does not exist — the single worst
// thing to put on a privacy screen, because a reader has no way to tell them from the real numbers
// elsewhere in the portal.

import { ScrollView, StyleSheet } from 'react-native';
import { useT } from '../../i18n';
import { usePalette } from '../../theme/usePalette';
import { spacing } from '../../theme/tokens';
import { SectionLabel, Lede, InfoCard } from '../../components/TransparencyKit';

const CAPABILITIES = [
  { key: 'location', icon: 'place' },
  { key: 'health', icon: 'precision-manufacturing' },
  { key: 'environment', icon: 'thermostat' },
] as const;

export default function TransparencyIotScreen(): React.JSX.Element {
  const t = useT();
  const pal = usePalette();

  return (
    <ScrollView
      testID="transparency-iot"
      style={{ backgroundColor: pal.bg }}
      contentContainerStyle={styles.content}
    >
      <Lede>{t('transparency.iot.lede')}</Lede>

      <SectionLabel>{t('transparency.iot.planned')}</SectionLabel>
      {CAPABILITIES.map((c) => (
        <InfoCard
          key={c.key}
          testID={`iot-cap-${c.key}`}
          icon={c.icon}
          tint={pal.muted}
          title={t(`transparency.iot.cap.${c.key}.title`)}
          body={t(`transparency.iot.cap.${c.key}.body`)}
          status="planned"
          statusLabel={t('transparency.status.planned')}
        />
      ))}

      <SectionLabel>{t('transparency.iot.note')}</SectionLabel>
      <InfoCard
        icon="info"
        title={t('transparency.iot.note')}
        body={t('transparency.iot.noteBody')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
});
