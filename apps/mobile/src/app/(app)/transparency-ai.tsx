// Transparency Portal — Automated processing (mockup 06_ai_logic_ocr_details_mobile).
//
// Split by what actually runs. OCR via AWS Textract and LLM report drafting are resolved decisions
// with code behind them (spec §22.6, services/ai-gateway); PPE detection and photo-vs-design
// comparison are the Phase 23 SafetyVisionModel stub — it needs 10,000+ labelled site photos before
// it can even be trained — and the BIM integration extension point. Those two carry the Planned pill.
//
// Dropped from the mockup: "Active Model: ConStruct-V4.2", "LATENCY 142ms", "ACCURACY 99.8%". No
// such model exists and neither figure is measured anywhere.
//
// The safeguards are the ones the platform genuinely enforces: PII is stripped before text reaches
// a language model (data-flow-map §6), output is advisory rather than autonomous (master §Phase 12
// "All AI outputs are advisory"), and low-confidence output is withheld by the HallucinationGuard
// rather than shown as fact.

import { ScrollView, StyleSheet } from 'react-native';
import { useT } from '../../i18n';
import { usePalette } from '../../theme/usePalette';
import { spacing } from '../../theme/tokens';
import { SectionLabel, Lede, InfoCard } from '../../components/TransparencyKit';

const IN_USE = [
  { key: 'ocr', icon: 'document-scanner' },
  { key: 'summary', icon: 'auto-awesome' },
] as const;

const PLANNED = [
  { key: 'ppe', icon: 'engineering' },
  { key: 'progress', icon: 'compare' },
] as const;

const SAFEGUARDS = [
  { key: 'strip', icon: 'visibility-off' },
  { key: 'advisory', icon: 'how-to-reg' },
  { key: 'confidence', icon: 'rule' },
] as const;

export default function TransparencyAiScreen(): React.JSX.Element {
  const t = useT();
  const pal = usePalette();

  return (
    <ScrollView
      testID="transparency-ai"
      style={{ backgroundColor: pal.bg }}
      contentContainerStyle={styles.content}
    >
      <Lede>{t('transparency.ai.lede')}</Lede>

      <SectionLabel>{t('transparency.ai.inuse')}</SectionLabel>
      {IN_USE.map((c) => (
        <InfoCard
          key={c.key}
          testID={`ai-cap-${c.key}`}
          icon={c.icon}
          title={t(`transparency.ai.cap.${c.key}.title`)}
          body={t(`transparency.ai.cap.${c.key}.body`)}
          status="live"
          statusLabel={t('transparency.status.live')}
        />
      ))}

      <SectionLabel>{t('transparency.ai.plannedHeading')}</SectionLabel>
      {PLANNED.map((c) => (
        <InfoCard
          key={c.key}
          testID={`ai-cap-${c.key}`}
          icon={c.icon}
          tint={pal.muted}
          title={t(`transparency.ai.cap.${c.key}.title`)}
          body={t(`transparency.ai.cap.${c.key}.body`)}
          status="planned"
          statusLabel={t('transparency.status.planned')}
        />
      ))}

      <SectionLabel>{t('transparency.ai.safeguards')}</SectionLabel>
      {SAFEGUARDS.map((s) => (
        <InfoCard
          key={s.key}
          testID={`ai-safeguard-${s.key}`}
          icon={s.icon}
          title={t(`transparency.ai.safeguard.${s.key}.title`)}
          body={t(`transparency.ai.safeguard.${s.key}.body`)}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: { padding: spacing.md, gap: spacing.sm, paddingBottom: spacing.xl },
});
