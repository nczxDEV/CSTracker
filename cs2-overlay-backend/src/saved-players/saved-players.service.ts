import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PlayersService } from '../players/players.service';
import { NotesService } from '../notes/notes.service';
import { PlayerProfile } from '../players/models/player-profile.model';
import { SavedPlayerEntry } from './models/saved-player-entry.model';
import { DatabaseService } from '../database/database.service';

interface SavedPlayerRow {
  id: string;
  identifier: string;
  profile_json: string;
  saved_at: string;
}

/**
 * "Saved players" feature - the user can save a player by clicking their
 * name on the overlay (POST /saved-players/:identifier); the actual card
 * view and note-taking, however, appear EXCLUSIVELY in the Control Panel
 * (main app, launcher window), not on the overlay.
 *
 * Saving a snapshot (PlayerProfile) ensures the Control Panel can display
 * the card immediately without a new API call; the "Refresh" button
 * (refresh()) can re-fetch fresh data.
 *
 * SQLite-based persistence (DatabaseModule) - previously a JSON file.
 */
@Injectable()
export class SavedPlayersService {
  private readonly logger = new Logger(SavedPlayersService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly playersService: PlayersService,
    private readonly notesService: NotesService,
  ) {}

  /**
   * @param options.search - filter by name/identifier (case-insensitive, partial match)
   * @param options.sortBy - 'savedAt' (default) | 'elo' | 'kd' | 'name'
   * @param options.sortDir - 'asc' | 'desc' (default: desc)
   */
  async list(options?: {
    search?: string;
    sortBy?: 'savedAt' | 'elo' | 'kd' | 'name';
    sortDir?: 'asc' | 'desc';
  }): Promise<SavedPlayerEntry[]> {
    const rows = this.database.connection
      .prepare('SELECT * FROM saved_players ORDER BY saved_at DESC')
      .all() as unknown as SavedPlayerRow[];

    let entries = await Promise.all(
      rows.map(async (row) => ({
        identifier: row.identifier,
        profile: JSON.parse(row.profile_json) as PlayerProfile,
        savedAt: row.saved_at,
        note: await this.notesService.getNote(row.identifier),
      })),
    );

    const search = options?.search?.trim().toLowerCase();
    if (search) {
      entries = entries.filter((entry) => {
        const nickname = (entry.profile.nickname || entry.identifier).toLowerCase();
        const faceitNickname = (entry.profile.faceit?.nickname || '').toLowerCase();
        return nickname.includes(search) || faceitNickname.includes(search);
      });
    }

    const sortBy = options?.sortBy ?? 'savedAt';
    const sortDir = options?.sortDir ?? 'desc';
    const dirMultiplier = sortDir === 'asc' ? 1 : -1;

    const sortValue = (entry: SavedPlayerEntry): number | string => {
      switch (sortBy) {
        case 'elo':
          return entry.profile.faceit?.elo ?? -Infinity;
        case 'kd':
          return entry.profile.stats?.kd ?? -Infinity;
        case 'name':
          return (entry.profile.nickname || entry.identifier).toLowerCase();
        case 'savedAt':
        default:
          return entry.savedAt;
      }
    };

    entries.sort((a, b) => {
      const va = sortValue(a);
      const vb = sortValue(b);
      if (va < vb) return -1 * dirMultiplier;
      if (va > vb) return 1 * dirMultiplier;
      return 0;
    });

    return entries;
  }

  async save(identifier: string): Promise<SavedPlayerEntry> {
    const profile = await this.playersService.getSummary(identifier);
    const id = identifier.toLowerCase();
    const savedAt = new Date().toISOString();

    this.database.connection
      .prepare(
        `INSERT INTO saved_players (id, identifier, profile_json, saved_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET identifier = excluded.identifier,
           profile_json = excluded.profile_json, saved_at = excluded.saved_at`,
      )
      .run(id, identifier, JSON.stringify(profile), savedAt);

    const note = await this.notesService.getNote(identifier);
    return { identifier, profile, savedAt, note };
  }

  /** Re-fetches fresh player data and overwrites the saved snapshot. */
  async refresh(identifier: string): Promise<SavedPlayerEntry> {
    const id = identifier.toLowerCase();
    const existing = this.database.connection
      .prepare('SELECT id FROM saved_players WHERE id = ?')
      .get(id);
    if (!existing) {
      throw new NotFoundException({
        error: 'SAVED_PLAYER_NOT_FOUND',
        message: 'This player is not saved in the Control Panel.',
      });
    }
    return this.save(identifier);
  }

  async remove(identifier: string): Promise<void> {
    const id = identifier.toLowerCase();
    this.database.connection.prepare('DELETE FROM saved_players WHERE id = ?').run(id);
    await this.notesService.deleteNote(identifier);
  }

  async setNote(identifier: string, text: string): Promise<SavedPlayerEntry> {
    const id = identifier.toLowerCase();
    const row = this.database.connection
      .prepare('SELECT * FROM saved_players WHERE id = ?')
      .get(id) as SavedPlayerRow | undefined;
    if (!row) {
      throw new NotFoundException({
        error: 'SAVED_PLAYER_NOT_FOUND',
        message: 'This player is not saved in the Control Panel.',
      });
    }
    await this.notesService.setNote(identifier, text);
    return {
      identifier: row.identifier,
      profile: JSON.parse(row.profile_json) as PlayerProfile,
      savedAt: row.saved_at,
      note: text,
    };
  }
}
