import { PlayerProfile } from './models/player-profile.model';
import { DodgeOrPlayResult, PlayerRiskAnalysis, SmurfAnalysis, TiltAnalysis } from './models/dodge-or-play.model';

/**
 * "Dodge or Play" feature - a transparent, rules-based heuristic that
 * flags likely smurf accounts and currently-tilted players on both
 * squads of an already-resolved FACEIT matchroom (see
 * PlayersService.computeDodgeOrPlay(), which calls resolveMatchroom()
 * first), then combines those flags with a standard Elo-based win
 * estimate into a single PLAY/DODGE recommendation.
 *
 * IMPORTANT - what this is and isn't: every signal below is a
 * documented, adjustable heuristic over PUBLICLY AVAILABLE FACEIT stats
 * (lifetime K/D, win rate, HS%, matches played, ELO) and match history
 * (last 20 results, from PlayerProfile.recentForm) - nothing here reads
 * game memory, private data, or anything not already visible on a
 * player's public FACEIT profile. It is a PROBABILISTIC INDICATOR, not
 * a fact-checked accusation - a fresh, skilled account is flagged as
 * "suspected", never asserted as a confirmed smurf.
 */

// ---------------------------------------------------------------------
// Smurf detection
// ---------------------------------------------------------------------
/** Score (0-100) at/above which a player is flagged "suspected smurf" in the UI. */
export const SMURF_SUSPECT_THRESHOLD = 55;

/**
 * Smurf score methodology (each signal adds points, capped at 100):
 *   - Low lifetime match count is the single strongest signal (a smurf
 *     is, almost by definition, a fresh-ish account) - up to 40 points.
 *   - Elite performance stats (K/D, win rate, HS%) that would be
 *     unusually high for a "genuinely new" player - up to 50 points
 *     combined.
 *   - A COMBINED bonus (+10) when low match count AND elite performance
 *     both apply simultaneously, since that specific combination (not
 *     either signal alone) is the actual smurf pattern - a low-hour
 *     account with mediocre stats is just a new player, and a
 *     high-K/D veteran account with thousands of matches is just good,
 *     neither is a smurf signal on its own.
 */
export function computeSmurfScore(profile: PlayerProfile): SmurfAnalysis {
  const matches = profile.stats?.matchesPlayed ?? null;
  const kd = profile.stats?.kd ?? null;
  const winRate = profile.stats?.winRate ?? null;
  const hsPercent = profile.stats?.hsPercent ?? null;

  if (matches === null) {
    return { score: null, suspected: false, reasons: ['No FACEIT match count available - cannot assess.'] };
  }

  let score = 0;
  const reasons: string[] = [];

  if (matches < 50) {
    score += 40;
    reasons.push(`Very low match count (${matches} matches).`);
  } else if (matches < 150) {
    score += 22;
    reasons.push(`Low match count (${matches} matches).`);
  } else if (matches < 300) {
    score += 8;
  }

  let performancePoints = 0;
  if (kd !== null) {
    if (kd >= 1.6) {
      performancePoints += 20;
      reasons.push(`Very high lifetime K/D (${kd.toFixed(2)}).`);
    } else if (kd >= 1.3) {
      performancePoints += 10;
      reasons.push(`Above-average lifetime K/D (${kd.toFixed(2)}).`);
    }
  }
  if (winRate !== null) {
    if (winRate >= 70) {
      performancePoints += 20;
      reasons.push(`Very high win rate (${winRate}%).`);
    } else if (winRate >= 60) {
      performancePoints += 10;
      reasons.push(`Above-average win rate (${winRate}%).`);
    }
  }
  if (hsPercent !== null && hsPercent >= 60) {
    performancePoints += 10;
    reasons.push(`Elite headshot rate (${hsPercent}%).`);
  }
  score += performancePoints;

  // The compounding pattern: low experience + high performance together.
  if (matches < 150 && performancePoints >= 20) {
    score += 10;
    reasons.push('Elite performance on a low-experience account - the classic smurf pattern.');
  }

  score = Math.min(100, score);
  return { score, suspected: score >= SMURF_SUSPECT_THRESHOLD, reasons };
}

// ---------------------------------------------------------------------
// Tilt detection
// ---------------------------------------------------------------------
/** Score (0-100) at/above which a player is flagged "on tilt" in the UI. */
export const TILT_SUSPECT_THRESHOLD = 45;

/**
 * Tilt score methodology (each signal adds points, capped at 100):
 *   - An active LOSS streak right now is the strongest signal - up to 55
 *     points, scaling with streak length.
 *   - A meaningful dip between lifetime win rate and win rate over the
 *     last 20 matches (i.e. "their recent form is notably worse than
 *     their overall average") - up to 30 points.
 * Requires `profile.recentForm` (GSI-free, from the FACEIT match
 * history - see PlayersService.getSummary()/players.normalizer.ts) - if
 * that's unavailable (e.g. brand-new account with zero history), tilt
 * cannot be assessed and this returns a null score rather than guessing.
 */
export function computeTiltScore(profile: PlayerProfile): TiltAnalysis {
  const recentForm = profile.recentForm;
  if (!recentForm) {
    return { score: null, onTilt: false, reasons: ['No recent FACEIT match history available - cannot assess.'] };
  }

  let score = 0;
  const reasons: string[] = [];

  if (recentForm.currentStreak?.type === 'loss') {
    const count = recentForm.currentStreak.count;
    if (count >= 5) {
      score += 55;
      reasons.push(`Currently on a ${count}-match losing streak.`);
    } else if (count >= 3) {
      score += 32;
      reasons.push(`Currently on a ${count}-match losing streak.`);
    } else if (count >= 1) {
      score += 12;
    }
  }

  const lifetimeWinRate = profile.stats?.winRate;
  if (lifetimeWinRate !== null && lifetimeWinRate !== undefined && recentForm.winRateLast20Percent !== null) {
    const dip = lifetimeWinRate - recentForm.winRateLast20Percent;
    if (dip >= 20) {
      score += 30;
      reasons.push(
        `Recent form (${recentForm.winRateLast20Percent}% over last ${recentForm.matchesConsidered}) is well below their lifetime average (${lifetimeWinRate}%).`,
      );
    } else if (dip >= 10) {
      score += 15;
      reasons.push(
        `Recent form (${recentForm.winRateLast20Percent}%) is somewhat below their lifetime average (${lifetimeWinRate}%).`,
      );
    }
  }

  score = Math.min(100, score);
  return { score, onTilt: score >= TILT_SUSPECT_THRESHOLD, reasons };
}

function analyzeTeam(team: PlayerProfile[]): PlayerRiskAnalysis[] {
  return team.map((profile) => ({
    profile,
    smurf: computeSmurfScore(profile),
    tilt: computeTiltScore(profile),
  }));
}

// ---------------------------------------------------------------------
// Win probability + PLAY/DODGE verdict
// ---------------------------------------------------------------------
/** Per-flagged-player win-probability nudge (percentage points, 0-1 scale) - see buildVerdict() doc comment for the full rationale. */
const SMURF_ADJUSTMENT = 0.08;
const TILT_ADJUSTMENT = 0.05;
/** Clamp bounds so the estimate never claims total certainty either way - matches the same spirit as the existing "Team Strength" heuristic elsewhere in this app (a rough estimate, not a guarantee). */
const MIN_WIN_PROB = 0.05;
const MAX_WIN_PROB = 0.95;

function averageElo(team: PlayerProfile[]): number | null {
  const elos = team.map((p) => p.faceit?.elo).filter((e): e is number => e !== null && e !== undefined);
  if (elos.length === 0) return null;
  return elos.reduce((a, b) => a + b, 0) / elos.length;
}

/**
 * Builds the final PLAY/DODGE verdict from both teams' risk analyses.
 *
 * Step 1 - baseline win probability: the standard Elo "expected score"
 * formula (the same formula chess/Elo rating systems have used for
 * decades: 1 / (1 + 10^(-eloDiff/400))), applied to the two squads'
 * AVERAGE FACEIT ELO. This is a well-established, transparent formula,
 * not a made-up one - an ELO difference of 400 between the two average
 * squad ratings works out to roughly a 91%/9% expected split.
 *
 * Step 2 - smurf/tilt adjustment: each flagged player nudges the
 * baseline by a fixed number of percentage points:
 *   - an ENEMY suspected smurf REDUCES your odds (they're stronger than
 *     their visible stats suggest) - -8pp each.
 *   - an ENEMY player on tilt INCREASES your odds (they're playing worse
 *     than their average right now) - +5pp each.
 *   - the same logic applies in reverse for YOUR OWN squad's flagged
 *     players (a smurf on your team helps you; a tilted teammate hurts
 *     you).
 * The result is clamped to [5%, 95%] so it never claims false certainty.
 *
 * Step 3 - recommendation: PLAY if the adjusted win probability is
 * >= 50%, otherwise DODGE - EXCEPT a hard override recommends DODGE
 * regardless of the number whenever the enemy squad has 2 or more
 * suspected smurfs, since stacked smurfs compromise match integrity/fun
 * even in a technically "winnable" match.
 */
function buildVerdict(
  ownTeam: PlayerRiskAnalysis[],
  enemyTeam: PlayerRiskAnalysis[],
): DodgeOrPlayResult['verdict'] {
  const ownAvgElo = averageElo(ownTeam.map((a) => a.profile));
  const enemyAvgElo = averageElo(enemyTeam.map((a) => a.profile));

  let baseWinProb = 0.5;
  if (ownAvgElo !== null && enemyAvgElo !== null) {
    const eloDiff = ownAvgElo - enemyAvgElo;
    baseWinProb = 1 / (1 + Math.pow(10, -eloDiff / 400));
  }

  const ownSmurfs = ownTeam.filter((a) => a.smurf.suspected);
  const enemySmurfs = enemyTeam.filter((a) => a.smurf.suspected);
  const ownTilted = ownTeam.filter((a) => a.tilt.onTilt);
  const enemyTilted = enemyTeam.filter((a) => a.tilt.onTilt);

  let adjustedWinProb =
    baseWinProb +
    ownSmurfs.length * SMURF_ADJUSTMENT -
    enemySmurfs.length * SMURF_ADJUSTMENT +
    enemyTilted.length * TILT_ADJUSTMENT -
    ownTilted.length * TILT_ADJUSTMENT;
  adjustedWinProb = Math.min(MAX_WIN_PROB, Math.max(MIN_WIN_PROB, adjustedWinProb));

  const hardDodge = enemySmurfs.length >= 2;
  const recommendation: 'PLAY' | 'DODGE' = hardDodge || adjustedWinProb < 0.5 ? 'DODGE' : 'PLAY';

  const summaryParts: string[] = [];
  if (enemySmurfs.length > 0) {
    summaryParts.push(
      `${enemySmurfs.length} suspected smurf${enemySmurfs.length > 1 ? 's' : ''} on the enemy squad (${enemySmurfs
        .map((a) => a.profile.faceit?.nickname || a.profile.nickname || '?')
        .join(', ')}).`,
    );
  }
  if (enemyTilted.length > 0) {
    summaryParts.push(
      `${enemyTilted.length} enemy player${enemyTilted.length > 1 ? 's' : ''} currently on tilt (${enemyTilted
        .map((a) => a.profile.faceit?.nickname || a.profile.nickname || '?')
        .join(', ')}).`,
    );
  }
  if (ownSmurfs.length > 0) {
    summaryParts.push(`${ownSmurfs.length} suspected smurf${ownSmurfs.length > 1 ? 's' : ''} on your own squad.`);
  }
  if (ownTilted.length > 0) {
    summaryParts.push(`${ownTilted.length} of your own teammates currently on tilt.`);
  }
  if (summaryParts.length === 0) {
    summaryParts.push('No smurf or tilt flags on either squad - this looks like a clean, evenly-informed match.');
  }

  return {
    recommendation,
    winProbabilityPercent: Math.round(adjustedWinProb * 100),
    baseWinProbabilityPercent: Math.round(baseWinProb * 100),
    ownSmurfCount: ownSmurfs.length,
    enemySmurfCount: enemySmurfs.length,
    ownTiltCount: ownTilted.length,
    enemyTiltCount: enemyTilted.length,
    summary: summaryParts.join(' '),
  };
}

export function buildDodgeOrPlayResult(
  matchId: string,
  competitionName: string | null,
  faceitUrl: string | null,
  ownTeamProfiles: PlayerProfile[],
  enemyTeamProfiles: PlayerProfile[],
): DodgeOrPlayResult {
  const ownTeam = analyzeTeam(ownTeamProfiles);
  const enemyTeam = analyzeTeam(enemyTeamProfiles);
  const verdict = buildVerdict(ownTeam, enemyTeam);

  return {
    matchId,
    competitionName,
    faceitUrl,
    ownTeam,
    enemyTeam,
    verdict,
  };
}
