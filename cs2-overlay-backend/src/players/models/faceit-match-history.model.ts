/**
 * "FACEIT Match History" feature - GSI-FREE (works for ANY FACEIT
 * nickname, not just the local GSI-sending player - see "My Match
 * History"/session-report.util.ts for that GSI-only equivalent) list of
 * a player's recent FACEIT matches, plus a detailed per-match summary
 * (both team rosters, K/D/A, headshot %, MVP) for a single match once
 * the user clicks into it - see faceit-match-history.util.ts for the
 * full methodology and its documented limitations.
 */

export interface FaceitMatchHistoryItem {
  assists?: number | null;
  adr?: number | null;
  roundsPlayed?: number | null;
  map?: string | null;
  teammates?: string[];
  kills?: number | null;
  deaths?: number | null;
  source?: 'faceit-api';
  fetchedAt?: string;
  faceitRating?: number | null;
  matchId: string;
  competitionName: string | null;
  /** ISO 8601, null if the raw FACEIT history item had no usable timestamp. */
  startedAt: string | null;
  finishedAt: string | null;
  /** Win/loss for the identifier this list was requested for - null if it couldn't be determined (e.g. the player wasn't found in either faction's roster). */
  result: 'W' | 'L' | null;
  /** The requested player's own team score for this match. */
  teamScore: number | null;
  /** The opposing team's score. */
  opponentScore: number | null;
  opponentTeamName: string | null;
}

/** Provider-supplied match statistics. Missing fields remain null/absent, never estimated. */
export interface FaceitMatchSummaryPlayer {
  steamId?: string | null;
  elo?: number | null;
  kast?: number | null;
  damage?: number | null;
  headshots?: number | null;
  spottedAccuracy?: number | null;
  swing?: number | null;
  firstKills?: number | null;
  firstDeaths?: number | null;
  tradeKills?: number | null;
  tradedDeaths?: number | null;
  enemiesFlashed?: number | null;
  flashAssists?: number | null;
  utilityDamage?: number | null;
  clutchWins?: number | null;
  doubleKills?: number | null;
  tripleKills?: number | null;
  quadKills?: number | null;
  aces?: number | null;
  roundsPlayed?: number | null;
  utilityCount?: number | null;
  flashCount?: number | null;
  entryCount?: number | null;
  entryWins?: number | null;
  oneVOneWins?: number | null;
  oneVTwoWins?: number | null;
  faceitRating?: number | null;
  playerId: string;
  nickname: string;
  avatar: string | null;
  /** Player's skill level AT THE TIME of this match's roster snapshot (FACEIT `/matches/{id}` roster data), not necessarily their CURRENT level. */
  skillLevel: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  /** K/D ratio, as reported directly by FACEIT (not recomputed) when present. */
  kd: number | null;
  /** K/R (kills per round) ratio, as reported directly by FACEIT when present. */
  kr: number | null;
  headshotsPercent: number | null;
  /** Average Damage per Round - null (see class doc comment) if FACEIT didn't provide it for this match. */
  adr: number | null;
  mvps: number | null;
  /** True for players tied at the highest supplied FACEIT Rating - drives the "MVP" star/highlight row in the summary UI. */
  isMatchMvp: boolean;
}

export interface FaceitMatchSummaryTeam {
  name: string;
  score: number | null;
  won: boolean | null;
  /** Average of this team's players' `skillLevel` (see FaceitMatchSummaryPlayer), null if no player has a known level. */
  avgSkillLevel: number | null;
  players: FaceitMatchSummaryPlayer[];
}

export interface FaceitMatchSummary {
  matchId: string;
  competitionName: string | null;
  /** Best-effort - null if the match details response didn't include a map pick (see faceit-match-history.util.ts). */
  map: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationSeconds: number | null;
  teamA: FaceitMatchSummaryTeam;
  teamB: FaceitMatchSummaryTeam;
  mvpNickname: string | null;
  /** Whether ANY player in this match had a non-null `adr` - lets the UI show one honest "ADR not available for this match" notice instead of per-row "N/A" clutter when the whole match lacks it. */
  adrAvailable: boolean;
  /** Whether any player has a provider-supplied KAST value. */
  kastAvailable: boolean;
  schemaVersion?: number;
  fetchedAt?: string;
  source?: string;
}
