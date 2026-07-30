import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from '../../settings/settings.service';
import { withRetry } from './http-retry.util';

export interface SteamBanStatus {
  vacBanned: boolean;
  gameBanCount: number;
  daysSinceLastBan: number | null;
  communityBanned: boolean;
}

/**
 * Steam Web API client.
 * Only fetches public profile data (nickname, avatar, profile
 * visibility, VAC/game ban status - the latter is also public info,
 * visible on the Steam Community profile page too).
 * Docs: https://steamcommunity.com/dev
 *
 * IMPORTANT: we don't read memory, we don't touch the running CS2
 * client. We only call the official, HTTP-based Web API.
 */
@Injectable()
export class SteamClient {
  private readonly logger = new Logger(SteamClient.name);
  private readonly baseUrl: string;

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly settings: SettingsService,
  ) {
    this.baseUrl = this.config.get<string>('steam.baseUrl', 'https://api.steampowered.com');
  }

  private get isConfigured(): boolean {
    return Boolean(this.settings.getSteamApiKey());
  }

  /**
   * Fetches basic public profile data.
   * GET /ISteamUser/GetPlayerSummaries/v2/
   */
  async getPlayerSummary(steamId: string): Promise<any | null> {
    if (!this.isConfigured) return null;
    try {
      const response = await withRetry(
        () =>
          firstValueFrom(
            this.http.get(`${this.baseUrl}/ISteamUser/GetPlayerSummaries/v0002/`, {
              params: { key: this.settings.getSteamApiKey(), steamids: steamId },
            }),
          ),
        { logger: this.logger, label: 'Steam GetPlayerSummaries' },
      );
      const players = response.data?.response?.players ?? [];
      return players[0] ?? null;
    } catch (err) {
      this.logger.warn(`Steam profile not found for steamId: ${steamId}`);
      return null;
    }
  }

  /**
   * Resolves a vanity URL (e.g. steamcommunity.com/id/xyz) into a SteamID64.
   * GET /ISteamUser/ResolveVanityURL/v0001/
   */
  async resolveVanityUrl(vanity: string): Promise<string | null> {
    if (!this.isConfigured) return null;
    try {
      const response = await withRetry(
        () =>
          firstValueFrom(
            this.http.get(`${this.baseUrl}/ISteamUser/ResolveVanityURL/v0001/`, {
              params: { key: this.settings.getSteamApiKey(), vanityurl: vanity },
            }),
          ),
        { logger: this.logger, label: 'Steam ResolveVanityURL' },
      );
      const data = response.data?.response;
      return data?.success === 1 ? data.steamid : null;
    } catch (err) {
      this.logger.warn(`Vanity URL resolve failed for: ${vanity}`);
      return null;
    }
  }

  /**
   * Public VAC/game ban status ("safety indicator" feature) - the same
   * info visible on the Steam Community profile page, through the
   * official API.
   * GET /ISteamUser/GetPlayerBans/v1/
   */
  async getPlayerBans(steamId: string): Promise<SteamBanStatus | null> {
    if (!this.isConfigured) return null;
    try {
      const response = await withRetry(
        () =>
          firstValueFrom(
            this.http.get(`${this.baseUrl}/ISteamUser/GetPlayerBans/v1/`, {
              params: { key: this.settings.getSteamApiKey(), steamids: steamId },
            }),
          ),
        { logger: this.logger, label: 'Steam GetPlayerBans' },
      );
      const player = response.data?.players?.[0];
      if (!player) return null;
      return {
        vacBanned: Boolean(player.VACBanned),
        gameBanCount: player.NumberOfGameBans ?? 0,
        daysSinceLastBan:
          player.VACBanned || player.NumberOfGameBans > 0 ? player.DaysSinceLastBan ?? null : null,
        communityBanned: Boolean(player.CommunityBanned),
      };
    } catch (err) {
      this.logger.warn(`Steam ban status not found for steamId: ${steamId}`);
      return null;
    }
  }
}
