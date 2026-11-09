/** Observed profile ELO at lookup time. One snapshot can span multiple matches. */
export interface EloHistoryEntry { elo: number; recordedAt: string; }
export interface FaceitLevelThreshold { level: number; min: number; }
/** Historical endpoint name retained; no prediction is made. */
export interface EloForecast {
  identifier: string;
  currentElo: number | null;
  dataPoints: number;
  history: EloHistoryEntry[];
  targetLevel: number | null;
  targetElo: number | null;
  eloRemaining: number | null;
  observedChange: number | null;
  source: 'FACEIT profile snapshots';
  periodStart: string | null;
  periodEnd: string | null;
  /** Retired estimates remain null for older clients. */
  avgEloChangePerMatch: null;
  volatility: null;
  matchesToTarget: null;
  confidence: 'low';
}
