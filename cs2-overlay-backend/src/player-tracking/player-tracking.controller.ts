import { Body, Controller, Delete, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { PlayerTrackingService } from './player-tracking.service';
import { AddTrackedPlayerDto } from './dto/add-tracked-player.dto';

/**
 * "Player Tracking" endpoints - lets the Control Panel add/remove/list
 * FACEIT players to track, getting a Discord alert whenever their next
 * match finishes. See PlayerTrackingService for the full rationale and
 * the FACEIT-only scope limitation.
 */
@Controller('player-tracking')
@UseGuards(ThrottlerGuard)
export class PlayerTrackingController {
  constructor(private readonly playerTrackingService: PlayerTrackingService) {}

  @Get()
  list() {
    return this.playerTrackingService.list();
  }

  @Post()
  async add(@Body() dto: AddTrackedPlayerDto) {
    return this.playerTrackingService.addTrackedPlayer(dto.identifier);
  }

  @Delete(':id')
  remove(@Param('id') id: string) {
    this.playerTrackingService.removeTrackedPlayer(id);
    return { id, removed: true };
  }
}
