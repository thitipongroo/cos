// Transparency Portal — What you enter (mockup 04_00_manual_input_details_mobile).
//
// The mockup is a DESKTOP layout — it carries `md:` breakpoints and an ADMIN_CONSOLE side nav —
// despite sitting in the mobile folder. Rendered here as a phone screen to match the rest of the
// portal and the app it lives in (PO decision 2026-08-04); the side nav has no counterpart in the
// React Native shell, which uses the role's bottom nav.
//
// The channels are the real ones: site_ops.site_reports, .incidents, .inspections, .issues and
// .material_consumptions all exist as tables. The mockup's "Schema_v4.2", "LVL_3_WITNESS" and
// "24H_CYCLE" tags are dropped — invented identifiers with nothing behind them.

import { ScrollView, StyleSheet } from 'react-native';
import { useT } from '../../i18n';
import { usePalette } from '../../theme/usePalette';
import { spacing } from '../../theme/tokens';
import { SectionLabel, Lede, InfoCard } from '../../components/TransparencyKit';

const CHANNELS = [
  { key: 'reports', icon: 'description' },
  { key: 'incidents', icon: 'health-and-safety' },
  { key: 'inspections', icon: 'fact-check' },
  { key: 'issues', icon: 'report-problem' },
  { key: 'materials', icon: 'inventory' },
] as const;

const RULES = [
  { key: 'attribution', icon: 'person-pin' },
  { key: 'offline', icon: 'cloud-off' },
  { key: 'immutable', icon: 'history' },
] as const;

export default function TransparencyManualScreen(): React.JSX.Element {
  const t = useT();
  const pal = usePalette();

  return (
    <ScrollView
      testID="transparency-manual"
      style={{ backgroundColor: pal.bg }}
      contentContainerStyle={styles.content}
    >
      <Lede>{t('transparency.manual.lede')}</Lede>

      <SectionLabel>{t('transparency.manual.channels')}</SectionLabel>
      {CHANNELS.map((c) => (
        <InfoCard
          key={c.key}
          testID={`manual-ch-${c.key}`}
          icon={c.icon}
          title={t(`transparency.manual.ch.${c.key}.title`)}
          body={t(`transparency.manual.ch.${c.key}.body`)}
        />
      ))}

      <SectionLabel>{t('transparency.manual.rules')}</SectionLabel>
      {RULES.map((r) => (
        <InfoCard
          key={r.key}
          testID={`manual-rule-${r.key}`}
          icon={r.icon}
          title={t(`transparency.manual.rule.${r.key}.title`)}
          body={t(`transparency.manual.rule.${r.key}.body`)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
});
