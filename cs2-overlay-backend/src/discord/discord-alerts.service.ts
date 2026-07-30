import { Injectable, Logger } from '@nestjs/common';
import { DiscordWebhookClient } from './discord-webhook.client';
import { SettingsService } from '../settings/settings.service';
import { MatchContextService, MatchType } from '../match-context/match-context.service';
import { PlayerProfile } from '../players/models/player-profile.model';
import { MatchHistoryEntry } from '../match-history/models/match-history-entry.model';
import { TrackedPlayerMatchResult } from '../player-tracking/models/tracked-player-entry.model';

const MATCH_TYPE_LABELS: Record<MatchType, string> = {
  premier: 'Premier / Competitive',
  casual: 'Casual / Other',
  unknown: 'Unknown',
};

/**
 * Sends Discord webhook alerts for three opt-in events:
 *   1. A VAC/game-banned player detected in the current match roster
 *      ("VAC-banned player in the room") - triggered from
 *      PlayersService.resolveMany() (covers both the manual 10-player
 *      roster paste AND the live GSI roster fetch, since both funnel
 *      through that one method).
 *   2. One of the user's own matches finishing - a short K/D/score
 *      summary, triggered from GsiService right after a "My Match
 *      History" snapshot is recorded (see MatchHistoryModule).
 *   3. "Player Tracking" - ANY player you've chosen to track (by FACEIT
 *      nickname, not necessarily someone you're playing with) finishing
 *      a match - triggered from PlayerTrackingService's periodic FACEIT
 *      history poll. See that module for why this only works for FACEIT
 *      players (Valve doesn't expose a public match-history API for
 *      arbitrary Steam/Premier players).
 *
 * Events 1-2 are gated behind: `discordAlertsEnabled` (master switch),
 * the specific per-event toggle, and the `matchTypes` filter (e.g. "only
 * during Premier/FACEIT, not casual/DM practice" - see MatchContextService
 * for the classification heuristic and its documented limitations).
 * Event 3 is gated behind `discordAlertsEnabled` plus its own
 * win/loss toggles (`alertOnTrackedPlayerWin`/`alertOnTrackedPlayerLoss`) -
 * the `matchTypes` filter does NOT apply to it, since it's about a
 * tracked player's OWN match, independent of what you yourself are doing.
 *
 * All Discord calls are best-effort/non-fatal - a webhook failure (bad
 * URL, Discord outage, rate limit, etc.) is only logged, never thrown, so
 * it can never break match resolution or GSI ingestion.
 */
@Injectable()
export class DiscordAlertsService {
  private readonly logger = new Logger(DiscordAlertsService.name);

  /**
   * De-dupes VAC-ban alerts per identifier for the lifetime of this
   * backend process, so repeatedly resolving the same roster (e.g.
   * clicking "Load Live Roster" again, or re-pasting the same 10 names)
   * doesn't spam the same Discord channel with duplicate alerts about the
   * same already-known-banned player. Resets on backend restart - an
   * acceptable tradeoff for the simplicity of an in-memory Set.
   */
  private alertedIdentifiers = new Set<string>();

  constructor(
    private readonly webhookClient: DiscordWebhookClient,
    private readonly settings: SettingsService,
    private readonly matchContext: MatchContextService,
  ) {}

  private matchTypeAllowed(matchTypes: string[]): boolean {
    if (matchTypes.length === 0 || matchTypes.includes('any')) return true;
    return matchTypes.includes(this.matchContext.classify());
  }

  async notifyVacBanDetected(profiles: PlayerProfile[]): Promise<void> {
    const webhookUrl = this.settings.getDiscordWebhookUrl();
    if (
      !webhookUrl ||
      !this.settings.isDiscordAlertsEnabled() ||
      !this.settings.isDiscordAlertOnVacBanEnabled()
    ) {
      return;
    }
    if (!this.matchTypeAllowed(this.settings.getDiscordAlertMatchTypes())) return;

    const newlyBanned = profiles.filter((p) => {
      const bans = p.steamBans;
      const isBanned = Boolean(bans && (bans.vacBanned || bans.gameBanCount > 0));
      if (!isBanned) return false;
      const id = p.steamId || p.faceit?.nickname || p.nickname;
      if (!id || this.alertedIdentifiers.has(id)) return false;
      this.alertedIdentifiers.add(id);
      return true;
    });

    if (newlyBanned.length === 0) return;

    const matchTypeLabel = MATCH_TYPE_LABELS[this.matchContext.classify()];
    const fields = newlyBanned.map((p) => ({
      name: p.nickname || p.faceit?.nickname || p.steamId || 'Unknown player',
      value: p.steamBans?.vacBanned
        ? `VAC banned${p.steamBans.daysSinceLastBan != null ? ` (${p.steamBans.daysSinceLastBan}d ago)` : ''}`
        : `${p.steamBans?.gameBanCount} game ban(s)`,
      inline: false,
    }));

    const sent = await this.webhookClient.send(webhookUrl, {
      title: '\u26A0\uFE0F VAC/Game-banned player detected',
      description: `Detected in your current roster (${matchTypeLabel} match).`,
      color: 0xef4444,
      fields,
      footer: { text: 'CS Tracker - public Steam ban data' },
      timestamp: new Date().toISOString(),
    });
    if (sent) {
      this.logger.log(`Discord VAC-ban alert sent for ${newlyBanned.length} player(s).`);
    }
  }

  async notifyMatchFinished(entry: MatchHistoryEntry): Promise<void> {
    const webhookUrl = this.settings.getDiscordWebhookUrl();
    if (
      !webhookUrl ||
      !this.settings.isDiscordAlertsEnabled() ||
      !this.settings.isDiscordAlertOnMatchEndEnabled()
    ) {
      return;
    }
    if (!this.matchTypeAllowed(this.settings.getDiscordAlertMatchTypes())) return;

    const matchTypeLabel = MATCH_TYPE_LABELS[this.matchContext.classify()];
    const kdLabel = entry.kd !== null && entry.kd !== undefined ? entry.kd.toFixed(2) : 'N/A';
    const scoreLabel =
      entry.ctScore != null && entry.tScore != null ? `${entry.ctScore}-${entry.tScore}` : 'N/A';

    const sent = await this.webhookClient.send(webhookUrl, {
      title: '\u2705 Match finished',
      description: `${entry.map || 'Unknown map'} (${matchTypeLabel})`,
      color: 0x2f6fed,
      fields: [
        { name: 'Score', value: scoreLabel, inline: true },
        {
          name: 'K/D/A',
          value: `${entry.kills ?? '?'}/${entry.deaths ?? '?'}/${entry.assists ?? '?'}`,
          inline: true,
        },
        { name: 'K/D Ratio', value: kdLabel, inline: true },
      ],
      footer: { text: 'CS Tracker - My Match History' },
      timestamp: entry.recordedAt,
    });
    if (sent) {
      this.logger.log(`Discord match-finished alert sent (map: ${entry.map}).`);
    }
  }

  /**
   * "Player Tracking" alert - a tracked player (see PlayerTrackingModule)
   * has finished a match. Independent of `matchTypes`/MatchContextService
   * (that filter is about YOUR OWN current match, not a tracked player's
   * match happening elsewhere) - gated only by the master switch and the
   * dedicated win/loss toggles below.
   */
  async notifyTrackedPlayerMatchResult(result: TrackedPlayerMatchResult): Promise<void> {
    const webhookUrl = this.settings.getDiscordWebhookUrl();
    if (!webhookUrl || !this.settings.isDiscordAlertsEnabled()) return;

    const wantWin = this.settings.isDiscordAlertOnTrackedPlayerWinEnabled();
    const wantLoss = this.settings.isDiscordAlertOnTrackedPlayerLossEnabled();
    if (result.won && !wantWin) return;
    if (!result.won && !wantLoss) return;

    const resultLabel = result.won ? 'W' : 'L';
    const resultWord = result.won ? 'won' : 'lost';
    const kdLabel = result.kd != null ? result.kd.toFixed(2) : null;

    // Wording intentionally mirrors the feature's original request:
    // "L <name> lost a match but had a 1.32 K/D" - a short, scannable,
    // Discord-friendly one-liner, with the fuller stat breakdown in the
    // embed's fields below for anyone who wants the detail.
    const description =
      `**${resultLabel}** ${result.displayName} ${resultWord} a match` +
      (kdLabel ? ` but had a ${kdLabel} K/D` : '') +
      (result.map ? ` on ${result.map}` : '');

    const sent = await this.webhookClient.send(webhookUrl, {
      title: result.won ? '\u2705 Tracked player won' : '\u274C Tracked player lost',
      description,
      color: result.won ? 0x22c55e : 0xef4444,
      fields: [
        {
          name: 'Kills/Deaths',
          value: `${result.kills ?? '?'}/${result.deaths ?? '?'}`,
          inline: true,
        },
        { name: 'K/D Ratio', value: kdLabel ?? 'N/A', inline: true },
        { name: 'ADR', value: result.adr != null ? result.adr.toFixed(1) : 'N/A', inline: true },
      ],
      footer: { text: 'CS Tracker - Player Tracking (FACEIT)' },
      timestamp: new Date().toISOString(),
    });
    if (sent) {
      this.logger.log(
        `Discord tracked-player alert sent for "${result.displayName}" (${resultLabel}).`,
      );
    }
  }

  /** Sends a simple test message, bypassing the match-type filter (but still requiring a configured webhook URL) - used by the Control Panel's "Send Test Alert" button. */
  async sendTestAlert(): Promise<{ sent: boolean; reason?: string }> {
    const webhookUrl = this.settings.getDiscordWebhookUrl();
    if (!webhookUrl) {
      return { sent: false, reason: 'No Discord webhook URL configured yet.' };
    }
    const ok = await this.webhookClient.send(webhookUrl, {
      title: '\u{1F3AF} CS Tracker test alert',
      description:
        'If you can see this message, your Discord webhook is configured correctly.',
      color: 0x22c55e,
      timestamp: new Date().toISOString(),
    });
    return ok
      ? { sent: true }
      : { sent: false, reason: 'Discord rejected the request - double-check the webhook URL.' };
  }
}
