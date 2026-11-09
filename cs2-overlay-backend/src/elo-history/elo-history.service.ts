import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import { EloForecast, EloHistoryEntry, FaceitLevelThreshold } from './models/elo-history-entry.model';

interface EloHistoryRow {
  id: string;
  identifier: string;
  elo: number;
  recorded_at: string;
}

/** Keep at most this many snapshots PER IDENTIFIER - old points are pruned automatically on insert. */
const MAX_RETAINED_PER_IDENTIFIER = 300;

/**
 * Official FACEIT CS2 Elo -> skill level thresholds (support.faceit.com
 * "FACEIT CS2 Elo and skill levels") - mirrors the same table used by the
 * frontend's tracker-render.js `FACEIT_LEVEL_THRESHOLDS`, so the "next
 * level" target shown here can never drift out of sync with the level
 * badges shown elsewhere in the app.
 */
const FACEIT_LEVEL_THRESHOLDS: FaceitLevelThreshold[] = [
  { level: 10, min: 2001 },
  { level: 9, min: 1751 },
  { level: 8, min: 1531 },
  { level: 7, min: 1351 },
  { level: 6, min: 1201 },
  { level: 5, min: 1051 },
  { level: 4, min: 901 },
  { level: 3, min: 751 },
  { level: 2, min: 501 },
  { level: 1, min: 100 },
];

/** Stores observed FACEIT profile ELO changes, never per-match predictions. */
@Injectable()
export class EloHistoryService {
  private readonly logger = new Logger(EloHistoryService.name);

  constructor(private readonly database: DatabaseService) {}

  /**
   * Records a new ELO snapshot for `identifier`, UNLESS the most recent
   * stored snapshot already has the exact same value (avoids flooding
   * the table with identical points every time the user simply re-opens
   * the Player Summary tab without having played in between).
   */
  record(identifier: string, elo: number): void {
    const key = identifier.trim().toLowerCase();
    const latest = this.latestRow(key);
    if (latest && latest.elo === elo) {
      return;
    }

    this.database.connection
      .prepare(
        `INSERT INTO elo_history (id, identifier, elo, recorded_at) VALUES (?, ?, ?, ?)`,
      )
      .run(crypto.randomUUID(), key, elo, new Date().toISOString());

    this.prune(key);
    this.logger.debug(`ELO snapshot recorded for ${key}: ${elo}`);
  }

  /** Ascending (oldest -> newest) history for `identifier`, capped at MAX_RETAINED_PER_IDENTIFIER. */
  history(identifier: string): EloHistoryEntry[] {
    const key = identifier.trim().toLowerCase();
    const rows = this.database.connection
      .prepare(
        `SELECT * FROM elo_history WHERE identifier = ? ORDER BY recorded_at ASC LIMIT ?`,
      )
      .all(key, MAX_RETAINED_PER_IDENTIFIER) as unknown as EloHistoryRow[];
    return rows.map((row) => ({ elo: row.elo, recordedAt: row.recorded_at }));
  }

  /** Returns observed history and distance to the next level. */
  buildForecast(identifier: string, currentElo: number | null): EloForecast {
    const history = this.history(identifier);
    const values = history.map((h) => h.elo);
    const n = values.length;

    const effectiveCurrent = currentElo ?? (n > 0 ? values[n - 1] : null);

    const target = effectiveCurrent !== null ? nextLevelTarget(effectiveCurrent) : null;
    const targetElo = target?.min ?? null;
    const targetLevel = target?.level ?? null;
    const eloRemaining =
      targetElo !== null && effectiveCurrent !== null ? Math.max(0, targetElo - effectiveCurrent) : null;

    return {
      identifier: identifier.trim().toLowerCase(),
      currentElo: effectiveCurrent,
      dataPoints: n,
      history,
      targetLevel,
      targetElo,
      eloRemaining,
      observedChange: n >= 2 ? values[n - 1] - values[0] : null,
      source: 'FACEIT profile snapshots',
      periodStart: history[0]?.recordedAt ?? null,
      periodEnd: history[n - 1]?.recordedAt ?? null,
      avgEloChangePerMatch: null,
      volatility: null,
      matchesToTarget: null,
      confidence: 'low',
    };
  }

  private latestRow(key: string): EloHistoryRow | undefined {
    return this.database.connection
      .prepare(`SELECT * FROM elo_history WHERE identifier = ? ORDER BY recorded_at DESC LIMIT 1`)
      .get(key) as unknown as EloHistoryRow | undefined;
  }

  /** Deletes rows beyond MAX_RETAINED_PER_IDENTIFIER (oldest first) for this identifier, so the table never grows unbounded. */
  private prune(key: string): void {
    this.database.connection
      .prepare(
        `DELETE FROM elo_history WHERE identifier = ? AND id NOT IN (
           SELECT id FROM elo_history WHERE identifier = ? ORDER BY recorded_at DESC LIMIT ?
         )`,
      )
      .run(key, key, MAX_RETAINED_PER_IDENTIFIER);
  }
}

/** Finds the next FACEIT level threshold strictly above `currentElo`, or null if already at/above the max tracked level (10). */
function nextLevelTarget(currentElo: number): FaceitLevelThreshold | null {
  const ascending = [...FACEIT_LEVEL_THRESHOLDS].sort((a, b) => a.min - b.min);
  for (const threshold of ascending) {
    if (threshold.min > currentElo) return threshold;
  }
  return null;
}
