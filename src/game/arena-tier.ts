import type { MapNode } from '@/types/run-map';

/**
 * The presentation tier of a combat node's arena: the single source for the
 * pregame stakes ceremony and the watch's apron crowd, derived (never stored)
 * so any screen with the node and map index in scope agrees. Routine games keep
 * the clean dark apron and the instant cut — the contrast IS the escalation.
 */
export type ArenaTier = 'routine' | 'elite' | 'boss' | 'championship';

export function arenaTierFor(
  node: Pick<MapNode, 'type'> | undefined,
  currentMapIndex: number,
  totalMaps: number
): ArenaTier {
  if (node?.type === 'boss') {
    return currentMapIndex >= totalMaps - 1 ? 'championship' : 'boss';
  }
  return node?.type === 'elite' ? 'elite' : 'routine';
}
