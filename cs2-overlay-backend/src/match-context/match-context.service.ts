import { Injectable } from '@nestjs/common';

export type MatchType = 'premier' | 'casual' | 'unknown';

/**
 * Tiny in-memory "what kind of match is currently being played" tracker.
 * Used to let Discord alerts (see DiscordModule) be filtered by match
 * type ("only alert me during Premier matches, not casual/DM practice").
 *
 * IMPORTANT - why this is a best-effort HEURISTIC, not an authoritative
 * signal: CS2's official Game State Integration (GSI) only ever reports
 * generic mode values ("competitive", "casual", "deathmatch",
 * "scrimcomp2v2", "gungameprogressive", etc.) via `map.mode` - it does
 * not distinguish FACEIT/third-party matches from Valve matchmaking at
 * all. Classification works as follows:
 *
 *   1. "Premier / Competitive" - inferred from GSI's `map.mode ===
 *      'competitive'`.
 *   2. Anything else GSI reports (deathmatch, casual, wingman, arms race,
 *      etc.) is classified as "Casual / Other".
 *   3. "Unknown" - no GSI connection / no mode reported yet.
 *
 * This is intentionally simple and transparent (documented in the
 * Control Panel's Discord Alerts section) - it's a best-effort filter,
 * not a guarantee.
 */
@Injectable()
export class MatchContextService {
  private gsiMode: string | null = null;

  /** Called by GsiService on every ingested packet with the raw `map.mode` value. */
  setGsiMode(mode: string | null): void {
    this.gsiMode = mode;
  }

  classify(): MatchType {
    if (this.gsiMode === 'competitive') return 'premier';
    if (!this.gsiMode) return 'unknown';
    return 'casual';
  }
}
