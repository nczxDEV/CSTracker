import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';

export type ApiKeySettingKey =
  | 'faceitApiKey'
  | 'steamApiKey'
  | 'leetifyApiKey'
  | 'leetifyApiBaseUrl'
  | 'gsiAuthToken';

/** Discord Alerts settings (see DiscordModule) - stored in the same generic key-value `settings` table as the API keys above. */
export type DiscordSettingKey =
  | 'discordWebhookUrl'
  | 'discordAlertsEnabled'
  | 'discordAlertOnVacBan'
  | 'discordAlertOnMatchEnd'
  | 'discordAlertMatchTypes'
  | 'discordAlertOnTrackedPlayerLoss'
  | 'discordAlertOnTrackedPlayerWin';

export type SettingKey = ApiKeySettingKey | DiscordSettingKey;

/** Valid values for the "which match types trigger Discord alerts" filter - see MatchContextService for what each one means. */
export const DISCORD_MATCH_TYPES = ['any', 'premier', 'casual'] as const;
export type DiscordMatchTypeFilter = (typeof DISCORD_MATCH_TYPES)[number];

/**
 * "Setup Wizard" settings layer.
 *
 * Goal: the end user should NEVER have to manually edit an `.env` file or
 * open a terminal to configure API keys - the Control Panel (launcher)
 * shows a first-launch wizard that calls this SettingsService through
 * `SettingsController` (`PUT /settings/api-keys`).
 *
 * Priority order when resolving a given key:
 *   1. SQLite `settings` table (written by the Setup Wizard) - this
 *      overrides the env, so it can be changed immediately (even without
 *      an `.env`) without a code update/restart.
 *   2. `.env` / environment variable (for advanced/dev/CI use).
 *
 * IMPORTANT: keys are only stored in the backend's local SQLite database
 * (on the user's own machine), never in the client (Tauri) code or off
 * the network. The `GET /settings/status` endpoint never returns the raw
 * keys, only whether they are configured.
 */
@Injectable()
export class SettingsService {
  private readonly logger = new Logger(SettingsService.name);

  constructor(
    private readonly database: DatabaseService,
    private readonly config: ConfigService,
  ) {}

  private getStored(key: SettingKey): string | null {
    const row = this.database.connection
      .prepare('SELECT value FROM settings WHERE key = ?')
      .get(key) as { value: string } | undefined;
    return row?.value ?? null;
  }

  private setStored(key: SettingKey, value: string): void {
    this.database.connection
      .prepare(
        `INSERT INTO settings (key, value) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
      )
      .run(key, value);
  }

  private resolve(key: ApiKeySettingKey, envValue: string | undefined): string | undefined {
    return this.getStored(key) ?? envValue ?? undefined;
  }

  getFaceitApiKey(): string | undefined {
    return this.resolve('faceitApiKey', this.config.get<string>('faceit.apiKey'));
  }

  getSteamApiKey(): string | undefined {
    return this.resolve('steamApiKey', this.config.get<string>('steam.apiKey'));
  }

  getLeetifyApiKey(): string | undefined {
    return this.resolve('leetifyApiKey', this.config.get<string>('leetify.apiKey'));
  }

  /** Defaults to Leetify's real, official Public API base URL (see configuration.ts) - only ever overridden via the (optional, advanced) Setup Wizard field or `.env`. */
  getLeetifyApiBaseUrl(): string | undefined {
    return this.resolve('leetifyApiBaseUrl', this.config.get<string>('leetify.baseUrl'));
  }

  /**
   * Our Game State Integration (GSI) endpoint (`POST /gsi`) is protected
   * by a secret token, so no other local process can submit fake match
   * data. The token is generated automatically on first use, and the
   * `GET /gsi/config-file` endpoint bundles it into the ready-to-use .cfg
   * file - the user should NEVER have to generate a token or edit a file
   * by hand.
   */
  getOrCreateGsiAuthToken(): string {
    const existing = this.getStored('gsiAuthToken');
    if (existing) return existing;
    const token = crypto.randomBytes(24).toString('hex');
    this.setStored('gsiAuthToken', token);
    return token;
  }

  /**
   * Just a boolean flag for the UI - the raw key never leaves the
   * backend. `leetifyConfigured` only requires the API key now (the base
   * URL always has a real, working default - see configuration.ts - an
   * API key is technically optional per Leetify's own docs too, but
   * unauthenticated requests are subject to stricter rate limits, so we
   * still treat "configured" as "has entered their own key").
   */
  getStatus() {
    return {
      faceitConfigured: Boolean(this.getFaceitApiKey()),
      steamConfigured: Boolean(this.getSteamApiKey()),
      leetifyConfigured: Boolean(this.getLeetifyApiKey()),
    };
  }

  updateApiKeys(input: {
    faceitApiKey?: string;
    steamApiKey?: string;
    leetifyApiKey?: string;
    leetifyApiBaseUrl?: string;
  }) {
    if (input.faceitApiKey) this.setStored('faceitApiKey', input.faceitApiKey.trim());
    if (input.steamApiKey) this.setStored('steamApiKey', input.steamApiKey.trim());
    if (input.leetifyApiKey) this.setStored('leetifyApiKey', input.leetifyApiKey.trim());
    if (input.leetifyApiBaseUrl) {
      this.setStored('leetifyApiBaseUrl', input.leetifyApiBaseUrl.trim());
    }
    this.logger.log('API key settings updated from the Setup Wizard.');
    return this.getStatus();
  }

  // -------------------------------------------------------------------
  // Discord Alerts settings (see DiscordModule) - the webhook URL is
  // never returned by `getDiscordStatus()` (same "write-only secret"
  // pattern as the API keys above - only a `configured: boolean` flag is
  // exposed to the UI).
  // -------------------------------------------------------------------

  /** Internal use only (DiscordAlertsService) - NEVER exposed through a controller response. */
  getDiscordWebhookUrl(): string | undefined {
    return this.getStored('discordWebhookUrl') ?? undefined;
  }

  isDiscordAlertsEnabled(): boolean {
    return this.getStored('discordAlertsEnabled') === 'true';
  }

  isDiscordAlertOnVacBanEnabled(): boolean {
    return this.getStored('discordAlertOnVacBan') === 'true';
  }

  isDiscordAlertOnMatchEndEnabled(): boolean {
    return this.getStored('discordAlertOnMatchEnd') === 'true';
  }

  /** "Player Tracking" feature (see PlayerTrackingModule) - defaults to ON, matching the feature's primary use case ("alert me when a tracked player loses"). */
  isDiscordAlertOnTrackedPlayerLossEnabled(): boolean {
    const stored = this.getStored('discordAlertOnTrackedPlayerLoss');
    return stored === null ? true : stored === 'true';
  }

  /** Defaults to OFF - most users tracking a player primarily want loss alerts (per the feature's original request), win alerts are opt-in. */
  isDiscordAlertOnTrackedPlayerWinEnabled(): boolean {
    return this.getStored('discordAlertOnTrackedPlayerWin') === 'true';
  }

  /** Defaults to `['any']` (no filtering) when unset, so a freshly-configured webhook alerts on every match until the user narrows it down. */
  getDiscordAlertMatchTypes(): DiscordMatchTypeFilter[] {
    const raw = this.getStored('discordAlertMatchTypes');
    if (!raw) return ['any'];
    const parsed = raw
      .split(',')
      .map((s) => s.trim())
      .filter((s): s is DiscordMatchTypeFilter =>
        (DISCORD_MATCH_TYPES as readonly string[]).includes(s),
      );
    return parsed.length > 0 ? parsed : ['any'];
  }

  getDiscordStatus() {
    return {
      configured: Boolean(this.getDiscordWebhookUrl()),
      enabled: this.isDiscordAlertsEnabled(),
      alertOnVacBan: this.isDiscordAlertOnVacBanEnabled(),
      alertOnMatchEnd: this.isDiscordAlertOnMatchEndEnabled(),
      matchTypes: this.getDiscordAlertMatchTypes(),
      alertOnTrackedPlayerLoss: this.isDiscordAlertOnTrackedPlayerLossEnabled(),
      alertOnTrackedPlayerWin: this.isDiscordAlertOnTrackedPlayerWinEnabled(),
    };
  }

  updateDiscordSettings(input: {
    webhookUrl?: string;
    enabled?: boolean;
    alertOnVacBan?: boolean;
    alertOnMatchEnd?: boolean;
    matchTypes?: string[];
    alertOnTrackedPlayerLoss?: boolean;
    alertOnTrackedPlayerWin?: boolean;
  }) {
    if (input.webhookUrl) this.setStored('discordWebhookUrl', input.webhookUrl.trim());
    if (input.enabled !== undefined) {
      this.setStored('discordAlertsEnabled', input.enabled ? 'true' : 'false');
    }
    if (input.alertOnVacBan !== undefined) {
      this.setStored('discordAlertOnVacBan', input.alertOnVacBan ? 'true' : 'false');
    }
    if (input.alertOnMatchEnd !== undefined) {
      this.setStored('discordAlertOnMatchEnd', input.alertOnMatchEnd ? 'true' : 'false');
    }
    if (input.matchTypes !== undefined) {
      const valid = input.matchTypes.filter((t) =>
        (DISCORD_MATCH_TYPES as readonly string[]).includes(t),
      );
      this.setStored('discordAlertMatchTypes', (valid.length > 0 ? valid : ['any']).join(','));
    }
    if (input.alertOnTrackedPlayerLoss !== undefined) {
      this.setStored('discordAlertOnTrackedPlayerLoss', input.alertOnTrackedPlayerLoss ? 'true' : 'false');
    }
    if (input.alertOnTrackedPlayerWin !== undefined) {
      this.setStored('discordAlertOnTrackedPlayerWin', input.alertOnTrackedPlayerWin ? 'true' : 'false');
    }
    this.logger.log('Discord alert settings updated from the Control Panel.');
    return this.getDiscordStatus();
  }
}
