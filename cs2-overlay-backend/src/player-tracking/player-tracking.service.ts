import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { DatabaseService } from '../database/database.service';
import { FaceitClient } from '../players/clients/faceit.client';
import { DiscordAlertsService } from '../discord/discord-alerts.service';
import { TrackedPlayerEntry } from './models/tracked-player-entry.model';

interface TrackedPlayerRow {
  id: string;
  identifier: string;
  faceit_player_id: string | null;
  display_name: string | null;
  last_seen_match_id: string | null;
  added_at: string;
}

/** How often to poll FACEIT for each tracked player's latest match - frequent enough to notify reasonably promptly, without hammering the FACEIT API for potentially many tracked players. */
const POLL_INTERVAL_MS = 3 * 60 * 1000;

/**
 * "Player Tracking" feature - see the model file's header comment for the
 * full rationale/scope (FACEIT-only, via FACEIT's public history + match
 * stats endpoints).
 *
 * Flow:
 *   1. User adds a FACEIT nickname to track (`addTrackedPlayer`) - we
 *      resolve it to a FACEIT player_id and record their CURRENT most
 *      recent match as a "baseline" (so we don't immediately fire an
 *      alert for a match that already happened before tracking started).
 *   2. Every `POLL_INTERVAL_MS`, `pollAllTrackedPlayers()` checks each
 *      tracked player's latest match via FACEIT's history endpoint. If
 *      it's a NEW match_id (not the stored baseline/last-seen one), we
 *      fetch that match's detailed stats, extract the tracked player's
 *      personal K/D/kills/deaths/map and whether their team won, and
 *      send a Discord alert via DiscordAlertsService.
 */
@Injectable()
export class PlayerTrackingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PlayerTrackingService.name);
  private pollTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly database: DatabaseService,
    private readonly faceitClient: FaceitClient,
    private readonly discordAlerts: DiscordAlertsService,
  ) {}

  onModuleInit() {
    this.pollTimer = setInterval(() => {
      this.pollAllTrackedPlayers().catch((err) => {
        this.logger.warn(`Tracked player poll cycle failed: ${err}`);
      });
    }, POLL_INTERVAL_MS);
  }

  onModuleDestroy() {
    if (this.pollTimer) clearInterval(this.pollTimer);
  }

  list(): TrackedPlayerEntry[] {
    const rows = this.database.connection
      .prepare('SELECT * FROM tracked_players ORDER BY added_at DESC')
      .all() as unknown as TrackedPlayerRow[];
    return rows.map((row) => this.toEntry(row));
  }

  async addTrackedPlayer(rawIdentifier: string): Promise<TrackedPlayerEntry> {
    const identifier = rawIdentifier.trim();
    const id = identifier.toLowerCase();

    const faceitPlayer = await this.faceitClient.getPlayerByNickname(identifier);
    if (!faceitPlayer?.player_id) {
      throw new BadRequestException({
        error: 'FACEIT_PLAYER_NOT_FOUND',
        message:
          `No FACEIT player found with the nickname "${identifier}". Player Tracking ` +
          `only supports FACEIT nicknames (see the hint text) - double-check the spelling.`,
      });
    }

    // Establish a baseline from their CURRENT most recent match, so we
    // don't fire an alert the moment they're added for a match that
    // already happened before tracking started - only matches AFTER this
    // point trigger an alert (see pollOne()).
    const history = await this.faceitClient.getPlayerHistory(faceitPlayer.player_id, 1);
    const baselineMatchId: string | null = history?.items?.[0]?.match_id ?? null;

    const addedAt = new Date().toISOString();
    this.database.connection
      .prepare(
        `INSERT INTO tracked_players
          (id, identifier, faceit_player_id, display_name, last_seen_match_id, added_at)
         VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           identifier = excluded.identifier,
           faceit_player_id = excluded.faceit_player_id,
           display_name = excluded.display_name,
           added_at = excluded.added_at`,
      )
      .run(id, identifier, faceitPlayer.player_id, faceitPlayer.nickname ?? identifier, baselineMatchId, addedAt);

    this.logger.log(`Now tracking FACEIT player "${identifier}" (baseline match: ${baselineMatchId ?? 'none yet'}).`);

    return this.toEntry({
      id,
      identifier,
      faceit_player_id: faceitPlayer.player_id,
      display_name: faceitPlayer.nickname ?? identifier,
      last_seen_match_id: baselineMatchId,
      added_at: addedAt,
    });
  }

  removeTrackedPlayer(id: string): void {
    const key = id.toLowerCase();
    const existing = this.database.connection
      .prepare('SELECT id FROM tracked_players WHERE id = ?')
      .get(key);
    if (!existing) {
      throw new NotFoundException({
        error: 'TRACKED_PLAYER_NOT_FOUND',
        message: 'This player is not currently tracked.',
      });
    }
    this.database.connection.prepare('DELETE FROM tracked_players WHERE id = ?').run(key);
  }

  private async pollAllTrackedPlayers(): Promise<void> {
    const rows = this.database.connection
      .prepare('SELECT * FROM tracked_players')
      .all() as unknown as TrackedPlayerRow[];

    for (const row of rows) {
      try {
        await this.pollOne(row);
      } catch (err) {
        this.logger.warn(`Poll failed for tracked player "${row.identifier}": ${err}`);
      }
    }
  }

  private async pollOne(row: TrackedPlayerRow): Promise<void> {
    if (!row.faceit_player_id) return;

    const history = await this.faceitClient.getPlayerHistory(row.faceit_player_id, 1);
    const latestMatchId: string | null = history?.items?.[0]?.match_id ?? null;
    if (!latestMatchId || latestMatchId === row.last_seen_match_id) {
      return; // nothing new since the last check
    }

    // Update last_seen_match_id BEFORE attempting the (potentially
    // failing) stats fetch/Discord send below - this ensures a
    // transient error never causes the SAME match to be retried forever
    // on every subsequent poll (which could otherwise spam repeated
    // alerts once whatever was failing recovers).
    this.database.connection
      .prepare('UPDATE tracked_players SET last_seen_match_id = ? WHERE id = ?')
      .run(latestMatchId, row.id);

    const matchStats = await this.faceitClient.getMatchStats(latestMatchId);
    const result = this.extractPlayerResult(matchStats, row.faceit_player_id);
    if (!result) {
      this.logger.warn(
        `Could not extract match stats for tracked player "${row.identifier}" (match ${latestMatchId}) - skipping alert.`,
      );
      return;
    }

    await this.discordAlerts.notifyTrackedPlayerMatchResult({
      displayName: row.display_name ?? row.identifier,
      won: result.won,
      map: result.map,
      kills: result.kills,
      deaths: result.deaths,
      kd: result.kd,
      adr: result.adr,
    });
  }

  /**
   * Parses a FACEIT `/matches/{id}/stats` response to find the given
   * player's personal stats and whether their team won. Uses the FIRST
   * round entry (CS2 matchmaking/FACEIT matches are single-map, so this
   * covers the standard case).
   */
  private extractPlayerResult(
    matchStats: any | null,
    playerId: string,
  ): { won: boolean; map: string | null; kills: number | null; deaths: number | null; kd: number | null; adr: number | null } | null {
    const round = matchStats?.rounds?.[0];
    if (!round) return null;

    for (const team of round.teams ?? []) {
      const player = (team.players ?? []).find((p: any) => p?.player_id === playerId);
      if (!player) continue;

      const stats = player.player_stats ?? {};
      return {
        won: team.team_stats?.['Team Win'] === '1',
        map: round.round_stats?.Map ?? null,
        kills: this.toNumber(stats['Kills']),
        deaths: this.toNumber(stats['Deaths']),
        kd: this.toNumber(stats['K/D Ratio']),
        adr: this.toNumber(stats['ADR']),
      };
    }
    return null;
  }

  private toNumber(value: unknown): number | null {
    if (value === undefined || value === null) return null;
    const parsed = parseFloat(String(value));
    return Number.isNaN(parsed) ? null : parsed;
  }

  private toEntry(row: TrackedPlayerRow): TrackedPlayerEntry {
    return {
      id: row.id,
      identifier: row.identifier,
      faceitPlayerId: row.faceit_player_id,
      displayName: row.display_name,
      lastSeenMatchId: row.last_seen_match_id,
      addedAt: row.added_at,
    };
  }
}
