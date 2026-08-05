// Transparency Portal — Request timestamps (mockup 03_06_request_timestamp_details, per ADR-084).
//
// The mockup made four technical claims about this platform's timekeeping. A grep across the whole
// of docs/ for `NTP`, `Stratum`, `atomic clock` and `latency compensation` returns zero matches, so
// ADR-084 removed them rather than softening the wording — there is no phrasing of an unimplemented
// guarantee that makes it true, and a transparency screen is the worst possible place to first
// assert an operational control the reader has no way to check.
//
// What is left is four things that hold, and the least impressive-sounding of them is the strongest:
// audit entries are append-only because `app_user` holds no DELETE grant on platform.audit_logs
// (§11.4). A reader can go and verify that. "Cryptographically hashed timestamps", the claim it
// replaces, could not be verified and was not true.

import { ScrollView, StyleSheet } from 'react-native';
import { useT } from '../../i18n';
import { usePalette } from '../../theme/usePalette';
import { spacing } from '../../theme/tokens';
import { InfoCard, Lede, SectionLabel } from '../../components/TransparencyKit';
import {
  AUDIT_RETENTION_WORM_YEARS,
  LOG_RETENTION_COLD_YEARS,
  LOG_RETENTION_HOT_DAYS,
  TIMESTAMP_FACTS,
} from '../../lib/sessionFacts';

const FACT_ICONS = {
  utc: 'public',
  precision: 'schedule',
  appendOnly: 'lock',
  retention: 'inventory-2',
} as const;

export default function TransparencyTimestampsScreen(): React.JSX.Element {
  const t = useT();
  const pal = usePalette();

  return (
    <ScrollView
      testID="transparency-timestamps"
      style={{ backgroundColor: pal.bg }}
      contentContainerStyle={styles.content}
    >
      <Lede>{t('transparency.timestamps.lede')}</Lede>

      <SectionLabel>{t('transparency.timestamps.how')}</SectionLabel>
      {TIMESTAMP_FACTS.map((key) => (
        <InfoCard
          key={key}
          testID={`timestamp-fact-${key}`}
          icon={FACT_ICONS[key]}
          title={t(`transparency.timestamps.fact.${key}.title`)}
          // The retention numbers are interpolated from the same constants the session screen uses,
          // so the two screens cannot drift apart on a figure both of them quote.
          body={t(`transparency.timestamps.fact.${key}.body`, {
            hot: String(LOG_RETENTION_HOT_DAYS),
            cold: String(LOG_RETENTION_COLD_YEARS),
            worm: String(AUDIT_RETENTION_WORM_YEARS),
          })}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
});
