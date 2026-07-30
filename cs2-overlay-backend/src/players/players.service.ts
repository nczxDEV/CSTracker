import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { CACHE_MANAGER } from '@nestjs/cache-manager';
import type { Cache } from 'cache-manager';
import { FaceitClient } from './clients/faceit.client';
import { SteamClient } from './clients/steam.client';
import { LeetifyClient } from './clients/leetify.client';
import { PremierClient } from './clients/premier.client';
import { PlayersNormalizer } from './players.normalizer';
import { PlayerProfile } from './models/player-profile.model';
import { MatchroomResolution } from './models/matchroom-resolution.model';
import { DodgeOrPlayResult } from './models/dodge-or-play.model';
import { TimePerformanceResult } from './models/time-performance.model';
import { parseMatchroomInput } from './matchroom.util';
import { buildDodgeOrPlayResult } from './dodge-or-play.util';
import { buildTimePerformance } from './time-performance.util';
import { buildMatchHistoryList, buildMatchSummary } from './faceit-match-history.util';
import { FaceitMatchHistoryItem, FaceitMatchSummary } from './models/faceit-match-history.model';

/** How many recent matches the "FACEIT Match History" section's list view fetches - a lighter sample than Time Performance's 100, since this is a visible scrolling list, not a statistical aggregate. */
const FACEIT_MATCH_HISTORY_LIST_LIMIT = 20;

/** Max matches fetched for the "Time Performance" feature - a much larger sample than the 20 used for `recentForm` elsewhere, since a meaningful hour/day heatmap needs more data points. This is FACEIT's own documented per-request maximum for the history endpoint. */
const TIME_PERFORMANCE_HISTORY_LIMIT = 100;
import { DiscordAlertsService } from '../discord/discord-alerts.service';

const STEAM_ID_REGEX = /^\d{17}$/;
/** Simple limiter so a 10-player roster resolve doesn't fan out unlimited concurrent external API calls at once. */
const MAX_CONCURRENT_RESOLVES = 3;
/** Optional "steam:" / "faceit:" prefix (case-insensitive) to force which platform an identifier is resolved against - see `parseIdentifier`. */
const FORCED_SOURCE_PREFIX_REGEX = /^(steam|faceit):(.+)$/i;
type ForcedSource = 'steam' | 'faceit' | null;

@Injectable()
export class PlayersService {
  private readonly logger = new Logger(PlayersService.name);

  constructor(
    private readonly faceitClient: FaceitClient,
    private readonly steamClient: SteamClient,
    private readonly leetifyClient: LeetifyClient,
    private readonly premierClient: PremierClient,
    private readonly normalizer: PlayersNormalizer,
    @Inject(CACHE_MANAGER) private readonly cache: Cache,
    private readonly discordAlerts: DiscordAlertsService,
  ) {}

  /**
   * Single entry point: accepts a SteamID64, FACEIT nickname, or Steam
   * vanity name, and returns the normalized profile.
   *
   * *** Platform name-collision bug (fixed) ***
   * Steam vanity URLs (steamcommunity.com/id/<name>) and FACEIT nicknames
   * are two COMPLETELY INDEPENDENT namespaces - a totally unrelated Steam
   * user can coincidentally own the vanity URL matching the FACEIT
   * nickname you're actually searching for. The previous implementation
   * always tried Steam's vanity-URL resolver FIRST for any non-numeric
   * identifier, and - if that happened to find a match - used THAT
   * (unrelated) Steam account's linked FACEIT profile instead of
   * searching FACEIT by the nickname you typed. In practice this could
   * silently return a completely different player (e.g. searching the
   * FACEIT nickname "xadez" could return an unrelated Steam user's
   * linked FACEIT account "kero-ker", because that unrelated Steam user
   * happened to own steamcommunity.com/id/xadez).
   *
   * Fix: for a plain name (not a raw 17-digit SteamID64), a FACEIT
   * nickname match is now tried FIRST, and the associated Steam account
   * is derived from FACEIT's OWN linked `game_player_id` field (which
   * FACEIT itself verified when the user linked their Steam account),
   * NOT from Steam's unrelated vanity-URL namespace. Steam's vanity
   * resolver is only used as a fallback when no FACEIT nickname matches
   * at all.
   *
   * For full manual control, an identifier can also be prefixed with
   * `steam:` or `faceit:` (case-insensitive, e.g. `faceit:xadez` or
   * `steam:xadez`) to force which platform it's resolved against,
   * skipping the auto-detection entirely.
   */
  async getSummary(rawIdentifier: string): Promise<PlayerProfile> {
    const { identifier, forcedSource } = this.parseIdentifier(rawIdentifier);
    const cacheKey = `player-summary:${forcedSource ?? 'auto'}:${identifier.toLowerCase()}`;
    const cached = await this.cache.get<PlayerProfile>(cacheKey);
    if (cached) {
      this.logger.debug(`Cache hit: ${rawIdentifier}`);
      return cached;
    }

    let steamId: string | null = null;
    let faceitPlayer: any | null = null;

    if (forcedSource === 'steam') {
      steamId = STEAM_ID_REGEX.test(identifier) ? identifier : await this.steamClient.resolveVanityUrl(identifier);
      faceitPlayer = steamId ? await this.faceitClient.getPlayerBySteamId(steamId) : null;
    } else if (forcedSource === 'faceit') {
      faceitPlayer = await this.faceitClient.getPlayerByNickname(identifier);
      steamId = this.extractLinkedSteamId(faceitPlayer);
    } else if (STEAM_ID_REGEX.test(identifier)) {
      // Unambiguous: a raw SteamID64 was provided directly - no
      // cross-platform name-collision risk at all.
      steamId = identifier;
      faceitPlayer = await this.faceitClient.getPlayerBySteamId(steamId);
    } else {
      // Auto-detect for a plain name: FACEIT nickname takes priority -
      // see the method doc comment above for why.
      faceitPlayer = await this.faceitClient.getPlayerByNickname(identifier);
      steamId = this.extractLinkedSteamId(faceitPlayer);
      if (!steamId) {
        // No FACEIT nickname match (or no linked Steam account on that
        // FACEIT profile) - fall back to treating the identifier as a
        // Steam vanity URL name.
        steamId = await this.steamClient.resolveVanityUrl(identifier);
        if (steamId && !faceitPlayer) {
          faceitPlayer = await this.faceitClient.getPlayerBySteamId(steamId);
        }
      }
    }

    const steamSummary = steamId ? await this.steamClient.getPlayerSummary(steamId) : null;

    const faceitStats = faceitPlayer?.player_id
      ? await this.faceitClient.getPlayerStats(faceitPlayer.player_id)
      : null;

    if (!steamSummary && !faceitPlayer) {
      throw new NotFoundException({
        error: 'PLAYER_NOT_FOUND',
        message: 'No public FACEIT or Steam profile found for this identifier.',
        sourceAttempted: ['faceit-api', 'steam-web-api'],
      });
    }

    const resolvedSteamId = steamSummary?.steamid ?? steamId ?? null;

    const [commendations, leetify, premier, faceitHistory, steamBans] = await Promise.all([
      faceitPlayer?.player_id
        ? this.faceitClient.getPlayerCommendations(faceitPlayer.player_id)
        : Promise.resolve(null),
      resolvedSteamId
        ? this.leetifyClient.getPlayerRating(resolvedSteamId)
        : Promise.resolve(null),
      resolvedSteamId
        ? this.premierClient.getPlayerRating(resolvedSteamId)
        : Promise.resolve(null),
      // Fetches 20 (not just 5) - the normalizer derives BOTH the
      // existing 5-item `recentResults` AND the new 20-item
      // `recentForm` (GSI-free "Recent Form" card + "Dodge or Play"
      // tilt detection) from this SAME response, so this one call
      // covers both features with no extra FACEIT API usage.
      faceitPlayer?.player_id
        ? this.faceitClient.getPlayerHistory(faceitPlayer.player_id, 20)
        : Promise.resolve(null),
      resolvedSteamId
        ? this.steamClient.getPlayerBans(resolvedSteamId)
        : Promise.resolve(null),
    ]);

    const profile = this.normalizer.merge(
      steamSummary,
      faceitPlayer,
      faceitStats,
      commendations,
      leetify,
      premier,
      faceitHistory,
      steamBans,
    );

    await this.cache.set(cacheKey, profile);
    return profile;
  }

  /**
   * Splits an optional `steam:`/`faceit:` prefix (case-insensitive) off
   * an identifier, e.g. "faceit:xadez" -> { identifier: "xadez",
   * forcedSource: "faceit" }. No prefix -> forcedSource: null (auto-detect).
   */
  private parseIdentifier(raw: string): { identifier: string; forcedSource: ForcedSource } {
    const trimmed = raw.trim();
    const match = FORCED_SOURCE_PREFIX_REGEX.exec(trimmed);
    if (match) {
      return {
        identifier: match[2].trim(),
        forcedSource: match[1].toLowerCase() as ForcedSource,
      };
    }
    return { identifier: trimmed, forcedSource: null };
  }

  /**
   * Extracts the SteamID64 FACEIT itself has linked to a player's
   * account (FACEIT Data API's `games.cs2.game_player_id` /
   * `games.csgo.game_player_id` field, verified by FACEIT when the user
   * linked their Steam account) - this is the TRUSTED source of a
   * FACEIT-to-Steam association, unlike Steam's unrelated vanity-URL
   * namespace (see the class-level doc comment on `getSummary`).
   */
  private extractLinkedSteamId(faceitPlayer: any | null): string | null {
    const linked =
      faceitPlayer?.games?.cs2?.game_player_id ??
      faceitPlayer?.games?.csgo?.game_player_id ??
      null;
    return linked && STEAM_ID_REGEX.test(linked) ? linked : null;
  }

  /**
   * Resolves multiple identifiers (max. 10, enforced by ResolvePlayersDto)
   * with bounded concurrency, so a full roster lookup doesn't blast the
   * external APIs with 10 simultaneous requests each (FACEIT + Steam +
   * Leetify + Premier = up to 40 outbound calls at once otherwise).
   *
   * Results are returned in the SAME ORDER as the input identifiers (the
   * frontend splits the roster into Team A / Team B by array position),
   * with failed lookups simply omitted rather than shifting later entries.
   */
  async resolveMany(identifiers: string[]): Promise<PlayerProfile[]> {
    const results: Array<PlayerProfile | undefined> = new Array(identifiers.length);
    let cursor = 0;

    const worker = async () => {
      while (cursor < identifiers.length) {
        const index = cursor++;
        const id = identifiers[index];
        try {
          results[index] = await this.getSummary(id);
        } catch (err) {
          this.logger.warn(`Resolve failed for identifier "${id}": ${err}`);
        }
      }
    };

    const workers = Array.from(
      { length: Math.min(MAX_CONCURRENT_RESOLVES, identifiers.length) },
      () => worker(),
    );
    await Promise.all(workers);
    const resolved = results.filter((p): p is PlayerProfile => Boolean(p));

    // Discord "VAC-banned player in the room" alert (see DiscordModule) -
    // fired here because this method is the single funnel for BOTH the
    // manually-pasted 10-player roster (POST /match/resolve-players) and
    // the live GSI roster (GsiController.getRoster()). Best-effort/
    // non-fatal - never let an alert failure affect the actual lookup.
    this.discordAlerts.notifyVacBanDetected(resolved).catch((err) => {
      this.logger.warn(`Discord VAC-ban alert failed: ${err}`);
    });

    return resolved;
  }

  /**
   * "Load from Matchroom" feature - given a FACEIT matchroom URL (or a
   * raw match ID), fetches the official match lineup (both team
   * rosters) via FaceitClient.getMatchDetails() and resolves every
   * player into a full normalized profile, reusing `resolveMany()` (the
   * exact same bounded-concurrency + Discord VAC-ban-alert pipeline
   * already used by the manual 10-player roster and the live GSI
   * roster) - so this is really just a THIRD way to feed that same
   * pipeline, not a separate lookup path.
   */
  async resolveMatchroom(rawInput: string): Promise<MatchroomResolution> {
    const matchId = parseMatchroomInput(rawInput);
    if (!matchId) {
      throw new NotFoundException({
        error: 'MATCHROOM_INVALID_INPUT',
        message: 'Please paste a FACEIT matchroom link or match ID.',
      });
    }

    const matchDetails = await this.faceitClient.getMatchDetails(matchId);
    if (!matchDetails) {
      throw new NotFoundException({
        error: 'MATCHROOM_NOT_FOUND',
        message:
          'Could not find a FACEIT match for this link/ID. Double-check the matchroom URL and that your FACEIT API key is configured (Setup & GSI tab).',
        sourceAttempted: ['faceit-api'],
      });
    }

    const faction1Roster: any[] = matchDetails.teams?.faction1?.roster ?? [];
    const faction2Roster: any[] = matchDetails.teams?.faction2?.roster ?? [];

    const [teamA, teamB] = await Promise.all([
      this.resolveMany(faction1Roster.map((p) => this.identifierForRosterPlayer(p))),
      this.resolveMany(faction2Roster.map((p) => this.identifierForRosterPlayer(p))),
    ]);

    return {
      matchId,
      competitionName: matchDetails.competition_name ?? null,
      status: matchDetails.status ?? null,
      faceitUrl: matchDetails.faceit_url ?? null,
      teamA,
      teamB,
    };
  }

  /**
   * Resolves a matchroom roster entry into an identifier for
   * `resolveMany()`/`getSummary()`. Prefers the FACEIT-verified linked
   * Steam ID (`game_player_id`) when present - the same TRUSTED
   * FACEIT-to-Steam association used by `extractLinkedSteamId()` below,
   * which sidesteps the Steam vanity-URL name-collision risk entirely.
   * Falls back to a FACEIT-forced nickname lookup (`faceit:<nickname>`)
   * when no linked Steam ID is present on the roster entry.
   */
  private identifierForRosterPlayer(rosterPlayer: any): string {
    const linkedSteamId = rosterPlayer?.game_player_id;
    if (linkedSteamId && STEAM_ID_REGEX.test(linkedSteamId)) {
      return linkedSteamId;
    }
    const nickname = rosterPlayer?.nickname || rosterPlayer?.game_player_name || '';
    return `faceit:${nickname}`;
  }

  /**
   * "Dodge or Play" feature - reuses `resolveMatchroom()` (so it's the
   * SAME matchroom link/ID input as "Load from Matchroom", no separate
   * lookup path) and, since every resolved PlayerProfile ALREADY carries
   * `stats` (K/D, win rate, HS%, matches played) and `recentForm` (last
   * 20 FACEIT results - see players.normalizer.ts), the actual smurf/tilt
   * scoring in dodge-or-play.util.ts needs ZERO additional FACEIT API
   * calls beyond what resolveMatchroom() already makes.
   */
  async computeDodgeOrPlay(rawInput: string): Promise<DodgeOrPlayResult> {
    const matchroom = await this.resolveMatchroom(rawInput);
    return buildDodgeOrPlayResult(
      matchroom.matchId,
      matchroom.competitionName,
      matchroom.faceitUrl,
      matchroom.teamA,
      matchroom.teamB,
    );
  }

  /**
   * "Time Performance" feature - GSI-FREE win-rate-by-hour/day-of-week
   * breakdown for ANY FACEIT nickname the user types in (not just the
   * local GSI-sending player - that's what makes this different from
   * "My Match History"/"Session Performance Report", which both require
   * a live GSI connection and only ever cover the local player).
   *
   * Resolves the identifier to a FACEIT player_id using the same
   * auto-detect/forced-source convention as `getSummary()` (a plain name
   * tries FACEIT first, `steam:`/`faceit:` prefixes force a platform),
   * but deliberately does NOT reuse `getSummary()` itself - this feature
   * only needs a FACEIT player_id, not the full profile (Steam/Leetify/
   * Premier/bans), and needs a MUCH larger history sample (100 matches)
   * than `getSummary()`'s cached 20-item fetch, so keeping this as an
   * independent, focused resolution avoids fetching data this feature
   * doesn't use.
   */
  async getTimePerformance(rawInput: string): Promise<TimePerformanceResult> {
    const { identifier } = this.parseIdentifier(rawInput);
    const faceitPlayer = await this.resolveFaceitPlayerOnly(rawInput);

    if (!faceitPlayer?.player_id) {
      throw new NotFoundException({
        error: 'PLAYER_NOT_FOUND',
        message: 'No public FACEIT profile found for this identifier.',
        sourceAttempted: ['faceit-api'],
      });
    }

    const history = await this.faceitClient.getPlayerHistory(
      faceitPlayer.player_id,
      TIME_PERFORMANCE_HISTORY_LIMIT,
    );

    return buildTimePerformance(
      identifier,
      faceitPlayer.nickname || identifier,
      history,
      faceitPlayer.player_id,
    );
  }

  /**
   * Resolves an identifier to a FACEIT player object (SteamID64, FACEIT
   * nickname, or `steam:`/`faceit:`-prefixed), for FACEIT-only features
   * that have no reason to fall back to a Steam vanity-URL lookup (their
   * data only ever exists for FACEIT accounts anyway) - shared by
   * `getTimePerformance()`, `getFaceitMatchHistory()`, and
   * `getFaceitMatchSummary()`. Returns `null` (never throws) if no
   * FACEIT player could be found - each caller decides its own
   * feature-appropriate 404 wording.
   */
  private async resolveFaceitPlayerOnly(rawInput: string): Promise<any | null> {
    const { identifier, forcedSource } = this.parseIdentifier(rawInput);
    if (forcedSource === 'steam') {
      const steamId = STEAM_ID_REGEX.test(identifier)
        ? identifier
        : await this.steamClient.resolveVanityUrl(identifier);
      return steamId ? await this.faceitClient.getPlayerBySteamId(steamId) : null;
    }
    if (STEAM_ID_REGEX.test(identifier)) {
      return await this.faceitClient.getPlayerBySteamId(identifier);
    }
    return await this.faceitClient.getPlayerByNickname(identifier);
  }

  /**
   * "FACEIT Match History" feature (Player Summary tab) - GSI-FREE list
   * of the identifier's recent FACEIT matches (map/per-player stats are
   * intentionally NOT included here - see faceit-match-history.util.ts
   * doc comment for why; only fetched lazily for a single match by
   * `getFaceitMatchSummary()` below, once the user clicks into it).
   */
  async getFaceitMatchHistory(rawInput: string): Promise<FaceitMatchHistoryItem[]> {
    const faceitPlayer = await this.resolveFaceitPlayerOnly(rawInput);
    if (!faceitPlayer?.player_id) {
      throw new NotFoundException({
        error: 'PLAYER_NOT_FOUND',
        message: 'No public FACEIT profile found for this identifier.',
        sourceAttempted: ['faceit-api'],
      });
    }

    const history = await this.faceitClient.getPlayerHistory(
      faceitPlayer.player_id,
      FACEIT_MATCH_HISTORY_LIST_LIMIT,
    );
    return buildMatchHistoryList(history, faceitPlayer.player_id);
  }

  /**
   * "FACEIT Match History" detail view - the full per-match summary (both
   * team rosters, K/D/A, ADR/HS%, MVP) for a SINGLE match, shown in a
   * separate popup window (see src-tauri/src/main.rs
   * `open_match_summary_window` / match-summary.js) once the user clicks
   * a row in the list `getFaceitMatchHistory()` above returns.
   *
   * Unlike `getFaceitMatchHistory()`, this does NOT need to resolve the
   * `rawInput` identifier to a specific player at all - a FACEIT match ID
   * uniquely identifies the match regardless of who's asking, so this is
   * really just a thin, cached-free pass-through to
   * `FaceitClient.getMatchDetails()`/`getMatchStats()`. The `identifier`
   * param is accepted (and part of the route) purely for a consistent,
   * predictable REST shape with the rest of this controller
   * (`/players/:identifier/...`) - it is not otherwise used.
   */
  async getFaceitMatchSummary(matchId: string): Promise<FaceitMatchSummary> {
    const [matchDetails, matchStats] = await Promise.all([
      this.faceitClient.getMatchDetails(matchId),
      this.faceitClient.getMatchStats(matchId),
    ]);

    const summary = buildMatchSummary(matchDetails, matchStats, matchId);
    if (!summary) {
      throw new NotFoundException({
        error: 'MATCH_NOT_FOUND',
        message:
          'Could not find this FACEIT match. Double-check the match ID and that your FACEIT API key is configured (Setup & GSI tab).',
        sourceAttempted: ['faceit-api'],
      });
    }
    return summary;
  }
}
