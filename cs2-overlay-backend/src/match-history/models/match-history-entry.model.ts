/**
 * A single recorded match snapshot for the LOCAL (GSI-sending) player -
 * powers the Control Panel's "My Match History" section (K/D trend over
 * the last N matches).
 *
 * IMPORTANT (compliance): only ever derived from the local player's OWN
 * GSI data (see GsiService - the same allow-list that already excludes
 * position/visibility data for other players). No data about other
 * players is stored here.
 */
export interface MatchHistoryEntry {
  id: string;
  map: string | null;
  ctScore: number | null;
  tScore: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  mvps: number | null;
  score: number | null;
  /** Computed kills/deaths ratio (null if deaths is 0/null, to avoid a divide-by-zero/Infinity value). */
  kd: number | null;
  /**
   * Whether the local player's team won this match - computed by
   * GsiService from `player.team` (CT/T) vs. the final ctScore/tScore at
   * the "gameover" GSI packet. `null` if the player's team couldn't be
   * determined at that moment. Powers the "Session Performance Report"
   * feature's win/loss streak and win-rate calculations, which are not
   * derivable from K/D alone.
   */
  won: boolean | null;
  recordedAt: string; // ISO timestamp - when the match was detected as finished
}

/** Input shape accepted by MatchHistoryService.record() - id/kd/recordedAt are computed internally. */
export interface MatchHistoryInput {
  map: string | null;
  ctScore: number | null;
  tScore: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  mvps: number | null;
  score: number | null;
  won: boolean | null;
}
