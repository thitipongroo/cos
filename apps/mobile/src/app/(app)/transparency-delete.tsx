// Transparency Portal — Erasing your data (mockup 07_00_data_deletion_confirmation_mobile).
//
// The mockup is a confirmation dialog: type DELETE, press CONFIRM PERMANENT DELETION, and "All
// personal identity, site logs, and technical telemetry associated with your profile will be
// permanently removed." Two problems, both blocking:
//
//   1. There is no erasure endpoint. pdpa-controls PDPA-13 is OPEN and a grep over
//      backend/src/modules/identity finds no route. The mockup's button calls a JS alert.
//   2. The promise is one we must not keep. QM-5 requires anonymisation-in-place over cascade
//      delete, and data-retention-policy.md keeps site reports for the project's life plus seven
//      years under accounting law. Erasing "Daily Reports" on request would breach that duty;
//      showing a button that says we will is a false statement either way.
//
// So this screen explains what erasure actually does per record type, points at the Data Protection
// Office (the channel published in the Privacy Policy and the one PDPA-03 records as the live
// route), and renders the confirm control disabled (PO decision 2026-08-04: show it, disabled, with
// a coming-soon chip). The "type DELETE" field is dropped — a confirmation ritual for an action
// that cannot execute is theatre.

import { ScrollView, StyleSheet } from 'react-native';
import { useT } from '../../i18n';
import { usePalette } from '../../theme/usePalette';
import { spacing } from '../../theme/tokens';
import { SectionLabel, Lede, InfoCard, DisabledAction } from '../../components/TransparencyKit';

/** What erasure does per record type — 'erase' where we can, 'retain + anonymise' where law binds. */
const RECORDS = [
  { key: 'identity', icon: 'person-off', tone: 'success' },
  { key: 'location', icon: 'location-off', tone: 'success' },
  { key: 'reports', icon: 'description', tone: 'warning' },
  { key: 'audit', icon: 'gavel', tone: 'warning' },
] as const;

export default function TransparencyDeleteScreen(): React.JSX.Element {
  const t = useT();
  const pal = usePalette();

  return (
    <ScrollView
      testID="transparency-delete"
      style={{ backgroundColor: pal.bg }}
      contentContainerStyle={styles.content}
    >
      <Lede>{t('transparency.delete.lede')}</Lede>

      <SectionLabel>{t('transparency.delete.what')}</SectionLabel>
      {RECORDS.map((r) => (
        <InfoCard
          key={r.key}
          testID={`delete-rec-${r.key}`}
          icon={r.icon}
          tint={pal[r.tone]}
          title={t(`transparency.delete.rec.${r.key}.title`)}
          body={t(`transparency.delete.rec.${r.key}.body`)}
        />
      ))}

      <SectionLabel>{t('transparency.delete.why')}</SectionLabel>
      <InfoCard
        icon="balance"
        title={t('transparency.delete.why')}
        body={t('transparency.delete.whyBody')}
      />

      <SectionLabel>{t('transparency.delete.how')}</SectionLabel>
      <InfoCard
        icon="mail"
        title={t('transparency.delete.how')}
        body={t('transparency.delete.howBody')}
      />
      <DisabledAction
        testID="delete-request"
        icon="delete-forever"
        label={t('transparency.delete.action')}
        comingSoon={t('transparency.comingSoon')}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
});
