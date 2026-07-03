import { useCallback } from 'react';
import { useRouter, type Href } from 'expo-router';

/**
 * The anchored panels of the How to Play handbook, in page order. Deep links
 * (MoreLink chips, the modal's `section` param) target these ids.
 */
export const HANDBOOK_SECTIONS = [
  'draft',
  'synergies',
  'watch',
  'map',
  'favor',
  'ladder',
  'bank',
] as const;

export type HandbookSection = (typeof HANDBOOK_SECTIONS)[number];

// Old/renamed anchors resolve forward so a stale link never dead-ends:
// scout->favor, collect->favor, powerup->map, bounties->ladder, daily->ladder, loss->bank
const SECTION_ALIASES: Record<string, HandbookSection> = {
  scout: 'favor',
  collect: 'favor',
  powerup: 'map',
  bounties: 'ladder',
  daily: 'ladder',
  loss: 'bank',
};

/** Normalize a raw route param to a section id; undefined for garbage or missing. */
export function resolveHandbookSection(
  raw: string | string[] | undefined
): HandbookSection | undefined {
  const value = Array.isArray(raw) ? raw[0] : raw;
  if (!value) return undefined;
  const aliased = SECTION_ALIASES[value];
  if (aliased) return aliased;
  return (HANDBOOK_SECTIONS as readonly string[]).includes(value)
    ? (value as HandbookSection)
    : undefined;
}

/** Href for the How to Play modal, optionally landing on a section anchor. */
export function handbookHref(section?: HandbookSection): Href {
  return section ? { pathname: '/modal', params: { section } } : { pathname: '/modal' };
}

/**
 * Open the handbook with the PLAIN expo-router push: the modal keeps its native
 * slide-up presentation and is deliberately NOT wiped via useArcadeRouter.
 */
export function useOpenHandbook(): (section?: HandbookSection) => void {
  const router = useRouter();
  return useCallback((section?: HandbookSection) => router.push(handbookHref(section)), [router]);
}
