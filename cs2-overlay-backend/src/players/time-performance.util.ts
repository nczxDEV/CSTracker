import { BestWorstWindow, TimeBucketStat, TimeBucketStatPrecise, TimePerformanceResult } from './models/time-performance.model';

/**
 * "Time Performance" feature - builds an hour-of-day/day-of-week win
 * rate breakdown from a raw FACEIT `/players/{id}/history` response
 * (see PlayersService.getTimePerformance(), which fetches up to 100
 * recent matches specifically for this feature - separate from, and
 * with a much larger sample than, the 20-match `recentForm` field used
 * elsewhere, since a meaningful heatmap needs more data points).
 *
 * GSI-FREE: works for ANY FACEIT nickname the user types in, not just
 * the local GSI-sending player - this is the key difference from "My
 * Match History" (session-report.util.ts), which requires a live GSI
 * connection and only ever covers the local player.
 */

const DAY_SHORT_KEYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_FULL_MAP: Record<string, string> = {
  Mon: 'Monday',
  Tue: 'Tuesday',
  Wed: 'Wednesday',
  Thu: 'Thursday',
  Fri: 'Friday',
  Sat: 'Saturday',
  Sun: 'Sunday',
};
/** JS Date.getDay() returns 0=Sunday..6=Saturday - remap to our Monday-first day-short-key list. */
const JS_DAY_INDEX_TO_SHORT_KEY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Minimum sample size for a single hour-of-day/day-of-week bucket to be eligible as the "best"/"worst" window callout - avoids a single lucky/unlucky match dominating the headline. */
const MIN_SAMPLE_FOR_BEST_WORST = 3;

interface MatchTimestampResult {
  /** Unix seconds. */
  timestamp: number;
  won: boolean;
}

/**
 * Extracts (timestamp, won) pairs from the FACEIT history response,
 * relative to the given player_id - mirrors
 * players.normalizer.ts computeAllResults()'s win/loss logic, but also
 * keeps the match timestamp (`started_at`, falling back to
 * `finished_at`) needed to bucket by hour/day. Items with no usable
 * timestamp are skipped (can't be bucketed), not counted as an error.
 */
function extractTimestampedResults(history: any, playerId: string): MatchTimestampResult[] {
  const items = history?.items;
  if (!Array.isArray(items)) return [];

  const results: MatchTimestampResult[] = [];
  for (const item of items) {
    const rawTimestamp = item?.started_at ?? item?.finished_at;
    if (typeof rawTimestamp !== 'number') continue;

    const teams = item?.teams ?? {};
    const winnerFaction = item?.results?.winner;
    let playerFaction: string | null = null;
    for (const factionKey of Object.keys(teams)) {
      const players = teams[factionKey]?.players ?? [];
      if (players.some((p: any) => p?.player_id === playerId)) {
        playerFaction = factionKey;
        break;
      }
    }
    if (!playerFaction || !winnerFaction) continue;

    results.push({
      timestamp: rawTimestamp,
      won: playerFaction === winnerFaction,
    });
  }
  return results;
}

/** Accumulator bucket - tracks raw win/match counts before the final winRate is computed. */
interface Accumulator {
  matches: number;
  wins: number;
}

function newAccumulator(): Accumulator {
  return { matches: 0, wins: 0 };
}

function add(acc: Accumulator, won: boolean): void {
  acc.matches += 1;
  if (won) acc.wins += 1;
}

function toStat(acc: Accumulator, decimals = 0): TimeBucketStat | TimeBucketStatPrecise {
  if (acc.matches === 0) return { matches: 0, winRate: null };
  const factor = Math.pow(10, decimals);
  const winRate = Math.round((acc.wins / acc.matches) * 100 * factor) / factor;
  return { matches: acc.matches, winRate };
}

/** Short hour label matching the frontend's own `hourLabel()` (e.g. "7p", "11a") - kept identical so the backend's best/worst callout renders consistently with the frontend's own heatmap hour labels. */
function shortHourLabel(hour: number): string {
  const ampm = hour < 12 ? 'a' : 'p';
  let h12 = hour % 12;
  if (h12 === 0) h12 = 12;
  return `${h12}${ampm}`;
}

/** 6am-12pm / 12pm-6pm / 6pm-11pm / 11pm-6am, matching the approved design mockup's segment definitions. */
function segmentForHour(hour: number): 'morning' | 'afternoon' | 'evening' | 'night' {
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 18) return 'afternoon';
  if (hour >= 18 && hour < 23) return 'evening';
  return 'night';
}

export function buildTimePerformance(
  identifier: string,
  nickname: string,
  history: any,
  playerId: string,
): TimePerformanceResult {
  const timestamped = extractTimestampedResults(history, playerId);

  const matrixAcc: Record<string, Accumulator> = {};
  for (const day of DAY_SHORT_KEYS) {
    for (let h = 0; h < 24; h++) {
      matrixAcc[`${day}-${h}`] = newAccumulator();
    }
  }
  const hourlyAcc: Record<string, Accumulator> = {};
  for (let h = 0; h < 24; h++) hourlyAcc[String(h)] = newAccumulator();

  const weekdayAcc = newAccumulator();
  const weekendAcc = newAccumulator();
  const segmentAcc = {
    morning: newAccumulator(),
    afternoon: newAccumulator(),
    evening: newAccumulator(),
    night: newAccumulator(),
  };

  for (const { timestamp, won } of timestamped) {
    // See the class-level doc comment: this backend runs on the SAME
    // machine as the user, so the process's own local timezone IS the
    // user's own local timezone - no separate conversion needed.
    const date = new Date(timestamp * 1000);
    const jsDay = date.getDay(); // 0=Sun..6=Sat
    const dayKey = JS_DAY_INDEX_TO_SHORT_KEY[jsDay];
    const hour = date.getHours(); // 0-23, local time

    add(matrixAcc[`${dayKey}-${hour}`], won);
    add(hourlyAcc[String(hour)], won);

    const isWeekend = jsDay === 0 || jsDay === 6;
    add(isWeekend ? weekendAcc : weekdayAcc, won);

    add(segmentAcc[segmentForHour(hour)], won);
  }

  const matrix: Record<string, TimeBucketStat> = {};
  for (const key of Object.keys(matrixAcc)) {
    matrix[key] = toStat(matrixAcc[key]) as TimeBucketStat;
  }
  const hourly: Record<string, TimeBucketStat> = {};
  for (const key of Object.keys(hourlyAcc)) {
    hourly[key] = toStat(hourlyAcc[key]) as TimeBucketStat;
  }

  const { best, worst } = pickBestWorst(matrixAcc);

  return {
    identifier,
    nickname,
    matchesConsidered: timestamped.length,
    matrix,
    best,
    worst,
    hourly,
    weekday: toStat(weekdayAcc, 1) as TimeBucketStatPrecise,
    weekend: toStat(weekendAcc, 1) as TimeBucketStatPrecise,
    segments: {
      morning: toStat(segmentAcc.morning, 1) as TimeBucketStatPrecise,
      afternoon: toStat(segmentAcc.afternoon, 1) as TimeBucketStatPrecise,
      evening: toStat(segmentAcc.evening, 1) as TimeBucketStatPrecise,
      night: toStat(segmentAcc.night, 1) as TimeBucketStatPrecise,
    },
    days: DAY_SHORT_KEYS,
    dayFullMap: DAY_FULL_MAP,
  };
}

/**
 * Picks the single best/worst hour-of-day/day-of-week window, requiring
 * at least MIN_SAMPLE_FOR_BEST_WORST matches to be eligible (falls back
 * to considering every non-empty bucket if none meet that bar, so a
 * fresh account with sparse data still gets a callout instead of null).
 */
function pickBestWorst(matrixAcc: Record<string, Accumulator>): {
  best: BestWorstWindow | null;
  worst: BestWorstWindow | null;
} {
  const entries = Object.entries(matrixAcc).filter(([, acc]) => acc.matches > 0);
  if (entries.length === 0) return { best: null, worst: null };

  const eligible = entries.filter(([, acc]) => acc.matches >= MIN_SAMPLE_FOR_BEST_WORST);
  const pool = eligible.length > 0 ? eligible : entries;

  const withWinRate = pool.map(([key, acc]) => ({
    key,
    matches: acc.matches,
    winRate: Math.round((acc.wins / acc.matches) * 100),
  }));

  const bestEntry = withWinRate.reduce((a, b) => (b.winRate > a.winRate ? b : a));
  const worstEntry = withWinRate.reduce((a, b) => (b.winRate < a.winRate ? b : a));

  const toWindow = (entry: { key: string; matches: number; winRate: number }): BestWorstWindow => {
    const [day, hourStr] = entry.key.split('-');
    const hour = parseInt(hourStr, 10);
    return {
      key: entry.key,
      matches: entry.matches,
      winRate: entry.winRate,
      dayFull: DAY_FULL_MAP[day],
      hourLabel: shortHourLabel(hour),
    };
  };

  return { best: toWindow(bestEntry), worst: toWindow(worstEntry) };
}
