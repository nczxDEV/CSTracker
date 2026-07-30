import { Body, Controller, Delete, Get, Param, Post, Put, Query, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SavedPlayersService } from './saved-players.service';
import { SetSavedPlayerNoteDto } from './dto/set-saved-player-note.dto';

/**
 * "Saved players" endpoints - these power the Control Panel's (main app)
 * dedicated section. The overlay only ever triggers
 * POST /saved-players/:identifier (when clicking a player's name); every
 * other operation (list, note, delete, refresh) comes from launcher.js.
 */
@Controller('saved-players')
@UseGuards(ThrottlerGuard)
export class SavedPlayersController {
  constructor(private readonly savedPlayersService: SavedPlayersService) {}

  /**
   * GET /saved-players?search=&sortBy=elo|kd|name|savedAt&sortDir=asc|desc
   * Sorting/filtering for the Control Panel's "Saved Players" list, for
   * when a lot of players have been saved.
   */
  @Get()
  async list(
    @Query('search') search?: string,
    @Query('sortBy') sortBy?: 'savedAt' | 'elo' | 'kd' | 'name',
    @Query('sortDir') sortDir?: 'asc' | 'desc',
  ) {
    return this.savedPlayersService.list({ search, sortBy, sortDir });
  }

  @Post(':identifier')
  async save(@Param('identifier') identifier: string) {
    return this.savedPlayersService.save(identifier);
  }

  @Post(':identifier/refresh')
  async refresh(@Param('identifier') identifier: string) {
    return this.savedPlayersService.refresh(identifier);
  }

  @Put(':identifier/note')
  async setNote(
    @Param('identifier') identifier: string,
    @Body() dto: SetSavedPlayerNoteDto,
  ) {
    return this.savedPlayersService.setNote(identifier, dto.text);
  }

  @Delete(':identifier')
  async remove(@Param('identifier') identifier: string) {
    await this.savedPlayersService.remove(identifier);
    return { identifier, removed: true };
  }
}
