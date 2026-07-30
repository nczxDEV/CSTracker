import { HttpService } from '@nestjs/axios';
import { Injectable, Logger } from '@nestjs/common';
import { firstValueFrom } from 'rxjs';
import { withRetry } from '../players/clients/http-retry.util';

export interface DiscordEmbedField {
  name: string;
  value: string;
  inline?: boolean;
}

export interface DiscordEmbed {
  title: string;
  description?: string;
  color?: number;
  fields?: DiscordEmbedField[];
  footer?: { text: string };
  timestamp?: string;
}

/**
 * Minimal Discord webhook client - POSTs a JSON payload to a user-provided
 * Discord webhook URL (`https://discord.com/api/webhooks/...`), which the
 * user creates themselves in their own Discord server's channel settings
 * (Server Settings -> Integrations -> Webhooks -> New Webhook -> Copy URL).
 *
 * IMPORTANT (privacy): the webhook URL is stored ONLY in the backend's
 * local SQLite database (same pattern as the FACEIT/Steam API keys, see
 * SettingsService) and is never sent anywhere except Discord's own
 * official webhook endpoint - CS Tracker has no server of its own that
 * sees this data.
 *
 * Failures are non-fatal by design (see `send()` return value) - a broken
 * webhook URL or a Discord outage must never break match resolution or
 * GSI ingestion, it should just silently skip the alert and log a
 * warning.
 */
@Injectable()
export class DiscordWebhookClient {
  private readonly logger = new Logger(DiscordWebhookClient.name);

  constructor(private readonly http: HttpService) {}

  async send(webhookUrl: string, embed: DiscordEmbed): Promise<boolean> {
    try {
      await withRetry(
        () =>
          firstValueFrom(
            this.http.post(webhookUrl, {
              username: 'CS Tracker',
              embeds: [embed],
            }),
          ),
        { logger: this.logger, label: 'Discord webhook' },
      );
      return true;
    } catch (err) {
      this.logger.warn(`Failed to send Discord webhook alert: ${err}`);
      return false;
    }
  }
}
