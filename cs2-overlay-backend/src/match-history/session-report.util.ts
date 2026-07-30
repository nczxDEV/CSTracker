import { MatchHistoryEntry } from './models/match-history-entry.model';

/**
 * "Session Performance Report" feature - clusters the LOCAL player's own
 * recorded matches (match_history, already populated by GsiService) into
 * play SESSIONS, purely by time gap (no new external data source, no new
 * table - this is a query/aggregation over data that already exists).
 *
 * A new session starts whenever the gap between two consecutive matches'
 * `recordedAt` exceeds `gapMinutes` (default 30) - i.e. "you stopped
 * playing for a while, then came back later" is treated as a new
 * session, the same way most game-session-tracking heuristics work.
 */

export interface SessionSummary {
  sessionStart: string;
  sessionEnd: string;
  matches: number;
  wins: number;
  losses: number;
  /** Matches where win/loss couldn't be determined (see MatchHistoryEntry.won doc comment) - excluded from winRatePercent's denominator. */
  undecided: number;
  winRatePercent: number | null;
  avgKd: number | null;
  longestWinStreak: number;
  longestLossStreak: number;
  /** True if the session ENDED on 3+ consecutive losses - a simple, transparent heuristic flag suggesting a break might help, not a judgment call about the player. */
  endedOnLosingStreak: boolean;
  matchesInSession: MatchHistoryEntry[];
}

const DEFAULT_GAP_MINUTES = 30;
/** Consecutive losses at the end of a session before flagging `endedOnLosingStreak`. */
const TILT_STREAK_THRESHOLD = 3;

/** Longest run of consecutive `true`/`false` values in `sequence`, ignoring `null` entries (they neither extend nor break a streak, since they carry no win/loss information either way). */
function longestStreak(sequence: Array<boolean | null>, target: boolean): number {
  let longest = 0;
  let current = 0;
  for (const value of sequence) {
    if (value === null) continue;
    if (value === target) {
      current += 1;
      longest = Math.max(longest, current);
    } else {
      current = 0;
    }
  }
  return longest;
}

/** True if the trailing run of DECIDED (non-null) matches in `sequence` is a loss streak of at least `threshold`. */
function endsOnLossStreak(sequence: Array<boolean | null>, threshold: number): boolean {
  let streak = 0;
  for (let i = sequence.length - 1; i >= 0; i--) {
    const value = sequence[i];
    if (value === null) continue;
    if (value === false) {
      streak += 1;
      if (streak >= threshold) return true;
    } else {
      break;
    }
  }
  return false;
}

function summarizeSession(matches: MatchHistoryEntry[]): SessionSummary {
  const decided = matches.filter((m) => m.won !== null);
  const wins = decided.filter((m) => m.won === true).length;
  const losses = decided.filter((m) => m.won === false).length;

  const kdValues = matches.map((m) => m.kd).filter((v): v is number => v !== null);
  const avgKd = kdValues.length ? Math.round((kdValues.reduce((a, b) => a + b, 0) / kdValues.length) * 100) / 100 : null;

  const wonSequence = matches.map((m) => m.won);

  return {
    sessionStart: matches[0].recordedAt,
    sessionEnd: matches[matches.length - 1].recordedAt,
    matches: matches.length,
    wins,
    losses,
    undecided: matches.length - decided.length,
    winRatePercent: decided.length ? Math.round((wins / decided.length) * 1000) / 10 : null,
    avgKd,
    longestWinStreak: longestStreak(wonSequence, true),
    longestLossStreak: longestStreak(wonSequence, false),
    endedOnLosingStreak: endsOnLossStreak(wonSequence, TILT_STREAK_THRESHOLD),
    matchesInSession: matches,
  };
}

/**
 * @param chronological match_history entries, OLDEST FIRST (see
 * MatchHistoryService.allChronological()).
 * @param gapMinutes minutes of inactivity that starts a new session.
 * @returns sessions ordered MOST RECENT FIRST (matches the rest of the
 * app's "newest first" convention, e.g. MatchHistoryService.list()).
 */
export function buildSessionReport(
  chronological: MatchHistoryEntry[],
  gapMinutes: number = DEFAULT_GAP_MINUTES,
): SessionSummary[] {
  if (chronological.length === 0) return [];

  const gapMs = gapMinutes * 60_000;
  const sessions: MatchHistoryEntry[][] = [];
  let current: MatchHistoryEntry[] = [chronological[0]];

  for (let i = 1; i < chronological.length; i++) {
    const prev = new Date(chronological[i - 1].recordedAt).getTime();
    const curr = new Date(chronological[i].recordedAt).getTime();
    if (curr - prev > gapMs) {
      sessions.push(current);
      current = [];
    }
    current.push(chronological[i]);
  }
  sessions.push(current);

  return sessions.map(summarizeSession).reverse();
}
