import { describe, it, expect } from 'vitest';
import { isSoundEffective, RAPID_CUE_COOLDOWN_MS } from '../soundPolicy';

describe('isSoundEffective', () => {
  it('is off until settings hydrate, even with sound on', () => {
    expect(isSoundEffective(false, true, false)).toBe(false);
  });

  it('is off when the player has sound turned off', () => {
    expect(isSoundEffective(true, false, false)).toBe(false);
  });

  it('is off in low power mode even when the player has sound on', () => {
    expect(isSoundEffective(true, true, true)).toBe(false);
  });

  it('is on only when hydrated, enabled, and not in low power mode', () => {
    expect(isSoundEffective(true, true, false)).toBe(true);
  });
});

describe('RAPID_CUE_COOLDOWN_MS', () => {
  it('guards rapid UI taps and toggles at the machine-gun threshold', () => {
    expect(RAPID_CUE_COOLDOWN_MS.tapPrimary).toBe(45);
    expect(RAPID_CUE_COOLDOWN_MS.tapSecondary).toBe(45);
    expect(RAPID_CUE_COOLDOWN_MS.toggle).toBe(45);
  });

  it('paces count ticks so a max-length tally sings about eight notes', () => {
    // 600 is useCountUp's duration cap; TickCounter's pitch ladder has 8 steps.
    expect(Math.ceil(600 / RAPID_CUE_COOLDOWN_MS.tick!)).toBeLessThanOrEqual(8);
    // But not so slow that a tally loses its stream feel entirely.
    expect(Math.ceil(600 / RAPID_CUE_COOLDOWN_MS.tick!)).toBeGreaterThanOrEqual(6);
  });

  it('leaves unlisted cues ungated', () => {
    expect(RAPID_CUE_COOLDOWN_MS.coin).toBeUndefined();
    expect(RAPID_CUE_COOLDOWN_MS.dupe).toBeUndefined();
  });
});
