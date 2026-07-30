import { PlayerProfile } from '../../players/models/player-profile.model';

/**
 * A "saved player" entry - rendered by the Control Panel (main app) on
 * an orange player card together with a note field. NOT shown on the
 * overlay - see the SavedPlayersModule README.
 */
export interface SavedPlayerEntry {
  identifier: string;
  profile: PlayerProfile;
  note: string | null;
  savedAt: string; // ISO timestamp
}
