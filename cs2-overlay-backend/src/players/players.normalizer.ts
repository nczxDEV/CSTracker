import { Injectable } from '@nestjs/common';
import {
  emptyPlayerProfile,
  FaceitMapStat,
  PlayerProfile,
} from './models/player-profile.model';
import { LeetifyRating } from './clients/leetify.client';
import { PremierRating } from './clients/premier.client';
import { SteamBanStatus } from './clients/steam.client';

/**
 * Normalizer layer: merges the differently-shaped responses coming from
 * the various APIs into the shared PlayerProfile model.
 *
 * Principle: every field is optional, missing data stays `null`, and the
 * "sources" array marks which sources actually contributed real data
 * (this backs the "data source badge" on the UI).
 */
@Injectable()
export class PlayersNormalizer {
  merge(
    steamSummary: any | null,
    faceitPlayer: any | null,
    faceitStats: any | null,
    commendations?: {
      friendly: number | null;
      leader: number | null;
      skilled: number | null;
    } | null,
    leetify?: LeetifyRating | null,
    premier?: PremierRating | null,
    faceitHistory?: any | null,
    steamBans?: SteamBanStatus | null,
  ): PlayerProfile {
    const profile = emptyPlayerProfile();

    if (steamSummary) {
      profile.steamId = steamSummary.steamid ?? profile.steamId;
      profile.nickname = steamSummary.personaname ?? profile.nickname;
      profile.avatarUrl = steamSummary.avatarfull ?? profile.avatarUrl;
      profile.sources.push('steam-web-api');
    }

    if (faceitPlayer) {
      profile.nickname = profile.nickname ?? faceitPlayer.nickname ?? null;
      // Fall back to the FACEIT avatar when the Steam avatar is missing
      // (private Steam profile, or Steam lookup failed) - previously only
      // the Steam avatar was used, leaving a blank avatar in that case.
      profile.avatarUrl = profile.avatarUrl ?? faceitPlayer.avatar ?? null;
      profile.faceit = {
        nickname: faceitPlayer.nickname ?? null,
        level:
          faceitPlayer.games?.cs2?.skill_level ??
          faceitPlayer.games?.csgo?.skill_level ??
          null,
        elo:
          faceitPlayer.games?.cs2?.faceit_elo ??
          faceitPlayer.games?.csgo?.faceit_elo ??
          null,
        region: faceitPlayer.games?.cs2?.region ?? null,
        country: faceitPlayer.country ?? null,
        membership: this.pickMembership(faceitPlayer.memberships),
      };
      profile.sources.push('faceit-api');
    }

    if (faceitStats) {
      const lifetime = faceitStats.lifetime ?? {};
      profile.stats = {
        kd: this.toNumber(lifetime['Average K/D Ratio']),
        adr: this.toNumber(lifetime['ADR']),
        hsPercent: this.toNumber(lifetime['Average Headshots %']),
        winRate: this.toNumber(lifetime['Win Rate %']),
        matchesPlayed: this.toNumber(lifetime['Matches']),
        // NOTE: FACEIT's Data API is not fully consistent/documented on
        // this specific field's exact key across all its stat responses
        // - every OTHER per-match-average lifetime field (K/D, HS%) uses
        // an "Average X" prefix, so "Average K/R Ratio" is tried FIRST,
        // falling back to the unprefixed "K/R Ratio" (what a previous
        // version of this code assumed) in case a given account/response
        // actually uses that key instead. This defensive fallback chain
        // means the field resolves correctly regardless of which key
        // FACEIT's API happens to return, instead of gambling on one.
        krRatio: this.toNumber(lifetime['Average K/R Ratio'] ?? lifetime['K/R Ratio']),
        totalHeadshots: this.toNumber(lifetime['Total Headshots']),
        currentWinStreak: this.toNumber(lifetime['Current Win Streak']),
        longestWinStreak: this.toNumber(lifetime['Longest Win Streak']),
      };
      profile.faceitMapStats = this.mapSegments(faceitStats.segments);
      profile.sources.push('faceit-stats-api');
    }

    if (commendations) {
      profile.commendations = commendations;
      profile.sources.push('faceit-commendations');
    }

    if (leetify) {
      profile.leetify = leetify;
      profile.sources.push('leetify-api');
    }

    if (premier) {
      profile.premier = premier;
      profile.sources.push('premier-rating');
    }

    if (faceitHistory && faceitPlayer?.player_id) {
      const allResults = this.computeAllResults(faceitHistory, faceitPlayer.player_id);
      profile.recentResults = allResults ? allResults.slice(0, 5) : null;
      profile.recentForm = this.computeRecentForm(allResults);
      if (profile.recentResults) {
        profile.sources.push('faceit-history-api');
      }
    }

    if (steamBans) {
      profile.steamBans = steamBans;
      profile.sources.push('steam-bans-api');
    }

    profile.lastUpdated = new Date().toISOString();
    return profile;
  }

  /**
   * Computes, from the FACEIT `/players/{id}/history` response (an "items"
   * array where each item has teams.faction1/faction2.players and
   * results.winner), whether the given player won (W) or lost (L) each
   * match, most-recent-first - the FULL list (as many as were fetched,
   * up to 20 - see players.service.ts `getSummary()`), un-truncated.
   * Feeds BOTH `recentResults` (sliced to 5) and `recentForm` (the full
   * up-to-20 list) below.
   */
  private computeAllResults(
    history: any,
    playerId: string,
  ): Array<'W' | 'L'> | null {
    const items = history?.items;
    if (!Array.isArray(items) || items.length === 0) return null;

    const results: Array<'W' | 'L'> = [];
    for (const item of items) {
      const teams = item?.teams ?? {};
      const winnerFaction = item?.results?.winner;
      let playerFaction: string | null = null;

      for (const factionKey of Object.keys(teams)) {
        const players = teams[factionKey]?.players ?? [];
        if (players.some((p: any) => p?.player_id === playerId)) {
          playerFaction = factionKey;
          break;
        }
      }

      if (playerFaction && winnerFaction) {
        results.push(playerFaction === winnerFaction ? 'W' : 'L');
      }
    }

    return results.length > 0 ? results : null;
  }

  /**
   * Builds the GSI-free "Recent Form" stats (last up-to-20 matches) from
   * the same W/L list `computeAllResults()` produces - current active
   * streak, longest win/loss streak, and win rate over the window.
   * Powers the Player Summary tab's "Recent Form" card and the
   * "Dodge or Play" feature's tilt detection (see dodge-or-play.util.ts).
   */
  private computeRecentForm(
    allResults: Array<'W' | 'L'> | null,
  ): PlayerProfile['recentForm'] {
    if (!allResults || allResults.length === 0) return null;

    const last20Results = allResults.slice(0, 20);
    const wins = last20Results.filter((r) => r === 'W').length;
    const winRateLast20Percent = Math.round((wins / last20Results.length) * 1000) / 10;

    // Current streak: count consecutive identical results starting from
    // the most recent (index 0) match backwards in time.
    const currentType = last20Results[0];
    let currentCount = 0;
    for (const r of last20Results) {
      if (r !== currentType) break;
      currentCount++;
    }
    const currentStreak = { type: currentType === 'W' ? ('win' as const) : ('loss' as const), count: currentCount };

    let longestWinStreak = 0;
    let longestLossStreak = 0;
    let runType: 'W' | 'L' | null = null;
    let runLength = 0;
    for (const r of last20Results) {
      if (r === runType) {
        runLength++;
      } else {
        runType = r;
        runLength = 1;
      }
      if (runType === 'W') longestWinStreak = Math.max(longestWinStreak, runLength);
      else longestLossStreak = Math.max(longestLossStreak, runLength);
    }

    return {
      last20Results,
      matchesConsidered: last20Results.length,
      winRateLast20Percent,
      currentStreak,
      longestWinStreak,
      longestLossStreak,
    };
  }

  /**
   * Turns the FACEIT stats API "segments" array (e.g. "Map: de_mirage"
   * style breakdowns) into the FaceitMapStat list used by the "Faceit
   * stats in detail" view.
   */
  private mapSegments(segments: any[] | undefined): FaceitMapStat[] | null {
    if (!segments || !Array.isArray(segments) || segments.length === 0) {
      return null;
    }
    return segments
      .filter((segment) => segment?.type === 'Map')
      .map((segment) => {
        const stats = segment.stats ?? {};
        return {
          map: segment.label ?? segment.mode ?? 'unknown',
          matches: this.toNumber(stats['Matches']),
          winRatePercent: this.toNumber(stats['Win Rate %']),
          avgKd: this.toNumber(stats['Average K/D Ratio']),
          avgHsPercent: this.toNumber(stats['Average Headshots %']),
          avgMvps: this.toNumber(stats['Average MVPs']),
          tripleKills: this.toNumber(stats['Triple Kills']),
          quadroKills: this.toNumber(stats['Quadro Kills']),
          pentaKills: this.toNumber(stats['Penta Kills']),
        };
      });
  }

  /**
   * FACEIT Data API player objects expose a "memberships" array (e.g.
   * `["free"]` or `["free", "premium"]`) rather than a single field - we
   * pick the "highest" tier present for a simple UI badge. Falls back to
   * `null` ("N/A") if the field is missing entirely (best-effort, since
   * this isn't documented as a stable field).
   */
  private pickMembership(memberships: unknown): string | null {
    if (!Array.isArray(memberships) || memberships.length === 0) return null;
    if (memberships.includes('premium')) return 'premium';
    if (memberships.includes('free')) return 'free';
    return String(memberships[0]);
  }

  private toNumber(value: unknown): number | null {
    if (value === undefined || value === null) return null;
    const parsed = parseFloat(String(value));
    return Number.isNaN(parsed) ? null : parsed;
  }
}
