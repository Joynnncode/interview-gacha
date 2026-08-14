/**
 * Motion preference.
 *
 * The OS setting is the default. The settings screen can override it in either
 * direction, because sometimes I want the animations off on a laptop that has
 * no system preference set.
 */

import { useEffect, useState } from 'react';
import { useSettings } from './useAppData';

const QUERY = '(prefers-reduced-motion: reduce)';

export function useSystemReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return false;
    return window.matchMedia(QUERY).matches;
  });

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const list = window.matchMedia(QUERY);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    list.addEventListener('change', onChange);
    return () => list.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

/** The setting the app should actually obey: manual override, else the OS. */
export function useReducedMotion(): boolean {
  const system = useSystemReducedMotion();
  const settings = useSettings();
  return settings.reducedMotion ?? system;
}
