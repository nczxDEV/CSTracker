/**
 * "My Leetify Stats" feature (Account tab) - the FULL Leetify profile for
 * the local user's linked Steam account, via the official Leetify Public
 * CS API (`GET /v3/profile` - api-public-docs.cs-prod.leetify.com).
 *
 * TRANSPARENCY / COMPLIANCE NOTE (Leetify Developer Guidelines,
 * leetify.com/blog/leetify-api-developer-guidelines):
 *  - Every field below is read directly from Leetify's response, never
 *    rescaled/recalculated/renamed ("Do not modify our metrics" - see
 *    guideline #5) - a field is `null` whenever Leetify's response
 *    genuinely doesn't include it (defensive alias-based extraction, see
 *    leetify.client.ts `extractNumber()`/`extractString()`), rather than
 *    guessed or derived from other fields.
 *  - NEVER persisted to this app's own SQLite database or any file (see
 *    guideline #6, "Do not store data") - `LeetifyClient` is called
 *    fresh on every request, nothing from this shape is cached beyond
 *    the single HTTP response's lifetime.
 *  - The UI showing this data MUST display the official "Data Provided
 *    by Leetify" badge (see cs2-overlay-frontend
 *    assets/leetify/leetify-badge-black-small.png) - see account.js.
 *  - There is intentionally NO per-weapon (e.g. AK-47/M4A4/AWP spray)
 *    breakdown here - the official Public API does not expose one, only
 *    the aggregated `rating`/`stats` fields below. Do not add a
 *    per-weapon field to this model without confirming Leetify's API
 *    actually documents one.
 */
export interface LeetifyRatingDimensions {
  /** 0-100 scale, per Leetify's own documented presentation - never rescaled to a 0-1/percentage form. */
  aim: number | null;
  /** 0-100 scale. */
  positioning: number | null;
  /** 0-100 scale. */
  utility: number | null;
  /** Signed delta-style score (NOT 0-100) - shown as a plain +/- number, never bar-charted alongside the 0-100 dimensions above. */
  clutch: number | null;
  /** Signed delta-style score (NOT 0-100). */
  opening: number | null;
  /** Per-side Leetify Rating (CT). */
  ctRating: number | null;
  /** Per-side Leetify Rating (T). */
  tRating: number | null;
  /** Combined/overall Leetify Rating, ONLY populated if Leetify's response includes an explicit overall figure - deliberately NEVER computed as our own average of ctRating/tRating (see class doc comment - would violate "do not recalculate our metrics"). */
  overall: number | null;
}

export interface LeetifyAggregatedStats {
  /** Overall/aggregated aim accuracy - NOT a per-weapon breakdown (see class doc comment). */
  accuracyPercent: number | null;
  reactionTimeMs: number | null;
  preaimDegrees: number | null;
}

export interface LeetifyRecentMatch {
  mapName: string | null;
  finishedAt: string | null;
  /** This match's Leetify Rating, if Leetify's `recent_matches` entry included one. */
  leetifyRating: number | null;
  /** 'win' | 'loss' | 'tie' | null - only set if Leetify's response made the outcome unambiguous. */
  outcome: 'win' | 'loss' | 'tie' | null;
}

export interface LeetifyPlatformBan {
  platform: string | null;
  banType: string | null;
}

export interface LeetifyFullProfile {
  leetifyUserId: string | null;
  steamId64: string | null;
  name: string | null;
  /** 'public' | 'private' | null - a 'private' profile means `recentMatches` will be empty even though the account itself was found. */
  privacyMode: string | null;
  winratePercent: number | null;
  totalMatches: number | null;
  firstMatchDate: string | null;
  bans: LeetifyPlatformBan[];
  rating: LeetifyRatingDimensions;
  stats: LeetifyAggregatedStats;
  recentMatches: LeetifyRecentMatch[];
}
