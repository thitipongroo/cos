// useNetworkStatus — @react-native-community/netinfo integration
// Returns isOnline boolean and connection type.
// Used by OfflineBanner, DeltaSyncClient, and SyncManager.

import { useState, useEffect } from 'react';
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

interface NetworkStatus {
  isOnline: boolean;
  connectionType: string | null;
}

export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({
    isOnline: true, // optimistic default — corrected on first event
    connectionType: null,
  });

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      setStatus({
        isOnline: state.isConnected === true && state.isInternetReachable !== false,
        connectionType: state.type,
      });
    });

    // Fetch current state immediately on mount
    NetInfo.fetch().then((state) => {
      setStatus({
        isOnline: state.isConnected === true && state.isInternetReachable !== false,
        connectionType: state.type,
      });
    });

    return unsubscribe;
  }, []);

  return status;
}
