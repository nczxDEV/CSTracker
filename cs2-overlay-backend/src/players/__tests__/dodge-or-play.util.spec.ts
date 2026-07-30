import {
  computeSmurfScore,
  computeTiltScore,
  buildDodgeOrPlayResult,
  SMURF_SUSPECT_THRESHOLD,
  TILT_SUSPECT_THRESHOLD,
} from '../dodge-or-play.util';
import { emptyPlayerProfile, PlayerProfile } from '../models/player-profile.model';

function makeProfile(overrides: Partial<PlayerProfile> = {}): PlayerProfile {
  return { ...emptyPlayerProfile(), ...overrides };
}

describe('computeSmurfScore', () => {
  it('returns a null score when no match count is available', () => {
    const profile = makeProfile();
    const result = computeSmurfScore(profile);
    expect(result.score).toBeNull();
    expect(result.suspected).toBe(false);
  });

  it('flags a classic smurf pattern: low matches + elite K/D + elite win rate', () => {
    const profile = makeProfile({
      stats: { kd: 2.4, adr: 100, hsPercent: 65, winRate: 90, matchesPlayed: 25, krRatio: null, totalHeadshots: null, currentWinStreak: null, longestWinStreak: null },
    });
    const result = computeSmurfScore(profile);
    expect(result.score).toBeGreaterThanOrEqual(SMURF_SUSPECT_THRESHOLD);
    expect(result.suspected).toBe(true);
    expect(result.reasons.length).toBeGreaterThan(0);
  });

  it('does NOT flag a veteran account with high K/D but many matches played', () => {
    const profile = makeProfile({
      stats: { kd: 1.5, adr: 90, hsPercent: 55, winRate: 62, matchesPlayed: 3000, krRatio: null, totalHeadshots: null, currentWinStreak: null, longestWinStreak: null },
    });
    const result = computeSmurfScore(profile);
    expect(result.suspected).toBe(false);
  });

  it('does NOT flag a low-match-count account with mediocre stats (just a new player)', () => {
    const profile = makeProfile({
      stats: { kd: 0.9, adr: 65, hsPercent: 35, winRate: 48, matchesPlayed: 20, krRatio: null, totalHeadshots: null, currentWinStreak: null, longestWinStreak: null },
    });
    const result = computeSmurfScore(profile);
    expect(result.suspected).toBe(false);
  });
});

describe('computeTiltScore', () => {
  it('returns a null score when no recentForm data is available', () => {
    const profile = makeProfile();
    const result = computeTiltScore(profile);
    expect(result.score).toBeNull();
    expect(result.onTilt).toBe(false);
  });

  it('flags a player on an active 5+ loss streak as on tilt', () => {
    const profile = makeProfile({
      stats: { kd: 1.0, adr: 75, hsPercent: 45, winRate: 50, matchesPlayed: 500, krRatio: null, totalHeadshots: null, currentWinStreak: null, longestWinStreak: null },
      recentForm: {
        last20Results: ['L', 'L', 'L', 'L', 'L', 'W', 'W'],
        matchesConsidered: 7,
        winRateLast20Percent: 28.6,
        currentStreak: { type: 'loss', count: 5 },
        longestWinStreak: 2,
        longestLossStreak: 5,
      },
    });
    const result = computeTiltScore(profile);
    expect(result.score).toBeGreaterThanOrEqual(TILT_SUSPECT_THRESHOLD);
    expect(result.onTilt).toBe(true);
  });

  it('does NOT flag a player on a short win streak as on tilt', () => {
    const profile = makeProfile({
      stats: { kd: 1.1, adr: 78, hsPercent: 48, winRate: 55, matchesPlayed: 500, krRatio: null, totalHeadshots: null, currentWinStreak: null, longestWinStreak: null },
      recentForm: {
        last20Results: ['W', 'W', 'W'],
        matchesConsidered: 3,
        winRateLast20Percent: 100,
        currentStreak: { type: 'win', count: 3 },
        longestWinStreak: 3,
        longestLossStreak: 0,
      },
    });
    const result = computeTiltScore(profile);
    expect(result.onTilt).toBe(false);
  });
});

describe('buildDodgeOrPlayResult', () => {
  function playerWithElo(elo: number): PlayerProfile {
    return makeProfile({ faceit: { nickname: 'p', level: 5, elo, region: 'EU', country: null, membership: null } });
  }

  it('recommends PLAY for an evenly-matched, clean match (no flags)', () => {
    const own = [playerWithElo(1500), playerWithElo(1500)];
    const enemy = [playerWithElo(1500), playerWithElo(1500)];
    const result = buildDodgeOrPlayResult('m1', null, null, own, enemy);
    expect(result.verdict.recommendation).toBe('PLAY');
    expect(result.verdict.winProbabilityPercent).toBeCloseTo(50, 0);
  });

  it('recommends DODGE when the enemy squad has 2+ suspected smurfs (hard override)', () => {
    const smurf = makeProfile({
      faceit: { nickname: 'smurf', level: 10, elo: 2500, region: 'EU', country: null, membership: null },
      stats: { kd: 2.5, adr: 110, hsPercent: 70, winRate: 95, matchesPlayed: 15, krRatio: null, totalHeadshots: null, currentWinStreak: null, longestWinStreak: null },
    });
    const own = [playerWithElo(1500)];
    const enemy = [smurf, { ...smurf }];
    const result = buildDodgeOrPlayResult('m1', null, null, own, enemy);
    expect(result.verdict.recommendation).toBe('DODGE');
    expect(result.verdict.enemySmurfCount).toBe(2);
  });

  it('win probability is clamped between 5% and 95%', () => {
    const own = [playerWithElo(3500)];
    const enemy = [playerWithElo(500)];
    const result = buildDodgeOrPlayResult('m1', null, null, own, enemy);
    expect(result.verdict.winProbabilityPercent).toBeLessThanOrEqual(95);
    expect(result.verdict.winProbabilityPercent).toBeGreaterThanOrEqual(5);
  });
});
