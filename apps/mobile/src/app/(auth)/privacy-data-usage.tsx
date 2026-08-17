// Privacy Policy → Data Usage (mockup/mobile/01_authen/05_privacy_policy/03_data_usage).
//
// The drawing's fourth tile says the data trains "ConstructSafe" AI models. Two things are wrong with
// that as shipped copy and both are fixed here rather than reproduced: the product is Construction
// OS, and model training is Phase 23 — the five §22.6 models each carry a data threshold that Stage 1
// has not reached (90 days, 10,000 photos, 6 months, 50 projects), so nothing is being trained on
// anyone's data today. It is kept as a card and marked COMING SOON per the product-owner decision of
// 2026-08-17, under a heading that says the same thing.
//
// The live group's wording stays inside what the vetted policy already states: analytics run on
// aggregated figures and pseudonymous identifiers, and personal data is removed before any text
// reaches an AI model (`privacy.policy.sections.usage.quote`). Nothing here widens that.

import { PrivacyDetailScreen } from '../../components/PrivacyDetailScreen';
import type { PrivacyDetailSection } from '../../components/PrivacyDetailScreen';

const SECTIONS: readonly PrivacyDetailSection[] = [
  {
    id: 'today',
    cards: [
      { id: 'safety', icon: 'security' },
      { id: 'efficiency', icon: 'speed' },
      { id: 'compliance', icon: 'gavel' },
    ],
  },
  {
    id: 'planned',
    cards: [{ id: 'aiTraining', icon: 'memory', tone: 'warning', status: 'comingSoon' }],
  },
];

export default function PrivacyDataUsageScreen(): React.JSX.Element {
  return (
    <PrivacyDetailScreen
      testID="privacy-data-usage"
      screen="dataUsage"
      sections={SECTIONS}
      footnote
    />
  );
}
