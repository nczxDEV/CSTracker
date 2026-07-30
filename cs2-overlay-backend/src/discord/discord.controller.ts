import { Controller, Post, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { DiscordAlertsService } from './discord-alerts.service';

/**
 * Discord alert ACTIONS (not settings CRUD - that lives in
 * SettingsController's `/settings/discord` endpoints, matching the
 * existing API-keys Setup Wizard pattern).
 */
@Controller('discord')
@UseGuards(ThrottlerGuard)
export class DiscordController {
  constructor(private readonly discordAlerts: DiscordAlertsService) {}

  /** POST /discord/test - sends a test message to the configured webhook, so the user can verify it works right after setup. */
  @Post('test')
  async sendTest() {
    return this.discordAlerts.sendTestAlert();
  }
}
