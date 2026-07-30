/**
 * Normalized PlayerProfile model.
 * Every external API (FACEIT, Steam, csstats.gg, etc.) is mapped onto this
 * shared structure so the overlay UI can render it uniformly, regardless
 * of which source the data came from.
 */
export interface PlayerProfile {
  steamId: string | null;
  nickname: string | null;
  avatarUrl: string | null;

  faceit: {
    nickname: string | null;
    level: number | null;
    elo: number | null;
    region: string | null;
    /** ISO 3166-1 alpha-2 country code (e.g. "se", "br") - powers the flag icon in the UI. */
    country: string | null;
    /** FACEIT membership tier ("free" / "premium" / etc.) - powers a small badge in the UI. */
    membership: string | null;
  } | null;

  stats: {
    kd: number | null;
    adr: number | null;
    hsPercent: number | null;
    winRate: number | null;
    matchesPlayed: number | null;
    /** Kills per round - FACEIT lifetime stat "K/R Ratio". */
    krRatio: number | null;
    /** Lifetime total headshot count - FACEIT lifetime stat "Total Headshots%"/"Total Headshots". */
    totalHeadshots: number | null;
    /** Current active win streak - FACEIT lifetime stat "Current Win Streak". */
    currentWinStreak: number | null;
    /** Longest win streak ever recorded - FACEIT lifetime stat "Longest Win Streak". */
    longestWinStreak: number | null;
  } | null;

  /**
   * Map-level FACEIT stat breakdown ("Faceit stats in detail" feature).
   * Normalized from the FACEIT Data API's /players/{id}/stats/cs2
   * response "segments" array (grouped by map name).
   */
  faceitMapStats: FaceitMapStat[] | null;

  /** CS2 Premier rating ("CS Rating" feature). */
  premier: {
    rating: number | null;
    seasonWins: number | null;
  } | null;

  /**
   * Leetify rating and partial skill breakdown ("Leetify ratings" feature).
   * IMPORTANT: Leetify does not currently publish an official, documented
   * third-party API. This field stays `null` / shows "N/A" in the UI until
   * `LeetifyClient` is wired to an approved, ToS-compliant data source
   * (e.g. a partner API or the user's own export).
   */
  leetify: {
    rating: number | null;
    aim: number | null;
    positioning: number | null;
    utility: number | null;
    opening: number | null;
  } | null;

  /**
   * FACEIT commendation counters ("commendations" feature): Friendly,
   * Leader, Skilled. Best-effort field - if the official Data API doesn't
   * return commendation data, stays `null` and the UI shows "N/A".
   */
  commendations: {
    friendly: number | null;
    leader: number | null;
    skilled: number | null;
  } | null;

  /**
   * Result (W/L) of the most recent matches (max. 5, most recent first) -
   * the "RECENT RESULTS" feature on the saved-player card. Computed from
   * the official FACEIT Data API `/players/{id}/history` endpoint: we
   * check which team (faction1/faction2) the player was on, and whether
   * that team won.
   */
  recentResults: Array<'W' | 'L'> | null;

  /**
   * GSI-FREE recent form over the last 20 FACEIT matches - "My Match
   * History" (match-history module) needs a live GSI connection and only
   * ever covers the LOCAL player; this covers ANY player (including
   * teammates/opponents you've never played with) purely from the
   * official FACEIT Data API's `/players/{id}/history` endpoint (the
   * SAME response `recentResults` above is derived from, just not
   * truncated to 5) - no extra API call. Powers the Player Summary tab's
   * "Recent Form" card AND the "Dodge or Play" feature's tilt detection
   * (see dodge-or-play.util.ts `computeTiltScore`).
   */
  recentForm: {
    /** Up to 20 results, most recent first. */
    last20Results: Array<'W' | 'L'>;
    /** How many of last20Results are actually available (FACEIT may have fewer than 20 matches on record). */
    matchesConsidered: number;
    winRateLast20Percent: number | null;
    /** The player's CURRENT active streak (right now, most recent match backwards) - null if last20Results is empty. */
    currentStreak: { type: 'win' | 'loss'; count: number } | null;
    longestWinStreak: number;
    longestLossStreak: number;
  } | null;

  /**
   * Public Steam VAC/game ban status ("safety indicator" feature) - the
   * same information visible on the player's Steam Community profile
   * page, retrieved through the official `GetPlayerBans` endpoint.
   */
  steamBans: {
    vacBanned: boolean;
    gameBanCount: number;
    daysSinceLastBan: number | null;
    communityBanned: boolean;
  } | null;

  lastUpdated: string; // ISO timestamp
  sources: string[]; // e.g. ['faceit-api', 'steam-web-api']
}

export interface FaceitMapStat {
  map: string;
  matches: number | null;
  winRatePercent: number | null;
  avgKd: number | null;
  avgHsPercent: number | null;
  /** Average MVPs per match on this map (FACEIT segment stat "Average MVPs"). */
  avgMvps: number | null;
  /** Total triple/quadro/penta (3k/4k/5k) kills recorded on this map. */
  tripleKills: number | null;
  quadroKills: number | null;
  pentaKills: number | null;
}

export function emptyPlayerProfile(): PlayerProfile {
  return {
    steamId: null,
    nickname: null,
    avatarUrl: null,
    faceit: null,
    stats: null,
    faceitMapStats: null,
    premier: null,
    leetify: null,
    commendations: null,
    recentResults: null,
    recentForm: null,
    steamBans: null,
    lastUpdated: new Date().toISOString(),
    sources: [],
  };
}
