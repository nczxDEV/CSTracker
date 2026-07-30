import { Module } from '@nestjs/common';
import { PlayerTrackingController } from './player-tracking.controller';
import { PlayerTrackingService } from './player-tracking.service';
import { PlayersModule } from '../players/players.module';
import { DiscordModule } from '../discord/discord.module';

@Module({
  imports: [PlayersModule, DiscordModule],
  controllers: [PlayerTrackingController],
  providers: [PlayerTrackingService],
})
export class PlayerTrackingModule {}
