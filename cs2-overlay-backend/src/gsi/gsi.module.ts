import { Module } from '@nestjs/common';
import { GsiController } from './gsi.controller';
import { GsiService } from './gsi.service';
import { SettingsModule } from '../settings/settings.module';
import { PlayersModule } from '../players/players.module';
import { MatchHistoryModule } from '../match-history/match-history.module';
import { MatchContextModule } from '../match-context/match-context.module';
import { DiscordModule } from '../discord/discord.module';

/**
 * Game State Integration module - see the GsiService header for the
 * compliance rules (no position/wallhack data).
 */
@Module({
  imports: [SettingsModule, PlayersModule, MatchHistoryModule, MatchContextModule, DiscordModule],
  controllers: [GsiController],
  providers: [GsiService],
  exports: [GsiService],
})
export class GsiModule {}
