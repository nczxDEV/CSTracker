/**
 * Sanitized, ToS-safe GSI state model.
 *
 * INTENTIONALLY does NOT include any position (`position`, `forward`,
 * `velocity`) or visibility (`state` - health/armor for OTHER players)
 * field from the `allplayers` block - using those, you could effectively
 * build a wallhack/radar feature, which this project INTENTIONALLY and
 * PERMANENTLY excludes (see GsiService.sanitizeRosterPlayer - an
 * allow-list style field extraction, not "take everything, then strip").
 */
export interface GsiRosterPlayer {
  steamId: string;
  name: string;
  team: 'CT' | 'T' | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  mvps: number | null;
  score: number | null;
}

export interface GsiState {
  connected: true;
  receivedAt: string; // ISO timestamp - when the last GSI packet was received
  map: {
    name: string | null;
    phase: string | null;
    round: number | null;
    ctScore: number | null;
    tScore: number | null;
    /** Raw GSI game mode (e.g. "competitive", "casual", "deathmatch") - used for the Discord Alerts match-type heuristic, see MatchContextService. */
    mode: string | null;
  };
  /** Only the LOCAL (GSI-sending) player's own data - this is allowed, since it's the user's own player. */
  localPlayer: {
    steamId: string | null;
    name: string | null;
    team: 'CT' | 'T' | null;
    kills: number | null;
    deaths: number | null;
    assists: number | null;
    mvps: number | null;
    score: number | null;
    health: number | null;
    armor: number | null;
    money: number | null;
  } | null;
  /** NAME/TEAM/MATCH STAT level data for every player on the server - WITHOUT position. */
  roster: GsiRosterPlayer[];
}

export type GsiStateOrDisconnected = GsiState | { connected: false };
