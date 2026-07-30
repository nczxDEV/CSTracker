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

/**
 * A single player's line in the match summary roster table.
 *
 * TRANSPARENCY NOTE (matches this project's "never fabricate a stat"
 * principle - see map-pool.util.ts's LEVEL_AVG_PLACEHOLDER doc comment
 * for the established precedent): `adr` and `kast` are `null` whenever
 * the official FACEIT `/matches/{id}/stats` response doesn't actually
 * include that field for this match/game mode - see
 * `FaceitMatchSummary.adrAvailable`/`kastAvailable` for the per-summary
 * flags the frontend uses to show an honest "N/A" instead of a made-up
 * number. `eloChange` is ALWAYS null - FACEIT's public Data API does not
 * expose a per-match ELO delta on any documented endpoint (ELO is only
 * ever available as the player's CURRENT value, not a historical
 * per-match snapshot), so this is a permanent, not per-match, limitation.
 */
export interface FaceitMatchSummaryPlayer {
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
  /** True for the single player with this match's highest MVP count (ties broken by highest kills) - drives the "MVP" star/highlight row in the summary UI. */
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
  /** Always false - see FaceitMatchSummaryPlayer doc comment; kept as an explicit field (rather than the frontend just assuming) so the UI's "why is this N/A" tooltip has a single source of truth. */
  kastAvailable: false;
}
