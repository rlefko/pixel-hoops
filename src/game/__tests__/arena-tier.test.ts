import { describe, it, expect } from 'vitest';
import { arenaTierFor } from '@/game/arena-tier';

const TOTAL = 7;

describe('arenaTierFor', () => {
  it('calls the final map boss the championship', () => {
    expect(arenaTierFor({ type: 'boss' }, TOTAL - 1, TOTAL)).toBe('championship');
  });

  it('calls an earlier boss a boss', () => {
    expect(arenaTierFor({ type: 'boss' }, 0, TOTAL)).toBe('boss');
    expect(arenaTierFor({ type: 'boss' }, TOTAL - 2, TOTAL)).toBe('boss');
  });

  it('calls an elite node elite regardless of map', () => {
    expect(arenaTierFor({ type: 'elite' }, 0, TOTAL)).toBe('elite');
    expect(arenaTierFor({ type: 'elite' }, TOTAL - 1, TOTAL)).toBe('elite');
  });

  it('calls everything else routine, including a missing node', () => {
    expect(arenaTierFor({ type: 'game' }, 3, TOTAL)).toBe('routine');
    expect(arenaTierFor({ type: 'rest' }, 3, TOTAL)).toBe('routine');
    expect(arenaTierFor(undefined, 3, TOTAL)).toBe('routine');
  });
});
