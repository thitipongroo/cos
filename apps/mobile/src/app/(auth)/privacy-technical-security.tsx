// Privacy Policy → Technical Security (mockup/mobile/01_authen/03_privacy_policy/04_technical_security).
//
// The three Core Protection cards restate controls the policy already names
// (`privacy.policy.sections.security.controls.*`) and every one of them is spec-backed: AES-256 at
// rest and TLS 1.3 minimum (QM-4 / spec §5.2), Cloudflare WAF with origin protection on cloud
// deployments (§5.5 + §8.7), and PostgreSQL RLS as the primary tenant-isolation mechanism (§7.7).
// The tags under each card are the drawing's own chips.
//
// TWO THINGS THE DRAWING SHOWS THAT THIS SCREEN DOES NOT:
//   - a pulsing "Status: Hardened" live indicator. There is no public health endpoint, and a
//     pre-auth screen has no session to query one with; a dot that is hard-coded green is worse than
//     no dot. The region — which IS a fixed, published fact (GLOB-001) — is stated as text instead,
//     and the live-status card carries COMING SOON.
//   - "ISO 27001 COMPLIANT" / "SOC 2 TYPE II" footer chips. Neither certificate is held; rather than
//     print the claim twice, the status lives once on the PDPA & GDPR screen and the footnote here
//     points at it. A heading is stated once (§32.7, 2026-08-06).
//
// The drawing's header reads "TECHINICAL SECURITY". That is a typo in the drawing; the title here is
// the policy section's own name, which is what the accordion row that pushes this screen says.

import { PrivacyDetailScreen } from '../../components/PrivacyDetailScreen';
import type { PrivacyDetailSection } from '../../components/PrivacyDetailScreen';

const SECTIONS: readonly PrivacyDetailSection[] = [
  {
    id: 'core',
    cards: [
      { id: 'encryption', icon: 'enhanced-encryption', tags: ['aes256', 'atRest'] },
      { id: 'networkGuard', icon: 'router', tags: ['waf', 'tls13'] },
      { id: 'tenantIsolation', icon: 'dns', tags: ['rls', 'postgres'] },
    ],
  },
  {
    id: 'infrastructure',
    cards: [
      { id: 'region', icon: 'storage' },
      { id: 'liveStatus', icon: 'monitor-heart', tone: 'warning', status: 'comingSoon' },
    ],
  },
];

export default function PrivacyTechnicalSecurityScreen(): React.JSX.Element {
  return (
    <PrivacyDetailScreen
      testID="privacy-technical-security"
      screen="technicalSecurity"
      sections={SECTIONS}
      footnote
    />
  );
}
