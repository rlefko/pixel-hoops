import { describe, it, expect } from 'vitest';
import { isSoundEffective } from '../soundPolicy';

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
