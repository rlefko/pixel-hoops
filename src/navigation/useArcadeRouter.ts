import { useContext } from 'react';
import { TransitionContext, type ArcadeRouter } from './TransitionProvider';

/**
 * Navigate with the arcade pixel-dissolve wipe. A drop-in for expo-router's
 * push/replace/back; pass the `'run'` variant for the bigger power-up boot.
 */
export function useArcadeRouter(): ArcadeRouter {
  const ctx = useContext(TransitionContext);
  if (!ctx) {
    throw new Error('useArcadeRouter must be used within a TransitionProvider');
  }
  return ctx;
}
