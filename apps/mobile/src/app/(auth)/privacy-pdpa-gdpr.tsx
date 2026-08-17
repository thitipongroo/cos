// Privacy Policy → PDPA & GDPR (mockup/mobile/01_authen/05_privacy_policy/04_pdpa_gdpr).
//
// THE CERTIFICATION ROW IS THE REASON THIS FILE HAS A LONG COMMENT. The drawing stamps
// "ISO/IEC 27001:2022 — ACTIVE" and "SOC 2 Type II — ACTIVE". Neither is held:
// docs/specifications/05-security-compliance.md §5.3 records SOC 2 as due 6 months before the
// Stage 1→2 transition and ISO 27001 6 months before Stage 2→3, and .cos-stage reads 1. Printing
// ACTIVE would be a false assurance on the screen a data subject reads before consenting, so the
// rows keep the drawing's shape and carry COMING SOON with the target stage in the body
// (product-owner decision 2026-08-17). Certification is an audit outcome, not code — this row cannot
// be "built"; it can only be reported accurately until the certificate exists.
//
// Data residency IS live and is stated plainly: GLOB-001 / spec §8.8 put the primary region at
// ap-southeast-7 (Bangkok) with ap-southeast-1 (Singapore) as DR, and `platform.tenants.data_region`
// carries it per tenant. The drawing's pulsing "live" dot is not reproduced — it implies a health
// feed, and there is no public endpoint behind it (see the Technical Security screen's note).

import { PrivacyDetailScreen } from '../../components/PrivacyDetailScreen';
import type { PrivacyDetailSection } from '../../components/PrivacyDetailScreen';

const SECTIONS: readonly PrivacyDetailSection[] = [
  {
    id: 'principles',
    cards: [
      { id: 'sovereignty', icon: 'gpp-good' },
      { id: 'integrity', icon: 'enhanced-encryption' },
      { id: 'purpose', icon: 'rule' },
    ],
  },
  {
    id: 'regional',
    cards: [
      { id: 'thaiPdpa', icon: 'verified', tone: 'success' },
      { id: 'euGdpr', icon: 'verified-user', tone: 'success' },
    ],
  },
  {
    id: 'residency',
    cards: [{ id: 'region', icon: 'public' }],
  },
  {
    id: 'certifications',
    cards: [
      { id: 'iso27001', icon: 'military-tech', tone: 'warning', status: 'comingSoon' },
      { id: 'soc2', icon: 'workspace-premium', tone: 'warning', status: 'comingSoon' },
    ],
  },
];

export default function PrivacyPdpaGdprScreen(): React.JSX.Element {
  return (
    <PrivacyDetailScreen
      testID="privacy-pdpa-gdpr"
      screen="pdpaGdpr"
      sections={SECTIONS}
      footnote
    />
  );
}
