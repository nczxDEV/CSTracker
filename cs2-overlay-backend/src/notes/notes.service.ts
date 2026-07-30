import { Injectable, Logger } from '@nestjs/common';
import { DatabaseService } from '../database/database.service';

/**
 * Low-level, reusable key-value note store.
 * SQLite-based persistence (previously a local JSON file - without file
 * locking this risked data loss on concurrent writes, hence the move to
 * SQLite, see `DatabaseModule`).
 *
 * Key: the identifier (Steam ID or FACEIT nickname, lowercased) the user
 * searched for/saved the player under.
 *
 * Used internally by SavedPlayersService for the "saved players" note
 * field (see `/saved-players/:id/note`) - the note feature appears in the
 * Control Panel (main app), not on the overlay.
 */
@Injectable()
export class NotesService {
  private readonly logger = new Logger(NotesService.name);

  constructor(private readonly database: DatabaseService) {}

  async getNote(identifier: string): Promise<string | null> {
    const key = identifier.toLowerCase();
    const row = this.database.connection
      .prepare('SELECT text FROM notes WHERE identifier = ?')
      .get(key) as { text: string } | undefined;
    return row?.text ?? null;
  }

  async setNote(identifier: string, text: string): Promise<void> {
    const key = identifier.toLowerCase();
    this.database.connection
      .prepare(
        `INSERT INTO notes (identifier, text, updated_at) VALUES (?, ?, ?)
         ON CONFLICT(identifier) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`,
      )
      .run(key, text, new Date().toISOString());
    this.logger.debug(`Note saved: ${key}`);
  }

  async deleteNote(identifier: string): Promise<void> {
    const key = identifier.toLowerCase();
    this.database.connection.prepare('DELETE FROM notes WHERE identifier = ?').run(key);
  }
}
