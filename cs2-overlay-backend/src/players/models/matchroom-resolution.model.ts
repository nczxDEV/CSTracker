import { PlayerProfile } from './player-profile.model';

/**
 * Result of resolving a FACEIT matchroom link/ID ("Load from Matchroom"
 * feature) - both team rosters, already resolved into the same
 * normalized PlayerProfile shape the rest of the app uses (see
 * PlayersService.resolveMatchroom()).
 */
export interface MatchroomResolution {
  matchId: string;
  competitionName: string | null;
  /** Raw FACEIT match status string (e.g. "READY", "ONGOING", "FINISHED", "CANCELLED"). */
  status: string | null;
  faceitUrl: string | null;
  teamA: PlayerProfile[];
  teamB: PlayerProfile[];
}
