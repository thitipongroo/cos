// Privacy Policy → Data Collection (mockup/mobile/01_authen/05_privacy_policy/02_data_collection).
//
// Pushed from the Data Collection row on (auth)/privacy-policy. Pre-auth only: every Transparency
// Portal screen sits behind AuthGate and one of them renders the signed-in reader's OWN record, so a
// pre-auth reader has nowhere deeper to go — this screen is the general notice, not the record.
//
// TWO GROUPS, AND THE SPLIT IS THE POINT (product-owner decision 2026-08-17). The drawing lists five
// collection categories as though all five were live. Three of them are not: nothing in this repo
// geofences anyone (the only `geofence` hits in the whole spec set are context/00_master:1231, which
// says outright that this platform does not have one, and a GEOFENCE_BREACH *equipment* telemetry
// event type in the Phase 21 IoT stub), no IoT telemetry is ingested at Stage 1, and OCR runs
// server-side in services/ai-ocr-pipeline — there is no tflite/onnx/coreml anywhere in apps/mobile.
// The PO decision was to keep the drawing's content and mark whatever has no code behind it, so the
// three planned items are grouped under their own heading AND carry a COMING SOON chip. On a PDPA
// §23 notice the difference between "we collect this" and "we intend to" is the whole document, so it
// is carried twice rather than once.
//
// The live group's copy is the vetted policy text, not the drawing's: `nationalId`, biometric
// identifiers and dates of birth were removed from this notice on 2026-08-03 after checking
// backend/prisma/migrations/ — no such column exists, and claiming collection would be a false
// statement on a compliance notice.

import { PrivacyDetailScreen } from '../../components/PrivacyDetailScreen';
import type { PrivacyDetailSection } from '../../components/PrivacyDetailScreen';

const SECTIONS: readonly PrivacyDetailSection[] = [
  {
    id: 'collected',
    cards: [
      { id: 'identity', icon: 'badge' },
      { id: 'location', icon: 'location-on' },
      { id: 'technicalLogs', icon: 'terminal' },
      { id: 'aiOcr', icon: 'document-scanner' },
    ],
  },
  {
    id: 'planned',
    cards: [
      { id: 'geofencing', icon: 'my-location', tone: 'warning', status: 'comingSoon' },
      { id: 'iot', icon: 'sensors', tone: 'warning', status: 'comingSoon' },
      { id: 'onDeviceAi', icon: 'memory', tone: 'warning', status: 'comingSoon' },
    ],
  },
];

export default function PrivacyDataCollectionScreen(): React.JSX.Element {
  return (
    <PrivacyDetailScreen
      testID="privacy-data-collection"
      screen="dataCollection"
      sections={SECTIONS}
      footnote
    />
  );
}
