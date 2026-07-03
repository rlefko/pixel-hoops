import { describe, it, expect } from 'vitest';
import {
  createRookieRoster,
  deserializeHomeRoster,
  mergeRunGainsIntoHome,
  serializeHomeRoster,
  type HomeRoster,
} from '@/game/home-roster';
import {
  ARCADE_UNLOCK_COINS,
  LOSS_NUDGE_STREAK,
  TIP_IDS,
  dueHubCeremonies,
  emptyTeach,
  graduatedTeach,
  hubPulseTarget,
  hubStages,
  lossStreakAt,
  markTipSeen,
  sanitizeTeach,
  settleTeach,
  tipSeen,
  type TeachLedger,
} from '@/game/teach';
import { cellKey } from '@/game/difficulty-mode';
import { createRNG } from '@/game/rng';
import type { HallOfFameEntry } from '@/game/hall-of-fame';
import type { Roster } from '@/types/roster';

function rookie(): HomeRoster {
  return createRookieRoster(createRNG('teach-seed'));
}

function runRosterOf(home: HomeRoster): Roster {
  return { starters: home.players.slice(0, 5), bench: [] };
}

function banner(home: HomeRoster): HallOfFameEntry {
  return {
    id: 'e1',
    ts: 1,
    difficulty: 'easy',
    ladderClass: 'C',
    finalHome: 60,
    finalAway: 50,
    opponentName: 'Rivals',
    homeTeamName: 'Your Squad',
    wins: 7,
    starters: home.players.slice(0, 5),
  };
}

/** A serialized payload with an editable data bag, for posing as older/corrupt saves. */
function mutablePayload(home: HomeRoster) {
  return serializeHomeRoster(home) as unknown as {
    version: number;
    data: Record<string, unknown>;
  };
}

/** A payload posing as a pre-v20 save (no teach field). */
function preV20Payload(home: HomeRoster) {
  const payload = mutablePayload(home);
  payload.version = 19;
  delete payload.data.teach;
  return payload;
}

describe('teach ledger basics', () => {
  it('starts a rookie (and the Settings reset) fully un-taught and fully locked', () => {
    const home = rookie();
    expect(home.teach).toEqual(emptyTeach());
    for (const id of TIP_IDS) expect(tipSeen(home.teach, id)).toBe(false);
    expect(hubStages(home)).toEqual({
      locker: false,
      arcade: false,
      coaches: false,
      hallOfFame: false,
      daily: false,
    });
    expect(dueHubCeremonies(home)).toEqual({ audible: null, quiet: [] });
  });

  it('markTipSeen stamps once and no-ops with the same reference afterward', () => {
    const home = rookie();
    const stamped = markTipSeen(home, 'draftBudget');
    expect(stamped).not.toBe(home);
    expect(tipSeen(stamped.teach, 'draftBudget')).toBe(true);
    expect(stamped.teach!.runsSettled).toBe(0);
    expect(stamped.teach!.lossStreak).toBeNull();
    expect(markTipSeen(stamped, 'draftBudget')).toBe(stamped);
  });

  it('markTipSeen on a missing ledger is a same-reference no-op (graduated)', () => {
    const home: HomeRoster = { ...rookie(), teach: undefined };
    expect(markTipSeen(home, 'draftBudget')).toBe(home);
    expect(tipSeen(home.teach, 'draftBudget')).toBe(true);
  });
});

describe('settleTeach', () => {
  it('counts settles and builds a per-cell loss streak', () => {
    let t: TeachLedger = emptyTeach();
    t = settleTeach(t, { champion: false, difficulty: 'easy', ladderClass: 'C' });
    t = settleTeach(t, { champion: false, difficulty: 'easy', ladderClass: 'C' });
    t = settleTeach(t, { champion: false, difficulty: 'easy', ladderClass: 'C' });
    expect(t.runsSettled).toBe(3);
    expect(t.lossStreak).toEqual({ cell: cellKey('easy', 'C'), count: 3 });
    expect(lossStreakAt(t, 'easy', 'C')).toBe(LOSS_NUDGE_STREAK);
    expect(lossStreakAt(t, 'medium', 'C')).toBe(0);
  });

  it('a loss at a different cell restarts the streak at 1', () => {
    let t: TeachLedger = emptyTeach();
    t = settleTeach(t, { champion: false, difficulty: 'easy', ladderClass: 'C' });
    t = settleTeach(t, { champion: false, difficulty: 'medium', ladderClass: 'C' });
    expect(t.lossStreak).toEqual({ cell: cellKey('medium', 'C'), count: 1 });
  });

  it('a championship clears the streak but still counts the settle', () => {
    let t: TeachLedger = emptyTeach();
    t = settleTeach(t, { champion: false, difficulty: 'easy', ladderClass: 'C' });
    t = settleTeach(t, { champion: true, difficulty: 'easy', ladderClass: 'C' });
    expect(t.runsSettled).toBe(2);
    expect(t.lossStreak).toBeNull();
  });

  it('a missing ledger settles onto a graduated base, never un-graduating', () => {
    const t = settleTeach(undefined, { champion: false, difficulty: 'easy', ladderClass: 'C' });
    expect(t.seen).toEqual([...TIP_IDS]);
    expect(t.runsSettled).toBe(2);
  });
});

describe('hubStages derivation', () => {
  const base = () => ({ teach: emptyTeach(), coins: 0, clearedCells: [], hallOfFame: [] });

  it('locker and daily open on the first terminal settle', () => {
    const s = { ...base(), teach: { ...emptyTeach(), runsSettled: 1 } };
    const stages = hubStages(s);
    expect(stages.locker).toBe(true);
    expect(stages.daily).toBe(true);
    expect(stages.arcade).toBe(false);
  });

  it('arcade opens at the cheapest scout cost and ratchets via the seen flag', () => {
    expect(hubStages({ ...base(), coins: ARCADE_UNLOCK_COINS - 1 }).arcade).toBe(false);
    expect(hubStages({ ...base(), coins: ARCADE_UNLOCK_COINS }).arcade).toBe(true);
    // Spent back under the threshold AFTER the ceremony stamped: stays open.
    const stamped: TeachLedger = { ...emptyTeach(), seen: ['arcadeUnlock'] };
    expect(hubStages({ ...base(), teach: stamped, coins: 0 }).arcade).toBe(true);
  });

  it('coaches and hall of fame derive from clears and banners', () => {
    expect(hubStages({ ...base(), clearedCells: [cellKey('easy', 'C')] }).coaches).toBe(true);
    const home = rookie();
    expect(hubStages({ ...base(), hallOfFame: [banner(home)] }).hallOfFame).toBe(true);
  });

  it('a missing ledger opens everything (a veteran hub can never re-lock)', () => {
    const stages = hubStages({ teach: undefined, coins: 0, clearedCells: [], hallOfFame: [] });
    expect(stages).toEqual({
      locker: true,
      arcade: true,
      coaches: true,
      hallOfFame: true,
      daily: true,
    });
  });
});

describe('dueHubCeremonies honesty', () => {
  it('owes one audible ceremony plus the quiet reveals, then nothing after stamping', () => {
    const home = rookie();
    const settled: HomeRoster = {
      ...home,
      teach: { ...emptyTeach(), runsSettled: 1 },
    };
    const due = dueHubCeremonies(settled);
    expect(due.audible).toBe('lockerUnlock');
    expect(due.quiet).toEqual(['dailyUnlock']);
    const stamped = markTipSeen(markTipSeen(settled, 'lockerUnlock'), 'dailyUnlock');
    expect(dueHubCeremonies(stamped)).toEqual({ audible: null, quiet: [] });
  });

  it('plays at most one audible ceremony even when two gates are newly open', () => {
    const due = dueHubCeremonies({
      teach: { ...emptyTeach(), runsSettled: 1 },
      coins: ARCADE_UNLOCK_COINS,
      clearedCells: [],
      hallOfFame: [],
    });
    expect(due.audible).toBe('lockerUnlock');
  });
});

describe('hubPulseTarget priority', () => {
  const open = { locker: true, arcade: true, coaches: true, hallOfFame: true, daily: true };
  const closed = { locker: false, arcade: false, coaches: false, hallOfFame: false, daily: false };

  it('follows ceremony > resume > pre-settle new run > unclaimed daily > new run', () => {
    expect(
      hubPulseTarget({ stages: open, ceremony: 'arcadeUnlock', hasSavedRun: true, spotlightClaimed: false })
    ).toBe('arcade');
    expect(
      hubPulseTarget({ stages: open, ceremony: null, hasSavedRun: true, spotlightClaimed: false })
    ).toBe('resume');
    expect(
      hubPulseTarget({ stages: closed, ceremony: null, hasSavedRun: false, spotlightClaimed: false })
    ).toBe('newRun');
    expect(
      hubPulseTarget({ stages: open, ceremony: null, hasSavedRun: false, spotlightClaimed: false })
    ).toBe('daily');
    expect(
      hubPulseTarget({ stages: open, ceremony: null, hasSavedRun: false, spotlightClaimed: true })
    ).toBe('newRun');
  });
});

describe('v20 teach migration', () => {
  it('graduates a veteran (seenWelcome true): every tip seen, no ceremony owed', () => {
    const home: HomeRoster = { ...rookie(), seenWelcome: true };
    const restored = deserializeHomeRoster(preV20Payload(home))!;
    expect(restored.teach!.seen).toEqual([...TIP_IDS]);
    expect(hubStages(restored)).toEqual({
      locker: true,
      arcade: true,
      coaches: true,
      hallOfFame: true,
      daily: true,
    });
    expect(dueHubCeremonies(restored)).toEqual({ audible: null, quiet: [] });
  });

  it('gives a genuinely fresh pre-v20 save the full unfolding', () => {
    const restored = deserializeHomeRoster(preV20Payload(rookie()))!;
    expect(restored.teach).toEqual(emptyTeach());
  });

  it('treats each prior-progress signal as veteran on its own', () => {
    const signals: Partial<HomeRoster>[] = [
      { coins: 1 },
      { settledRunId: 'run-1' },
      { lastBankedRunId: 'run-1' },
      { clearedCells: [cellKey('easy', 'C')] },
      { hallOfFame: [banner(rookie())] },
    ];
    for (const patch of signals) {
      const home: HomeRoster = { ...rookie(), ...patch };
      const restored = deserializeHomeRoster(preV20Payload(home))!;
      expect(restored.teach!.seen, JSON.stringify(patch)).toEqual([...TIP_IDS]);
    }
  });

  it('a missing seenWelcome (pre-welcome-era save) reads veteran', () => {
    const payload = preV20Payload(rookie());
    delete payload.data.seenWelcome;
    const restored = deserializeHomeRoster(payload)!;
    expect(restored.teach!.seen).toEqual([...TIP_IDS]);
  });

  it('round-trips a mid-onboarding ledger and drops unknown seen ids', () => {
    const home: HomeRoster = {
      ...rookie(),
      teach: {
        seen: ['draftBudget', 'lockerUnlock'],
        runsSettled: 2,
        lossStreak: { cell: cellKey('easy', 'C'), count: 2 },
      },
    };
    const restored = deserializeHomeRoster(serializeHomeRoster(home))!;
    expect(restored.teach).toEqual(home.teach);

    const payload = mutablePayload(home);
    (payload.data.teach as { seen: string[] }).seen = ['draftBudget', 'notATip'];
    const cleaned = deserializeHomeRoster(payload)!;
    expect(cleaned.teach!.seen).toEqual(['draftBudget']);
  });

  it('degrades garbage teach fields to the veteran-status fallback, field-wise', () => {
    const home: HomeRoster = { ...rookie(), seenWelcome: true };
    const payload = mutablePayload(home);
    payload.data.teach = {
      seen: 42,
      runsSettled: 'many',
      lossStreak: { cell: 'bogus', count: -1 },
    };
    const restored = deserializeHomeRoster(payload)!;
    expect(restored.teach!.seen).toEqual([...TIP_IDS]);
    // No run signal on this save, so the fallback carries no settle count; the
    // gates still read open through the graduated seen list.
    expect(restored.teach!.runsSettled).toBe(0);
    expect(restored.teach!.lossStreak).toBeNull();
  });

  it('sanitizeTeach keeps a well-formed streak and floors a fractional count', () => {
    const clean = sanitizeTeach(
      { seen: [], runsSettled: 4, lossStreak: { cell: 'easy:C', count: 2.9 } },
      graduatedTeach()
    );
    expect(clean).toEqual({ seen: [], runsSettled: 4, lossStreak: { cell: 'easy:C', count: 2 } });
  });
});

describe('merge integration', () => {
  it('a loss merge advances the counter and streak at the played cell', () => {
    const home = rookie();
    const merged = mergeRunGainsIntoHome(home, runRosterOf(home), {
      champion: false,
      playedDifficulty: 'easy',
      ladderClass: 'C',
    });
    expect(merged.teach!.runsSettled).toBe(1);
    expect(merged.teach!.lossStreak).toEqual({ cell: cellKey('easy', 'C'), count: 1 });
  });

  it('a championship merge clears the streak', () => {
    const home: HomeRoster = {
      ...rookie(),
      teach: {
        ...emptyTeach(),
        runsSettled: 3,
        lossStreak: { cell: cellKey('easy', 'C'), count: 3 },
      },
    };
    const merged = mergeRunGainsIntoHome(home, runRosterOf(home), {
      champion: true,
      clearedClass: 'C',
      playedDifficulty: 'easy',
      ladderClass: 'C',
    });
    expect(merged.teach!.runsSettled).toBe(4);
    expect(merged.teach!.lossStreak).toBeNull();
  });

  it('a home without a ledger merges to a graduated ledger (never un-graduates)', () => {
    const home: HomeRoster = { ...rookie(), teach: undefined };
    const merged = mergeRunGainsIntoHome(home, runRosterOf(home), {
      champion: false,
      playedDifficulty: 'easy',
      ladderClass: 'C',
    });
    expect(merged.teach!.seen).toEqual([...TIP_IDS]);
  });
});
