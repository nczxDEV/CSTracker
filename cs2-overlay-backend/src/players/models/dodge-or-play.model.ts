import { PlayerProfile } from './player-profile.model';

/**
 * Per-player risk analysis for the "Dodge or Play" feature - see
 * dodge-or-play.util.ts for the full methodology/formulas.
 */
export interface PlayerRiskAnalysis {
  profile: PlayerProfile;
  smurf: SmurfAnalysis;
  tilt: TiltAnalysis;
}

export interface SmurfAnalysis {
  /** 0-100. Higher = more likely a smurf/twink (skilled player on a fresh/low-hour account). Null if there isn't enough data (e.g. no FACEIT stats at all) to make any call. */
  score: number | null;
  /** true once score crosses the "suspected smurf" threshold - see SMURF_SUSPECT_THRESHOLD. */
  suspected: boolean;
  /** Plain-English bullet points explaining exactly which signals contributed to the score - full transparency, no "black box" verdict. */
  reasons: string[];
}

export interface TiltAnalysis {
  /** 0-100. Higher = more likely this player is currently on a downswing/tilt-queueing. Null if no recent-form data is available (see PlayerProfile.recentForm). */
  score: number | null;
  /** true once score crosses the "on tilt" threshold - see TILT_SUSPECT_THRESHOLD. */
  onTilt: boolean;
  reasons: string[];
}

export interface DodgeOrPlayResult {
  matchId: string;
  competitionName: string | null;
  faceitUrl: string | null;
  ownTeam: PlayerRiskAnalysis[];
  enemyTeam: PlayerRiskAnalysis[];
  verdict: {
    recommendation: 'PLAY' | 'DODGE';
    /** 0-100, your estimated chance to win this match, per the methodology below. */
    winProbabilityPercent: number;
    /** The plain Elo-expected-score baseline BEFORE any smurf/tilt adjustment, 0-100 - shown alongside the adjusted number so the effect of the adjustment is visible/transparent. */
    baseWinProbabilityPercent: number;
    ownSmurfCount: number;
    enemySmurfCount: number;
    ownTiltCount: number;
    enemyTiltCount: number;
    /** Plain-English summary of what drove the verdict. */
    summary: string;
  };
}
