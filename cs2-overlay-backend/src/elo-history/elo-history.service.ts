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

/**
 * "ELO Forecast" feature - persists a snapshot of a player's FACEIT ELO
 * every time their Player Summary is looked up (see PlayersController
 * `eloForecast()`), IF it differs from the last stored value, and runs a
 * simple (unweighted) linear regression over the stored history to
 * estimate "how many matches until the next level".
 *
 * SQLite-based (DatabaseModule), matching the existing match-history/
 * saved-players persistence pattern in this codebase.
 */
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

  /**
   * Builds the full forecast payload: current ELO, next-level target,
   * simple linear-regression trend, volatility, and an estimated number
   * of matches until the target is reached.
   */
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

    let avgEloChangePerMatch: number | null = null;
    let volatility: number | null = null;
    let matchesToTarget: number | null = null;

    if (n >= 2) {
      const { slope } = linearRegression(values);
      avgEloChangePerMatch = Math.round(slope * 100) / 100;

      const deltas: number[] = [];
      for (let i = 1; i < n; i++) deltas.push(values[i] - values[i - 1]);
      volatility = Math.round(stdDev(deltas) * 10) / 10;

      if (slope > 0 && targetElo !== null && effectiveCurrent !== null && effectiveCurrent < targetElo) {
        matchesToTarget = Math.ceil((targetElo - effectiveCurrent) / slope);
      }
    }

    const confidence: EloForecast['confidence'] = n < 5 ? 'low' : n < 15 ? 'medium' : 'high';

    return {
      identifier: identifier.trim().toLowerCase(),
      currentElo: effectiveCurrent,
      dataPoints: n,
      history,
      targetLevel,
      targetElo,
      eloRemaining,
      avgEloChangePerMatch,
      volatility,
      matchesToTarget,
      confidence,
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

/** Simple (unweighted) linear regression y = intercept + slope*x, where x is the 0-based index into `ys`. */
function linearRegression(ys: number[]): { slope: number; intercept: number } {
  const n = ys.length;
  const xs = ys.map((_, i) => i);
  const xMean = xs.reduce((a, b) => a + b, 0) / n;
  const yMean = ys.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - xMean) * (ys[i] - yMean);
    den += (xs[i] - xMean) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = yMean - slope * xMean;
  return { slope, intercept };
}

function stdDev(values: number[]): number {
  if (values.length === 0) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}
