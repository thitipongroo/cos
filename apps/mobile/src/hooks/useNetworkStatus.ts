// useNetworkStatus — @react-native-community/netinfo integration
// Returns isOnline boolean and connection type.
// Used by OfflineBanner, DeltaSyncClient, and SyncManager.

import { useState, useEffect } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';
import { getForcedOnline, subscribeNetworkOverride } from '../lib/e2e/networkOverride';

interface NetworkStatus {
  isOnline: boolean;
  connectionType: string | null;
}

function fromNetInfo(state: NetInfoState): NetworkStatus {
  return {
    isOnline: state.isConnected === true && state.isInternetReachable !== false,
    connectionType: state.type,
  };
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: true, // optimistic default — corrected on first event
    connectionType: null,
  });

  useEffect(() => {
    // E2E override wins when set (no-op/null in production — see lib/e2e/networkOverride).
    const applyForced = (): boolean => {
      const forced = getForcedOnline();
      if (forced === null) return false;
      setStatus({ isOnline: forced, connectionType: forced ? 'e2e' : 'none' });
      return true;
    };

    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      if (applyForced()) return;
      setStatus(fromNetInfo(state));
    });

    // Fetch current state immediately on mount
    NetInfo.fetch().then((state) => {
      if (applyForced()) return;
      setStatus(fromNetInfo(state));
    });

    // React to E2E override changes; on clear, fall back to the real network state.
    const unsubscribeOverride = subscribeNetworkOverride(() => {
      if (applyForced()) return;
      NetInfo.fetch().then((state) => setStatus(fromNetInfo(state)));
    });

    return () => {
      unsubscribe();
      unsubscribeOverride();
    };
  }, []);

  return status;
}
