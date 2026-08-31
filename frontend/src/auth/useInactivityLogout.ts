import { useEffect, useRef } from 'react';
import { useAuth } from './AuthContext';

const TIMEOUT_MINUTES = Number(import.meta.env.VITE_INACTIVITY_TIMEOUT_MINUTES ?? 20);
const ACTIVITY_EVENTS = ['mousemove', 'keydown', 'click', 'scroll', 'touchstart'] as const;

export function useInactivityLogout(enabled: boolean): void {
  const { logout } = useAuth();
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    if (!enabled) return;

    const resetTimer = () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        logout();
      }, TIMEOUT_MINUTES * 60 * 1000);
    };

    ACTIVITY_EVENTS.forEach((event) => window.addEventListener(event, resetTimer));
    resetTimer();

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
      ACTIVITY_EVENTS.forEach((event) => window.removeEventListener(event, resetTimer));
    };
  }, [enabled, logout]);
}
