import { Module } from '@nestjs/common';
import { NotesService } from './notes.service';

/**
 * NotesModule now only provides a low-level, reusable key-value note
 * store (NotesService). It has no public REST endpoint of its own - per
 * the product decision, notes are only available as part of "saved
 * players" (SavedPlayersModule, `/saved-players/:id/note`), shown in the
 * Control Panel (main app), NOT on the overlay.
 */
@Module({
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}
