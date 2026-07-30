import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from '../../settings/settings.service';
import { withRetry } from './http-retry.util';
import { LeetifyFullProfile, LeetifyPlatformBan, LeetifyRecentMatch } from '../models/leetify-profile.model';

export interface LeetifyRating {
  rating: number | null;
  aim: number | null;
  positioning: number | null;
  utility: number | null;
  opening: number | null;
}

/**
 * Leetify Public CS API client (api-public-docs.cs-prod.leetify.com) -
 * official, documented, ToS-compliant access (leetify.com/app/developer)
 * - NOT unofficial scraping. See leetify-profile.model.ts for the full
 * compliance/transparency notes this client follows (never rescale
 * metrics, never persist Leetify data, always show the official
 * attribution badge in the UI, no per-weapon breakdown since the API
 * doesn't expose one).
 *
 * Two public methods:
 *  - `getPlayerRating()` - the pre-existing, minimal shape (`aim`/
 *    `positioning`/`utility`/`opening`/`rating`) already consumed by the
 *    tracker rows and Player Summary's compact "Leetify Rating" card
 *    (kept unchanged so those call sites needed zero changes).
 *  - `getFullProfile()` - the full profile (ranks, aggregated stats,
 *    recent matches, bans) for the NEW "My Leetify Stats" card on the
 *    Account tab (see AuthModule / account.js).
 *
 * FIELD NAMES: Leetify's OpenAPI schema documents a `rating` object with
 * seven dimensions (aim, positioning, utility, clutch, opening,
 * ct_leetify, t_leetify) and a separate `stats` object (aggregated
 * accuracy/reaction-time/preaim). Every read below goes through
 * `extractNumber()`/`extractString()` with a short list of plausible
 * key-name aliases, so if Leetify's actual JSON uses slightly different
 * casing/naming than assumed here, the affected field simply comes back
 * `null` ("N/A" in the UI) instead of throwing - this client should never
 * crash a request just because of a field-naming mismatch. If you notice
 * a field that's always blank despite having real data on your Leetify
 * profile, check the raw response shape and extend the alias list below.
 */
@Injectable()
export class LeetifyClient {
  private readonly logger = new Logger(LeetifyClient.name);

  constructor(
    private readonly http: HttpService,
    private readonly settings: SettingsService,
  ) {}

  private get isEnabled(): boolean {
    // The base URL always has a real, working default (Leetify's actual
    // API - see configuration.ts), so "configured" only depends on
    // whether the user has entered their own key via the Setup Wizard.
    // An API key is technically optional per Leetify's own docs
    // ("unauthenticated requests are subject to stricter rate limits"),
    // but we require one here so Leetify calls never silently start
    // happening in the background before the user has deliberately
    // opted in via the Setup Wizard.
    return Boolean(this.settings.getLeetifyApiKey());
  }

  private get authHeaders() {
    return { _leetify_key: this.settings.getLeetifyApiKey() as string };
  }

  private get baseUrl(): string {
    return this.settings.getLeetifyApiBaseUrl() as string;
  }

  /**
   * Minimal rating shape - unchanged public contract from the previous
   * (stub) implementation, so every existing call site (tracker rows,
   * Player Summary's "Leetify Rating" card) keeps working with zero
   * changes. `rating` is only populated if Leetify's response includes
   * an explicit combined/overall figure (see class doc comment - we
   * never compute our own average).
   */
  async getPlayerRating(steamId: string): Promise<LeetifyRating | null> {
    const full = await this.fetchProfile(steamId);
    if (!full) return null;
    return {
      rating: full.rating.overall,
      aim: full.rating.aim,
      positioning: full.rating.positioning,
      utility: full.rating.utility,
      opening: full.rating.opening,
    };
  }

  /** Full profile (ranks, aggregated stats, recent matches, bans) - see leetify-profile.model.ts. */
  async getFullProfile(steamId: string): Promise<LeetifyFullProfile | null> {
    return this.fetchProfile(steamId);
  }

  private async fetchProfile(steamId: string): Promise<LeetifyFullProfile | null> {
    if (!this.isEnabled) {
      this.logger.debug('LeetifyClient has no API key configured (Setup Wizard) - returning N/A.');
      return null;
    }

    try {
      const response = await withRetry(
        () =>
          firstValueFrom(
            this.http.get(`${this.baseUrl}/v3/profile`, {
              headers: this.authHeaders,
              params: { steam64_id: steamId },
            }),
          ),
        { logger: this.logger, label: 'Leetify /v3/profile' },
      );
      return this.mapProfileResponse(response.data ?? {});
    } catch (err) {
      this.logger.warn(`Leetify profile request failed for steamId ${steamId}: ${err}`);
      return null;
    }
  }

  private mapProfileResponse(data: any): LeetifyFullProfile {
    const rating = data.rating ?? {};
    const stats = data.stats ?? {};

    const bans: LeetifyPlatformBan[] = Array.isArray(data.bans)
      ? data.bans.map((b: any) => ({
          platform: this.extractString(b, ['platform']),
          banType: this.extractString(b, ['ban_type', 'banType', 'type']),
        }))
      : [];

    const recentMatches: LeetifyRecentMatch[] = Array.isArray(data.recent_matches)
      ? data.recent_matches.map((m: any) => ({
          mapName: this.extractString(m, ['map_name', 'mapName']),
          finishedAt: this.extractString(m, ['finished_at', 'finishedAt']),
          leetifyRating: this.extractNumber(m, ['leetify_rating', 'rating']),
          outcome: this.extractOutcome(m),
        }))
      : [];

    return {
      leetifyUserId: this.extractString(data, ['id', 'leetify_user_id']),
      steamId64: this.extractString(data, ['steam64_id', 'steam_id_64', 'steamId64']),
      name: this.extractString(data, ['name']),
      privacyMode: this.extractString(data, ['privacy_mode', 'privacyMode']),
      winratePercent: this.toPercent(this.extractNumber(data, ['winrate'])),
      totalMatches: this.extractNumber(data, ['total_matches', 'totalMatches']),
      firstMatchDate: this.extractString(data, ['first_match_date', 'firstMatchDate']),
      bans,
      rating: {
        aim: this.extractNumber(rating, ['aim']),
        positioning: this.extractNumber(rating, ['positioning']),
        utility: this.extractNumber(rating, ['utility']),
        clutch: this.extractNumber(rating, ['clutch', 'clutching']),
        opening: this.extractNumber(rating, ['opening', 'opening_duels']),
        ctRating: this.extractNumber(rating, ['ct_leetify', 'ct_rating', 'ctRating']),
        tRating: this.extractNumber(rating, ['t_leetify', 't_rating', 'tRating']),
        overall: this.extractNumber(rating, ['overall', 'leetify_rating', 'rating']),
      },
      stats: {
        accuracyPercent: this.toPercent(this.extractNumber(stats, ['accuracy'])),
        reactionTimeMs: this.extractNumber(stats, ['reaction_time', 'reactionTime', 'reaction_time_ms']),
        preaimDegrees: this.extractNumber(stats, ['preaim']),
      },
      recentMatches,
    };
  }

  /**
   * Some Leetify fields (e.g. `winrate`, `accuracy`) are documented as a
   * 0-1 fraction in the community TS wrapper's example
   * (`profile.winrate * 100`) - converts a 0-1 fraction to a 0-100
   * percentage ONLY when the raw value is plausibly a fraction (<= 1),
   * leaving an already-percentage value (> 1) untouched. This is a
   * presentation nicety (showing "52.3%" instead of "0.523"), not a
   * rescaling of the underlying metric itself (see class doc comment) -
   * Leetify's own guideline #5 example is specifically about NOT
   * rescaling bounded rating dimensions like Aim (0-100) into a
   * different range, which this does not do.
   */
  private toPercent(value: number | null): number | null {
    if (value === null) return null;
    const pct = value <= 1 ? value * 100 : value;
    return Math.round(pct * 10) / 10;
  }

  private extractNumber(source: any, aliases: string[]): number | null {
    if (!source) return null;
    for (const alias of aliases) {
      if (source[alias] !== undefined && source[alias] !== null) {
        const num = Number(source[alias]);
        if (!Number.isNaN(num)) return num;
      }
    }
    return null;
  }

  private extractString(source: any, aliases: string[]): string | null {
    if (!source) return null;
    for (const alias of aliases) {
      if (typeof source[alias] === 'string' && source[alias].length > 0) {
        return source[alias];
      }
    }
    return null;
  }

  private extractOutcome(match: any): 'win' | 'loss' | 'tie' | null {
    const raw = this.extractString(match, ['outcome', 'result']);
    if (raw) {
      const normalized = raw.toLowerCase();
      if (normalized === 'win' || normalized === 'loss' || normalized === 'tie') return normalized;
    }
    if (typeof match?.win === 'boolean') return match.win ? 'win' : 'loss';
    return null;
  }
}
