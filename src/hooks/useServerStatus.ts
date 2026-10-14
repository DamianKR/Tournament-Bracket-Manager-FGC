import { useEffect, useRef, useSyncExternalStore } from 'react';
import { getServerStatus, subscribeServerStatus, type ServerStatus } from '@/services/api/serverStatus';
import { isServerAvailable } from '@/services/api/apiClient';

/** Reactive "can we reach the API?" state. Pings once if nothing is known yet. */
export function useServerStatus(): ServerStatus {
  const status = useSyncExternalStore(subscribeServerStatus, getServerStatus);
  useEffect(() => {
    if (status === 'unknown') void isServerAvailable();
  }, [status]);
  return status;
}

export function useServerOffline(): boolean {
  return useServerStatus() === 'offline';
}

/** Runs `cb` every time the server goes from unreachable back to reachable. */
export function useOnReconnect(cb: () => void): void {
  const status = useServerStatus();
  const prev = useRef(status);
  const latest = useRef(cb);
  latest.current = cb;
  useEffect(() => {
    if (prev.current === 'offline' && status === 'online') latest.current();
    prev.current = status;
  }, [status]);
}
