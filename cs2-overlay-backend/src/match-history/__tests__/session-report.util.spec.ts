import { buildSessionReport } from '../session-report.util';
import { MatchHistoryEntry } from '../models/match-history-entry.model';

function entry(overrides: Partial<MatchHistoryEntry>): MatchHistoryEntry {
  return {
    id: Math.random().toString(36),
    map: 'de_mirage',
    ctScore: 13,
    tScore: 7,
    kills: 20,
    deaths: 15,
    assists: 3,
    mvps: 2,
    score: 1,
    kd: 1.33,
    won: true,
    recordedAt: new Date().toISOString(),
    ...overrides,
  };
}

describe('buildSessionReport', () => {
  it('returns an empty array for no matches', () => {
    expect(buildSessionReport([])).toEqual([]);
  });

  it('groups matches into a single session when gaps are small', () => {
    const base = Date.now();
    const matches = [
      entry({ recordedAt: new Date(base).toISOString(), won: true }),
      entry({ recordedAt: new Date(base + 10 * 60_000).toISOString(), won: true }),
      entry({ recordedAt: new Date(base + 20 * 60_000).toISOString(), won: false }),
    ];

    const sessions = buildSessionReport(matches, 30);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].matches).toBe(3);
    expect(sessions[0].wins).toBe(2);
    expect(sessions[0].losses).toBe(1);
    expect(sessions[0].winRatePercent).toBeCloseTo(66.7, 1);
  });

  it('splits into multiple sessions when the gap exceeds the threshold', () => {
    const base = Date.now();
    const matches = [
      entry({ recordedAt: new Date(base).toISOString() }),
      entry({ recordedAt: new Date(base + 60 * 60_000).toISOString() }), // +60min, gap > 30min
    ];

    const sessions = buildSessionReport(matches, 30);
    expect(sessions).toHaveLength(2);
    // Most recent session first
    expect(new Date(sessions[0].sessionStart).getTime()).toBeGreaterThan(
      new Date(sessions[1].sessionStart).getTime(),
    );
  });

  it('computes longest win/loss streaks and flags endedOnLosingStreak', () => {
    const base = Date.now();
    const results: Array<boolean | null> = [true, true, false, false, false];
    const matches = results.map((won, i) =>
      entry({ recordedAt: new Date(base + i * 5 * 60_000).toISOString(), won }),
    );

    const sessions = buildSessionReport(matches, 30);
    expect(sessions).toHaveLength(1);
    expect(sessions[0].longestWinStreak).toBe(2);
    expect(sessions[0].longestLossStreak).toBe(3);
    expect(sessions[0].endedOnLosingStreak).toBe(true);
  });

  it('excludes undecided (null won) matches from win rate but keeps them in the count', () => {
    const base = Date.now();
    const matches = [
      entry({ recordedAt: new Date(base).toISOString(), won: true }),
      entry({ recordedAt: new Date(base + 5 * 60_000).toISOString(), won: null }),
    ];

    const sessions = buildSessionReport(matches, 30);
    expect(sessions[0].matches).toBe(2);
    expect(sessions[0].undecided).toBe(1);
    expect(sessions[0].winRatePercent).toBe(100);
  });
});
