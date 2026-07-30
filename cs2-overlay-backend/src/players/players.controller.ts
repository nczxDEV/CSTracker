import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PlayersService } from './players.service';
import { ResolvePlayersDto } from './dto/resolve-players.dto';
import { ResolveMatchroomDto } from './dto/resolve-matchroom.dto';
import { DodgeOrPlayDto } from './dto/dodge-or-play.dto';
import { EloHistoryService } from '../elo-history/elo-history.service';
import { buildMapPoolResponse } from './map-pool.util';

@Controller()
@UseGuards(ThrottlerGuard) // global rate limit protection on the gateway endpoints
export class PlayersController {
  constructor(
    private readonly playersService: PlayersService,
    private readonly eloHistory: EloHistoryService,
  ) {}

  /**
   * GET /players/search?query=s1mple
   * Simple search by name / Steam ID / FACEIT nickname.
   */
  @Get('players/search')
  async search(@Query('query') query: string) {
    return this.playersService.getSummary(query);
  }

  /**
   * GET /players/:identifier/summary
   * Normalized, full player card data (FACEIT + Steam + CS Rating +
   * Leetify + commendations + recentResults + steamBans - every feature
   * in one call). The "note" field is NOT part of this response - notes
   * are exclusively part of the "saved players" feature, see
   * SavedPlayersModule (`/saved-players`), and only appear in the Control
   * Panel (main app), not on the overlay.
   */
  @Get('players/:identifier/summary')
  async summary(@Param('identifier') identifier: string) {
    return this.playersService.getSummary(identifier);
  }

  /**
   * GET /players/:identifier/faceit
   * "Faceit stats in detail" view: FACEIT rank/elo + lifetime stats +
   * per-map breakdown (faceitMapStats) + commendations + recentResults.
   */
  @Get('players/:identifier/faceit')
  async faceitDetail(@Param('identifier') identifier: string) {
    const profile = await this.playersService.getSummary(identifier);
    return {
      steamId: profile.steamId,
      nickname: profile.nickname,
      faceit: profile.faceit,
      stats: profile.stats,
      faceitMapStats: profile.faceitMapStats,
      commendations: profile.commendations,
      recentResults: profile.recentResults,
      lastUpdated: profile.lastUpdated,
    };
  }

  /**
   * GET /players/:identifier/leetify
   * "Leetify ratings" view (rating + aim/positioning/utility/opening).
   * Returns N/A until a ToS-compliant Leetify data source is configured.
   */
  @Get('players/:identifier/leetify')
  async leetifyDetail(@Param('identifier') identifier: string) {
    const profile = await this.playersService.getSummary(identifier);
    return { steamId: profile.steamId, leetify: profile.leetify };
  }

  /**
   * GET /players/:identifier/premier
   * "CS Rating" view (CS2 Premier rating). N/A for other players until
   * there's an official public API or manual entry (see PremierClient).
   */
  @Get('players/:identifier/premier')
  async premierDetail(@Param('identifier') identifier: string) {
    const profile = await this.playersService.getSummary(identifier);
    return { steamId: profile.steamId, premier: profile.premier };
  }

  /**
   * GET /players/:identifier/safety
   * "Safety indicator" view: public Steam VAC/game ban status.
   */
  @Get('players/:identifier/safety')
  async safetyDetail(@Param('identifier') identifier: string) {
    const profile = await this.playersService.getSummary(identifier);
    return { steamId: profile.steamId, steamBans: profile.steamBans };
  }

  /**
   * GET /players/:identifier/elo-forecast
   * "ELO Forecast" card (Player Summary tab) - records a new ELO
   * snapshot for this identifier (if it changed since the last check,
   * see EloHistoryService.record()) and returns the full trend/forecast:
   * current ELO, next-level target, a simple linear-regression estimate
   * of ELO gained per match, and an estimated number of matches until
   * the next FACEIT level is reached.
   */
  @Get('players/:identifier/elo-forecast')
  async eloForecast(@Param('identifier') identifier: string) {
    const profile = await this.playersService.getSummary(identifier);
    const elo = profile.faceit?.elo ?? null;
    if (elo !== null) {
      this.eloHistory.record(identifier, elo);
    }
    return this.eloHistory.buildForecast(identifier, elo);
  }

  /**
   * GET /players/:identifier/map-pool
   * "Map Pool Radar" card (Player Summary tab) - reshapes the existing
   * FACEIT per-map breakdown (profile.faceitMapStats) into a radar-chart-
   * ready shape (canonical map key for icon lookup, best/worst map by
   * win rate). See `map-pool.util.ts` for the documented limitation
   * around the "level average" comparison line (placeholder, not real
   * per-level aggregated data yet).
   */
  @Get('players/:identifier/map-pool')
  async mapPool(@Param('identifier') identifier: string) {
    const profile = await this.playersService.getSummary(identifier);
    return buildMapPoolResponse(identifier, profile);
  }

  /**
   * GET /players/:identifier/time-performance
   * "Time Performance" tab - GSI-free win-rate-by-hour/day-of-week
   * breakdown for ANY FACEIT nickname (see
   * PlayersService.getTimePerformance() / time-performance.util.ts for
   * the full methodology). Independent lookup - has its own nickname
   * input on the Time Performance tab, not tied to the Player Summary
   * tab's currently-shown player.
   */
  @Get('players/:identifier/time-performance')
  async timePerformance(@Param('identifier') identifier: string) {
    return this.playersService.getTimePerformance(identifier);
  }

  /**
   * GET /players/:identifier/faceit-match-history
   * "FACEIT Match History" section (Player Summary tab) - GSI-FREE list
   * of this identifier's recent FACEIT matches (map/nickname/score/W-L),
   * each entry clickable in the UI to open the full per-match summary
   * (see the next endpoint) in a separate popup window.
   */
  @Get('players/:identifier/faceit-match-history')
  async faceitMatchHistory(@Param('identifier') identifier: string) {
    return this.playersService.getFaceitMatchHistory(identifier);
  }

  /**
   * GET /players/:identifier/faceit-match-history/:matchId
   * "FACEIT Match History" detail view - the full per-match summary
   * (both team rosters, K/D/A, ADR/HS%, MVP) for a single match, powering
   * the separate "Match Summary" popup window (see match-summary.js /
   * src-tauri/src/main.rs `open_match_summary_window`). See
   * PlayersService.getFaceitMatchSummary() for why `:identifier` isn't
   * actually used to look this up (a match ID is already unique).
   */
  @Get('players/:identifier/faceit-match-history/:matchId')
  async faceitMatchSummary(@Param('matchId') matchId: string) {
    return this.playersService.getFaceitMatchSummary(matchId);
  }

  /**
   * POST /match/resolve-players
   * MVP manually-entered roster of up to 10 players.
   */
  @Post('match/resolve-players')
  async resolveMatch(@Body() dto: ResolvePlayersDto) {
    return this.playersService.resolveMany(dto.identifiers);
  }

  /**
   * POST /match/resolve-matchroom
   * "Load from Matchroom" feature - accepts a FACEIT matchroom URL (or a
   * raw match ID) and automatically resolves both teams' full rosters,
   * via the official FACEIT Data API `GET /matches/{match_id}` endpoint
   * (no scraping - public match lineup data). Returns
   * `{ matchId, competitionName, status, faceitUrl, teamA, teamB }` -
   * teamA/teamB are already resolved PlayerProfile arrays (see
   * PlayersService.resolveMatchroom()).
   */
  @Post('match/resolve-matchroom')
  async resolveMatchroom(@Body() dto: ResolveMatchroomDto) {
    return this.playersService.resolveMatchroom(dto.url);
  }

  /**
   * POST /match/dodge-or-play
   * "Dodge or Play" feature - same input as /match/resolve-matchroom (a
   * FACEIT matchroom URL or raw match ID). Flags likely smurf accounts
   * and currently-tilted players on BOTH squads (see
   * dodge-or-play.util.ts for the full, documented methodology - a
   * transparent rules-based heuristic over public FACEIT stats, not a
   * fact-checked accusation), and returns a PLAY/DODGE recommendation
   * with an Elo-based win probability estimate.
   */
  @Post('match/dodge-or-play')
  async dodgeOrPlay(@Body() dto: DodgeOrPlayDto) {
    return this.playersService.computeDodgeOrPlay(dto.url);
  }
}
