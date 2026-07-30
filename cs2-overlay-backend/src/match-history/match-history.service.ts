import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import { MatchHistoryEntry, MatchHistoryInput } from './models/match-history-entry.model';

interface MatchHistoryRow {
  id: string;
  map: string | null;
  ct_score: number | null;
  t_score: number | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  mvps: number | null;
  score: number | null;
  /** Stored as 1/0/NULL (SQLite has no native boolean type) - see `won` on MatchHistoryEntry. */
  won: number | null;
  recorded_at: string;
}

/** Keep at most this many rows - old matches are pruned automatically on insert, so the table/UI never grows unbounded. */
const MAX_RETAINED_MATCHES = 200;

/**
 * "My Match History" feature - persists a snapshot of the LOCAL player's
 * own match stats (see GsiService "rising edge" detection of
 * map.phase === 'gameover') so the Control Panel can show a simple K/D
 * trend over the last N matches.
 *
 * SQLite-based (DatabaseModule), matching the existing notes/saved-players
 * persistence pattern in this codebase.
 */
@Injectable()
export class MatchHistoryService {
  private readonly logger = new Logger(MatchHistoryService.name);

  constructor(private readonly database: DatabaseService) {}

  record(input: MatchHistoryInput): MatchHistoryEntry {
    const id = crypto.randomUUID();
    const recordedAt = new Date().toISOString();

    const wonValue = input.won === null || input.won === undefined ? null : input.won ? 1 : 0;

    this.database.connection
      .prepare(
        `INSERT INTO match_history
          (id, map, ct_score, t_score, kills, deaths, assists, mvps, score, won, recorded_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        input.map,
        input.ctScore,
        input.tScore,
        input.kills,
        input.deaths,
        input.assists,
        input.mvps,
        input.score,
        wonValue,
        recordedAt,
      );

    this.prune();
    this.logger.debug(
      `Match recorded: map=${input.map}, K/D=${input.kills}/${input.deaths}, won=${input.won}`,
    );

    return this.toEntry({
      id,
      map: input.map,
      ct_score: input.ctScore,
      t_score: input.tScore,
      kills: input.kills,
      deaths: input.deaths,
      assists: input.assists,
      mvps: input.mvps,
      score: input.score,
      won: wonValue,
      recorded_at: recordedAt,
    });
  }

  /** Most recent matches first, limited to `limit` (default 20, capped at MAX_RETAINED_MATCHES). */
  list(limit = 20): MatchHistoryEntry[] {
    const capped = Math.min(Math.max(1, limit), MAX_RETAINED_MATCHES);
    const rows = this.database.connection
      .prepare('SELECT * FROM match_history ORDER BY recorded_at DESC LIMIT ?')
      .all(capped) as unknown as MatchHistoryRow[];
    return rows.map((row) => this.toEntry(row));
  }

  clearAll(): void {
    this.database.connection.exec('DELETE FROM match_history');
  }

  /** Deletes rows beyond MAX_RETAINED_MATCHES (oldest first) so the table never grows unbounded. */
  private prune(): void {
    this.database.connection
      .prepare(
        `DELETE FROM match_history WHERE id NOT IN (
           SELECT id FROM match_history ORDER BY recorded_at DESC LIMIT ?
         )`,
      )
      .run(MAX_RETAINED_MATCHES);
  }

  private toEntry(row: MatchHistoryRow): MatchHistoryEntry {
    const kd =
      row.kills !== null && row.deaths !== null && row.deaths > 0
        ? Math.round((row.kills / row.deaths) * 100) / 100
        : row.kills !== null && (row.deaths === null || row.deaths === 0) && row.kills > 0
          ? row.kills // no deaths but at least one kill - report raw kills as the "ratio" (avoids divide-by-zero)
          : null;

    return {
      id: row.id,
      map: row.map,
      ctScore: row.ct_score,
      tScore: row.t_score,
      kills: row.kills,
      deaths: row.deaths,
      assists: row.assists,
      mvps: row.mvps,
      score: row.score,
      kd,
      won: row.won === null ? null : Boolean(row.won),
      recordedAt: row.recorded_at,
    };
  }

  /**
   * ALL recorded matches, oldest-first - used by SessionsService to
   * cluster matches into sessions by time gap. Deliberately separate
   * from `list()` (which is newest-first and limit-capped for the UI's
   * "recent matches" view) to keep both call sites' intent obvious.
   */
  allChronological(): MatchHistoryEntry[] {
    const rows = this.database.connection
      .prepare('SELECT * FROM match_history ORDER BY recorded_at ASC')
      .all() as unknown as MatchHistoryRow[];
    return rows.map((row) => this.toEntry(row));
  }
}
