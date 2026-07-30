import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import { SettingsService } from './settings.service';
import { UpdateApiKeysDto } from './dto/update-api-keys.dto';
import { UpdateDiscordSettingsDto } from './dto/update-discord-settings.dto';

/**
 * "Setup Wizard" endpoints - called by the launcher (Control Panel) on
 * first launch (or any time from the settings screen), so the user never
 * has to edit an `.env` file or open a terminal.
 */
@Controller('settings')
@UseGuards(ThrottlerGuard)
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  /** GET /settings/status - just a boolean flag, never the raw key. */
  @Get('status')
  status() {
    return this.settingsService.getStatus();
  }

  /** PUT /settings/api-keys - called by the Setup Wizard's "Save" button. */
  @Put('api-keys')
  updateApiKeys(@Body() dto: UpdateApiKeysDto) {
    return this.settingsService.updateApiKeys(dto);
  }

  /** GET /settings/discord - Discord Alerts status (webhook URL itself is NEVER returned, only a `configured` flag). */
  @Get('discord')
  discordStatus() {
    return this.settingsService.getDiscordStatus();
  }

  /** PUT /settings/discord - called by the Control Panel's "Discord Alerts" section. */
  @Put('discord')
  updateDiscordSettings(@Body() dto: UpdateDiscordSettingsDto) {
    return this.settingsService.updateDiscordSettings(dto);
  }
}
