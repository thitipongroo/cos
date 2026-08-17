// Privacy Policy → User Rights (mockup/mobile/01_authen/03_privacy_policy/05_user_rights).
//
// The four rights are the drawing's, and all four are exercisable rather than aspirational: PDPA §30
// access and §31 portability are served by the data-export endpoints behind
// `s1.identity.data-export` (ADR-078, at 100% since 2026-08-05), and erasure is anonymisation in
// place (QM-5 / ADR-090 §5) rather than a cascade delete. Rectification is the one the drawing adds
// over the policy's own list, which names restriction instead; both are real PDPA rights and the
// route to either is the same request to the DPO, so the drawing's set is kept.
//
// The CTA is `dismissAll()`, not a push to /login. This screen is the third card of a stack that
// STARTED at login (login → privacy-policy → here), so pushing login again would stack a second copy
// behind the first and leave Back walking through a duplicate. dismissAll pops to the stack's first
// screen, which is the login the reader came from.
//
// No account exists yet here, so the screen states where the rights are exercised rather than
// offering a control that would do nothing pre-auth.

import { useRouter } from 'expo-router';
import { PrivacyDetailScreen } from '../../components/PrivacyDetailScreen';
import type { PrivacyDetailSection } from '../../components/PrivacyDetailScreen';

const SECTIONS: readonly PrivacyDetailSection[] = [
  {
    id: 'rights',
    cards: [
      { id: 'access', icon: 'visibility' },
      { id: 'rectification', icon: 'edit' },
      { id: 'portability', icon: 'drive-file-move' },
      { id: 'erasure', icon: 'delete-forever', tone: 'warning' },
    ],
  },
];

export default function PrivacyUserRightsScreen(): React.JSX.Element {
  const router = useRouter();

  return (
    <PrivacyDetailScreen
      testID="privacy-user-rights"
      screen="userRights"
      heroIcon="shield"
      sections={SECTIONS}
      footnote
      cta={{ icon: 'login', onPress: () => router.dismissAll() }}
    />
  );
}
