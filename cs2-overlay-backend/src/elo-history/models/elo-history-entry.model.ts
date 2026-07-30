/**
 * A single recorded FACEIT ELO snapshot for a given identifier (nickname/
 * Steam ID) - powers the "ELO Forecast" card on the Control Panel's
 * Player Summary tab (trend line + "matches to next level" estimate).
 *
 * IMPORTANT (why this only grows on real ELO changes): CS2's GSI never
 * reports FACEIT ELO at all (FACEIT isn't part of the official GSI
 * payload), so there's no way to log a value "per match" the way "My
 * Match History" does from GSI. Instead, a new row is appended here
 * every time the Player Summary tab resolves this identifier's profile
 * AND the ELO value differs from the last stored snapshot - in practice
 * this means each stored row corresponds to a genuine ELO change (i.e. a
 * played match), just discovered asynchronously (whenever the user next
 * checks), rather than to a literal timestamp of when the match ended.
 */
export interface EloHistoryEntry {
  elo: number;
  recordedAt: string; // ISO timestamp
}

/** One level's ELO threshold - mirrors tracker-render.js FACEIT_LEVEL_THRESHOLDS. */
export interface FaceitLevelThreshold {
  level: number;
  min: number;
}

export interface EloForecast {
  identifier: string;
  currentElo: number | null;
  /** Data points actually stored for this identifier (see doc comment above). */
  dataPoints: number;
  history: EloHistoryEntry[];
  /** Next FACEIT level above the current ELO, or null if already at the max tracked level (10). */
  targetLevel: number | null;
  targetElo: number | null;
  /** How much ELO is left to reach targetElo (null if already there/no target). */
  eloRemaining: number | null;
  /** Simple linear-regression slope over the stored history (average ELO change per data point). Null if not enough data (<2 points). */
  avgEloChangePerMatch: number | null;
  /** Standard deviation of the match-to-match ELO deltas - a rough "volatility"/consistency indicator. */
  volatility: number | null;
  /** Estimated number of future data points (~matches) until targetElo is reached, given the current trend. Null if trend is flat/negative or there's no target. */
  matchesToTarget: number | null;
  /** 'low' | 'medium' | 'high' - based purely on how many data points feed the estimate (more data = more confidence), documented transparently in the UI. */
  confidence: 'low' | 'medium' | 'high';
}
