import { useEffect, useRef } from 'react';

export function useWakeLock(active: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) return;

    let cancelled = false;
    let removeVisibilityListener: (() => void) | undefined;

    const request = async () => {
      if (!('wakeLock' in navigator)) {
        console.warn('Wake Lock API not supported');
        return;
      }
      try {
        const lock = await navigator.wakeLock.request('screen');
        if (cancelled) {
          await lock.release();
          return;
        }
        wakeLockRef.current = lock;

        const handleVisibility = async () => {
          if (document.visibilityState === 'visible' && !wakeLockRef.current) {
            try {
              wakeLockRef.current = await navigator.wakeLock.request('screen');
            } catch {}
          }
        };
        document.addEventListener('visibilitychange', handleVisibility);
        removeVisibilityListener = () =>
          document.removeEventListener('visibilitychange', handleVisibility);
      } catch (err) {
        console.warn('Wake Lock request failed:', err);
      }
    };

    request();

    return () => {
      cancelled = true;
      removeVisibilityListener?.();
      if (wakeLockRef.current) {
        wakeLockRef.current.release().catch(() => {});
        wakeLockRef.current = null;
      }
    };
  }, [active]);
}
