// Transparency Portal — Technical logs (mockup 03_00_technical_log_details_mobile).
//
// The collected items are the real columns of platform.audit_logs (schema.prisma): actor_id, action
// + resource_type/resource_id + occurred_at, ip_address and user_agent. The mockup's abstract
// "Session Metadata" row is dropped — no such field is stored.
//
// Stack corrections, both verified 2026-08-04:
//   - The mockup routes logs through "Graylog / Elasticsearch". Spec §31.2 makes LOKI the
//     authoritative log store and explicitly removed the alternative, so the pipeline step is
//     described generically ("log store") rather than naming a product we do not run.
//   - Kong Gateway IS correct (spec §4.8) and is kept.
// Retention follows docs/policies/log-retention-policy.md: 30 days hot, 1 year cold, audit
// entries 7 years in WORM storage — not the mockup's flat "1Y Hot / 7Y Cold".
//
// The automatic-redaction row is Planned on purpose: @cos/logger sets no pino `redact` option, so
// keeping PII out of logs is engineering practice, not an enforced control (pdpa-controls PDPA-45).

import { ScrollView, StyleSheet } from 'react-native';
import { useT } from '../../i18n';
import { usePalette } from '../../theme/usePalette';
import { spacing } from '../../theme/tokens';
import { SectionLabel, Lede, InfoCard, FlowStep } from '../../components/TransparencyKit';

const ITEMS = [
  { key: 'actor', icon: 'person' },
  { key: 'action', icon: 'bolt' },
  { key: 'ip', icon: 'lan' },
  { key: 'device', icon: 'devices' },
] as const;

const FLOW = [
  { key: 'app', icon: 'phone-android' },
  { key: 'gateway', icon: 'router' },
  { key: 'store', icon: 'storage' },
  { key: 'archive', icon: 'inventory-2' },
] as const;

export default function TransparencyLogsScreen(): React.JSX.Element {
  const t = useT();
  const pal = usePalette();

  return (
    <ScrollView
      testID="transparency-logs"
      style={{ backgroundColor: pal.bg }}
      contentContainerStyle={styles.content}
    >
      <Lede>{t('transparency.logs.lede')}</Lede>

      <SectionLabel>{t('transparency.logs.collected')}</SectionLabel>
      {ITEMS.map((i) => (
        <InfoCard
          key={i.key}
          testID={`logs-item-${i.key}`}
          icon={i.icon}
          title={t(`transparency.logs.item.${i.key}.title`)}
          body={t(`transparency.logs.item.${i.key}.body`)}
        />
      ))}

      <SectionLabel>{t('transparency.logs.path')}</SectionLabel>
      {FLOW.map((f, idx) => (
        <FlowStep
          key={f.key}
          icon={f.icon}
          title={t(`transparency.logs.flow.${f.key}.title`)}
          caption={t(`transparency.logs.flow.${f.key}.caption`)}
          last={idx === FLOW.length - 1}
        />
      ))}

      {/* No `title` — the SectionLabel above already says it (see InfoCard). The redaction card
          below KEEPS its title: it is a second card in the same section, not the section restated. */}
      <SectionLabel>{t('transparency.logs.retention')}</SectionLabel>
      <InfoCard icon="schedule" body={t('transparency.logs.retentionBody')} />
      <InfoCard
        testID="logs-redaction"
        icon="visibility-off"
        title={t('transparency.logs.redaction.title')}
        body={t('transparency.logs.redaction.body')}
        status="planned"
        statusLabel={t('transparency.status.planned')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
});
