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
  const view = useSyncPillView();

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
