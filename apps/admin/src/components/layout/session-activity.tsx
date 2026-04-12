'use client';

import { useEffect, useRef } from 'react';

const REFRESH_INTERVAL = 5 * 60 * 1000;

export function SessionActivity() {
  const lastActivityRef = useRef(Date.now());
  const lastRefreshRef = useRef(0);

  useEffect(() => {
    const markActivity = () => {
      lastActivityRef.current = Date.now();
    };

    const events: Array<keyof WindowEventMap> = ['click', 'keydown', 'mousemove', 'scroll', 'focus'];
    for (const eventName of events) {
      window.addEventListener(eventName, markActivity, { passive: true });
    }

    const timer = window.setInterval(async () => {
      const now = Date.now();
      const recentlyActive = now - lastActivityRef.current < REFRESH_INTERVAL;
      const shouldRefresh = now - lastRefreshRef.current >= REFRESH_INTERVAL;

      if (!recentlyActive || !shouldRefresh) {
        return;
      }

      lastRefreshRef.current = now;

      const response = await fetch('/api/auth/refresh', {
        method: 'POST',
        credentials: 'include'
      });

      if (response.status === 401) {
        window.location.href = '/auth/sign-in';
      }
    }, 60 * 1000);

    return () => {
      for (const eventName of events) {
        window.removeEventListener(eventName, markActivity);
      }
      window.clearInterval(timer);
    };
  }, []);

  return null;
}
