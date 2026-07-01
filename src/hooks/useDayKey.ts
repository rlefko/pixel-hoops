import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { dayKey, weekKey } from '@/game/daily';

/**
 * The local day and week keys for the Daily Layer. Computed once on mount and
 * re-checked when the app foregrounds or the screen refocuses (midnight almost
 * always passes in the background); state updates only when a key actually
 * changed, so the clock never drives renders. Date.now() lives here, in the hook
 * layer, keeping the game modules clock-free.
 */
export function useDayKey(): { day: string; week: string } {
  const [keys, setKeys] = useState(() => {
    const now = Date.now();
    return { day: dayKey(now), week: weekKey(now) };
  });

  const refresh = useCallback(() => {
    const now = Date.now();
    const next = { day: dayKey(now), week: weekKey(now) };
    setKeys((prev) => (prev.day === next.day && prev.week === next.week ? prev : next));
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  useFocusEffect(refresh);

  return keys;
}
