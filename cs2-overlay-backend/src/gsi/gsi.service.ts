import { Injectable, Logger } from '@nestjs/common';
import { GsiRosterPlayer, GsiState, GsiStateOrDisconnected } from './models/gsi-state.model';
import { MatchHistoryService } from '../match-history/match-history.service';
import { MatchContextService } from '../match-context/match-context.service';
import { DiscordAlertsService } from '../discord/discord-alerts.service';

/** If the last GSI packet is older than this many ms, we consider it "disconnected". */
const STALE_THRESHOLD_MS = 15_000;

/**
 * Game State Integration (GSI) processing service.
 *
 * The CS2 client sends the local match state via HTTP POST to a local URL
 * we specify (see `gamestate_integration_*.cfg`), through the official,
 * Valve-documented GSI mechanism. This is NOT memory reading, NOT
 * injection - CS2 sends the data itself, through Valve's official,
 * documented interface.
 *
 * *** CRITICAL COMPLIANCE RULE ***
 * This service and its `.cfg` file must NEVER request/process
 * `position`, `forward`, `velocity`, or another player's `state`
 * (health/armor for OTHER players) data - these could be used to build a
 * wallhack/radar-like feature, which would violate fair-play principles
 * and VAC rules. Therefore:
 *   1. In the sample config (`gamestate_integration_cs2overlay.cfg`) the
 *      `allplayers_position`, `allplayers_state`, `allplayers_weapons` and
 *      `player_weapons` fields are DISABLED (`"0"`) - CS2 won't even send
 *      these in the first place.
 *   2. This `sanitize*` logic uses a strict ALLOW-LIST (only
 *      name/team/kill-death-assist/mvp/score gets through) - even if the
 *      user accidentally enables something else in the cfg, we drop it
 *      here and log it; it never reaches the API response.
 */
@Injectable()
export class GsiService {
  private readonly logger = new Logger(GsiService.name);
  private latestState: GsiState | null = null;

  /**
   * Tracks the previous packet's `map.phase` value, so we can detect the
   * RISING EDGE into "gameover" (i.e. "wasn't gameover a moment ago, is
   * now") - this is the "match just finished" signal used to record a
   * "My Match History" snapshot exactly once per match, instead of once
   * per GSI packet (CS2 keeps sending "gameover" packets repeatedly while
   * on the end-of-match screen).
   */
  private previousMapPhase: string | null = null;

  constructor(
    private readonly matchHistoryService: MatchHistoryService,
    private readonly matchContext: MatchContextService,
    private readonly discordAlerts: DiscordAlertsService,
  ) {}

  /** Processes and sanitizes the raw GSI payload. */
  ingest(payload: any): void {
    const allplayers = payload?.allplayers ?? payload?.allplayers_id ?? {};
    const suspiciousSteamIds: string[] = [];

    const roster: GsiRosterPlayer[] = Object.entries<any>(allplayers).map(
      ([steamId, raw]) => {
        if (raw && (raw.position || raw.forward || raw.velocity || raw.state)) {
          suspiciousSteamIds.push(steamId);
        }
        return this.sanitizeRosterPlayer(steamId, raw);
      },
    );

    if (suspiciousSteamIds.length > 0) {
      this.logger.warn(
        `The GSI payload contained fields (position/forward/velocity/state for ` +
          `other players) that were dropped due to the compliance rule. Check your ` +
          `gamestate_integration cfg! Affected steamIds: ${suspiciousSteamIds.join(', ')}`,
      );
    }

    const mapBlock = payload?.map ?? {};
    const playerBlock = payload?.player ?? null;
    const playerStats = playerBlock?.match_stats ?? {};
    const playerState = playerBlock?.state ?? {};

    const currentPhase: string | null = mapBlock.phase ?? null;
    const isMatchJustFinished = currentPhase === 'gameover' && this.previousMapPhase !== 'gameover';
    this.previousMapPhase = currentPhase;

    // Keep the Discord Alerts match-type heuristic up to date on every
    // packet - see MatchContextService for what this feeds into.
    this.matchContext.setGsiMode(mapBlock.mode ?? null);

    this.latestState = {
      connected: true,
      receivedAt: new Date().toISOString(),
      map: {
        name: mapBlock.name ?? null,
        phase: mapBlock.phase ?? null,
        round: mapBlock.round ?? null,
        ctScore: mapBlock.team_ct?.score ?? null,
        tScore: mapBlock.team_t?.score ?? null,
        mode: mapBlock.mode ?? null,
      },
      localPlayer: playerBlock
        ? {
            steamId: playerBlock.steamid ?? null,
            name: playerBlock.name ?? null,
            team: this.normalizeTeam(playerBlock.team),
            kills: playerStats.kills ?? null,
            deaths: playerStats.deaths ?? null,
            assists: playerStats.assists ?? null,
            mvps: playerStats.mvps ?? null,
            score: playerStats.score ?? null,
            // The local player's own health/armor/money data - this IS
            // allowed, because it's information about the user themselves,
            // which they can already see on their own HUD.
            health: playerState.health ?? null,
            armor: playerState.armor ?? null,
            money: playerState.money ?? null,
          }
        : null,
      roster,
    };

    // "My Match History" - record exactly one snapshot per finished match
    // (rising edge into "gameover", see `isMatchJustFinished` above), using
    // ONLY the local player's own stats (never other players' data).
    if (isMatchJustFinished && playerBlock) {
      const ctScore = mapBlock.team_ct?.score ?? null;
      const tScore = mapBlock.team_t?.score ?? null;
      const recordedEntry = this.matchHistoryService.record({
        map: mapBlock.name ?? null,
        ctScore,
        tScore,
        kills: playerStats.kills ?? null,
        deaths: playerStats.deaths ?? null,
        assists: playerStats.assists ?? null,
        mvps: playerStats.mvps ?? null,
        score: playerStats.score ?? null,
        won: this.computeWon(this.normalizeTeam(playerBlock.team), ctScore, tScore),
      });

      // Discord "Match finished" alert (see DiscordModule) - best-effort/
      // non-fatal, never let a webhook failure affect GSI ingestion.
      this.discordAlerts.notifyMatchFinished(recordedEntry).catch((err) => {
        this.logger.warn(`Discord match-finished alert failed: ${err}`);
      });
    }
  }

  getState(): GsiStateOrDisconnected {
    if (!this.latestState) return { connected: false };
    const ageMs = Date.now() - new Date(this.latestState.receivedAt).getTime();
    if (ageMs > STALE_THRESHOLD_MS) {
      return { connected: false };
    }
    return this.latestState;
  }

  /** SteamIds of the current roster - used by the frontend / PlayersService to replace the "manual 10 players" flow. */
  getRosterSteamIds(): string[] {
    const state = this.getState();
    if (!state.connected) return [];
    return state.roster.map((p) => p.steamId).filter(Boolean);
  }

  private sanitizeRosterPlayer(steamId: string, raw: any): GsiRosterPlayer {
    const stats = raw?.match_stats ?? {};
    return {
      steamId,
      name: raw?.name ?? null,
      team: this.normalizeTeam(raw?.team),
      kills: stats.kills ?? null,
      deaths: stats.deaths ?? null,
      assists: stats.assists ?? null,
      mvps: stats.mvps ?? null,
      score: stats.score ?? null,
    };
  }

  private normalizeTeam(value: unknown): 'CT' | 'T' | null {
    return value === 'CT' || value === 'T' ? value : null;
  }

  /**
   * Determines whether the LOCAL player's own team won the match, from
   * their side (CT/T) and the final map scoreboard - powers the "Session
   * Performance Report" feature's win/loss streak and win-rate math,
   * which K/D alone can't provide (a player can go positive K/D in a
   * loss, or negative in a win). Only ever uses the local player's own
   * team assignment - no other players' data is involved.
   *
   * NOTE: this is a simple side-vs-final-score comparison. It doesn't
   * (and structurally can't from GSI alone) account for a mid-match side
   * switch across multiple halves the way the game's own scoreboard
   * does at a rounds level - for the vast majority of standard
   * competitive/premier matches (decided by total rounds won, not by
   * which side you started on) this comparison is exactly equivalent to
   * "did I win", since `ctScore`/`tScore` already reflect the final,
   * cumulative round tally for whichever side each team ended up on.
   */
  private computeWon(
    playerTeam: 'CT' | 'T' | null,
    ctScore: number | null,
    tScore: number | null,
  ): boolean | null {
    if (!playerTeam || ctScore === null || tScore === null || ctScore === tScore) {
      return null;
    }
    const ctWon = ctScore > tScore;
    return playerTeam === 'CT' ? ctWon : !ctWon;
  }
}
