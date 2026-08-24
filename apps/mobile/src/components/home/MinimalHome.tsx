import { View } from 'react-native';
import { usePendingCount } from '../../hooks/usePendingCount';
import { useT } from '../../i18n';
import { useHomeStyles, KpiCard, Screen } from './HomeKit';

// ── minimal landing for roles whose Home is not enumerated in master ──────────
export default function MinimalHome() {
  const styles = useHomeStyles();
  const pending = usePendingCount();
  const t = useT();
  return (
    <Screen testID="home-screen">
      <View style={styles.kpiRow}>
        <KpiCard
          testID="pending-sync-count"
          value={String(pending)}
          label={t('home.main.pendingSync')}
        />
      </View>
    </Screen>
  );
}
