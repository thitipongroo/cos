// SyncPill — compact sync-status glyph for the Tenant Admin top bar (mockup 01_home_dashboard's "SYNCED"
// indicator). Icon-only (no label, no chip background) so it stays balanced beside the brand and the
// bell/avatar. Same status source as the full-width SyncStatusBar (which the dark-shell dashboards
// drop): green check_circle when idle + empty (§6.1 --mobile-synced #00C853), gold sync while syncing,
// amber cloud_upload with a pending queue, red sync_problem on error. The GLYPH SHAPE carries the state
// (colour is never the only signal, §32.7) and the accessibilityLabel announces it for screen readers.
// NB: 01_home_dashboard drew a gold "SYNCED", but gold is the SYNCING token (§6.1); synced is green (as
// 02_quick_action_button/01_quick_action_menu correctly shows).

import { MaterialIcons } from '@expo/vector-icons';
import { useSyncPillView } from '../hooks/useSyncPillView';

export function SyncPill(): React.JSX.Element {
  // `cloud-done`, not `check-circle` (product-owner decision 2026-08-06). The drawer already drew
  // synced this way, and two glyphs for one state taught the holder that the tick and the cloud
  // meant different things. A cloud also says WHERE the work is — on the server — which is the
  // question a check mark leaves open. The four states and their precedence come from the hook.
  const view = useSyncPillView('cloud-done');

  return (
    <MaterialIcons
      name={view.icon}
      size={16}
      color={view.color}
      testID="sync-pill"
      accessibilityLabel={view.label}
    />
  );
}
