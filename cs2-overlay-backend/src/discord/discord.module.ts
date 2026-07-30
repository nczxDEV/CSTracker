import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { DiscordWebhookClient } from './discord-webhook.client';
import { DiscordAlertsService } from './discord-alerts.service';
import { DiscordController } from './discord.controller';
import { SettingsModule } from '../settings/settings.module';
import { MatchContextModule } from '../match-context/match-context.module';

@Module({
  imports: [HttpModule.register({ timeout: 5000 }), SettingsModule, MatchContextModule],
  controllers: [DiscordController],
  providers: [DiscordWebhookClient, DiscordAlertsService],
  // PlayersModule (VAC-ban alerts) and GsiModule (match-finished alerts)
  // both import this module to trigger alerts - see DiscordAlertsService
  // header comment for the two trigger points.
  exports: [DiscordAlertsService],
})
export class DiscordModule {}
