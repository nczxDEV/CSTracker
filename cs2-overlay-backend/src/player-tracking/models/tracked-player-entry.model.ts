/**
 * "Player Tracking" feature - lets the user track ANY FACEIT player (not
 * necessarily someone they're playing with) by nickname, and get a
 * Discord alert whenever that player's next match finishes.
 *
 * IMPORTANT SCOPE/COMPLIANCE NOTE: this only works for FACEIT players.
 * FACEIT's public Data API exposes match history + detailed match stats
 * for ANY player by their FACEIT player_id (see FaceitClient
 * getPlayerHistory/getMatchStats), which is what makes this feature
 * possible in a ToS-compliant, official-API-only way. Valve does NOT
 * expose an equivalent public API for CS2 Premier/Casual/Deathmatch
 * match history for arbitrary players - there is no legitimate way to
 * track a non-FACEIT player's matches unless they happen to be in your
 * OWN current GSI-reported match (a separate, existing feature - see
 * GsiService "My Match History").
 */
export interface TrackedPlayerEntry {
  id: string; // lowercased FACEIT nickname - the stable key
  identifier: string; // original-cased nickname the user entered
  faceitPlayerId: string | null;
  displayName: string | null;
  lastSeenMatchId: string | null;
  addedAt: string; // ISO timestamp
}

/** Result of a single finished match for a tracked player - passed to DiscordAlertsService.notifyTrackedPlayerMatchResult(). */
export interface TrackedPlayerMatchResult {
  displayName: string;
  won: boolean;
  map: string | null;
  kills: number | null;
  deaths: number | null;
  kd: number | null;
  adr: number | null;
}
