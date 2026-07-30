import { buildTimePerformance } from '../time-performance.util';

/** Builds a fake FACEIT history "items" entry for player p1, at a given epoch-seconds timestamp, with a win/loss determined by whether p1 is on the winning faction. */
function historyItem(timestampSeconds: number, won: boolean) {
  return {
    started_at: timestampSeconds,
    teams: {
      faction1: { players: [{ player_id: 'p1' }] },
      faction2: { players: [{ player_id: 'p2' }] },
    },
    results: { winner: won ? 'faction1' : 'faction2' },
  };
}

describe('buildTimePerformance', () => {
  it('returns an empty/zeroed result when history has no items', () => {
    const result = buildTimePerformance('xadez', 'xadez', { items: [] }, 'p1');
    expect(result.matchesConsidered).toBe(0);
    expect(result.best).toBeNull();
    expect(result.worst).toBeNull();
    expect(Object.keys(result.matrix)).toHaveLength(7 * 24);
  });

  it('skips items with no usable timestamp', () => {
    const history = { items: [{ teams: {}, results: {} }] };
    const result = buildTimePerformance('xadez', 'xadez', history, 'p1');
    expect(result.matchesConsidered).toBe(0);
  });

  it('buckets matches by local hour-of-day and day-of-week', () => {
    // A fixed, known timestamp: 2024-01-01T18:00:00 UTC was a Monday.
    const monday6pmUtc = Date.UTC(2024, 0, 1, 18, 0, 0) / 1000;
    const history = { items: [historyItem(monday6pmUtc, true)] };
    const result = buildTimePerformance('xadez', 'xadez', history, 'p1');

    expect(result.matchesConsidered).toBe(1);
    // Find whichever bucket got the match (exact hour depends on the
    // test runner's local timezone, but exactly one bucket should have
    // matches=1 and winRate=100).
    const populated = Object.values(result.matrix).filter((b) => b.matches > 0);
    expect(populated).toHaveLength(1);
    expect(populated[0].winRate).toBe(100);
  });

  it('computes weekday vs weekend aggregates', () => {
    const mondayNoonUtc = Date.UTC(2024, 0, 1, 12, 0, 0) / 1000; // Monday
    const saturdayNoonUtc = Date.UTC(2024, 0, 6, 12, 0, 0) / 1000; // Saturday
    const history = {
      items: [historyItem(mondayNoonUtc, true), historyItem(saturdayNoonUtc, false)],
    };
    const result = buildTimePerformance('xadez', 'xadez', history, 'p1');
    expect(result.weekday.matches).toBe(1);
    expect(result.weekend.matches).toBe(1);
  });

  it('falls back to considering all non-empty buckets for best/worst when none meet the minimum sample size', () => {
    const t1 = Date.UTC(2024, 0, 1, 10, 0, 0) / 1000;
    const history = { items: [historyItem(t1, true)] };
    const result = buildTimePerformance('xadez', 'xadez', history, 'p1');
    expect(result.best).not.toBeNull();
    expect(result.worst).not.toBeNull();
  });
});
