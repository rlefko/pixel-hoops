import { describe, expect, it, vi } from 'vitest';

// The module under test exports useOpenHandbook, whose expo-router import would
// drag React Native into this Node run; the pure helpers are what we exercise.
vi.mock('expo-router', () => ({ useRouter: () => ({ push: () => {} }) }));

import { HANDBOOK_SECTIONS, handbookHref, resolveHandbookSection } from '@/navigation/handbook';
import { classCost } from '@/game/classes';
import { favorConvertible } from '@/game/favor';

describe('resolveHandbookSection', () => {
  it('accepts every canonical section id', () => {
    for (const id of HANDBOOK_SECTIONS) {
      expect(resolveHandbookSection(id)).toBe(id);
    }
  });

  it('resolves every retired anchor forward to a live section', () => {
    expect(resolveHandbookSection('scout')).toBe('favor');
    expect(resolveHandbookSection('collect')).toBe('favor');
    expect(resolveHandbookSection('powerup')).toBe('map');
    expect(resolveHandbookSection('bounties')).toBe('ladder');
    expect(resolveHandbookSection('daily')).toBe('ladder');
    expect(resolveHandbookSection('loss')).toBe('bank');
  });

  it('takes the first element of an array param', () => {
    expect(resolveHandbookSection(['ladder', 'draft'])).toBe('ladder');
    expect(resolveHandbookSection(['scout'])).toBe('favor');
  });

  it('returns undefined for garbage or missing input', () => {
    expect(resolveHandbookSection(undefined)).toBeUndefined();
    expect(resolveHandbookSection('')).toBeUndefined();
    expect(resolveHandbookSection('nonsense')).toBeUndefined();
    expect(resolveHandbookSection([])).toBeUndefined();
    expect(resolveHandbookSection(['garbage', 'draft'])).toBeUndefined();
  });
});

describe('handbookHref', () => {
  it('targets the modal with a section param', () => {
    expect(handbookHref('favor')).toEqual({ pathname: '/modal', params: { section: 'favor' } });
  });

  it('omits params when no section is given', () => {
    expect(handbookHref()).toEqual({ pathname: '/modal' });
  });
});

describe('handbook copy stays honest to the game rules', () => {
  it('two classes above the ladder really is barred (the BARRED chip)', () => {
    expect(classCost('S', 'C')).toBeNull();
  });

  it('legend favor really never converts to copies (the legend caveat)', () => {
    expect(favorConvertible('S+')).toBe(false);
  });
});
