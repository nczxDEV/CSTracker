/**
 * "Time Performance" feature - win rate broken down by hour-of-day and
 * day-of-week, GSI-FREE (works for ANY FACEIT nickname, not just the
 * local GSI-sending player) - built purely from the official FACEIT
 * Data API's match history endpoint (up to 100 recent matches - see
 * time-performance.util.ts `buildTimePerformance()`).
 *
 * IMPORTANT (timezone note): since this backend runs LOCALLY on the same
 * machine as the desktop app (no hosted server involved - see the
 * project's overall architecture), each match's UTC timestamp is
 * converted using the backend process's OWN system timezone, which is
 * the SAME machine/timezone the user is actually sitting at. This is
 * exactly the "your local time" experience the feature promises, with
 * no separate timezone configuration needed.
 */

export interface TimeBucketStat {
  matches: number;
  /** 0-100, rounded to the nearest integer. Null if `matches` is 0. */
  winRate: number | null;
}

/** Same shape as TimeBucketStat, but with one decimal of precision (used for the weekday/weekend aggregate, matching the granularity of the approved design mockup). */
export interface TimeBucketStatPrecise {
  matches: number;
  winRate: number | null;
}

export interface BestWorstWindow {
  /** e.g. "Sat-19" (day short code - hour, 0-23). */
  key: string;
  matches: number;
  winRate: number;
  dayFull: string;
  /** Short form, e.g. "7p"/"11a" - see the frontend's `hourLabelFull()` for how this is expanded to "7 PM". */
  hourLabel: string;
}

export interface TimePerformanceResult {
  identifier: string;
  nickname: string;
  /** How many of the fetched matches had valid timestamps AND a determinable win/loss (i.e. contributed to the breakdown). */
  matchesConsidered: number;
  /** Keyed "Mon-0".."Sun-23" (24 hours x 7 days = 168 entries). */
  matrix: Record<string, TimeBucketStat>;
  best: BestWorstWindow | null;
  worst: BestWorstWindow | null;
  /** Keyed "0".."23", aggregated across all days. */
  hourly: Record<string, TimeBucketStat>;
  weekday: TimeBucketStatPrecise;
  weekend: TimeBucketStatPrecise;
  segments: {
    morning: TimeBucketStatPrecise;
    afternoon: TimeBucketStatPrecise;
    evening: TimeBucketStatPrecise;
    night: TimeBucketStatPrecise;
  };
  days: string[];
  dayFullMap: Record<string, string>;
}
