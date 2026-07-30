import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';
import { encryptToken, decryptToken } from './token-crypto.util';
import {
  LinkedAccountEntry,
  LinkedAccountProvider,
  LinkedAccountPublicView,
} from './models/linked-account.model';

interface LinkedAccountRow {
  id: string;
  provider: string;
  provider_user_id: string;
  display_name: string | null;
  avatar_url: string | null;
  extra_json: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  expires_at: string | null;
  linked_at: string;
}

export interface SaveLinkedAccountInput {
  provider: LinkedAccountProvider;
  providerUserId: string;
  displayName?: string | null;
  avatarUrl?: string | null;
  extra?: Record<string, unknown> | null;
  /** Plain-text tokens IN - encrypted before ever touching SQLite. Omit both for Steam (OpenID has no token concept). */
  accessToken?: string | null;
  refreshToken?: string | null;
  expiresAt?: string | null;
}

/**
 * CRUD for the `linked_accounts` table ("Bejelentkezés FACEIT-tel /
 * Steammel" feature) - the single source of truth for "who is the local
 * user running this copy of CS Tracker", independent of the
 * SavedPlayersModule ("who have I looked up/saved").
 *
 * Tokens are ALWAYS encrypted before being written (see
 * token-crypto.util.ts) and ALWAYS decrypted only right before use
 * (`getDecryptedAccessToken`) - every other read path
 * (`getPublicView`/`listPublicViews`) never even queries the token
 * columns' decrypted values, so there is no code path that could
 * accidentally leak them to a controller response.
 */
@Injectable()
export class LinkedAccountsService {
  private readonly logger = new Logger(LinkedAccountsService.name);

  constructor(private readonly database: DatabaseService) {}

  /** Insert-or-replace (one row per provider, per the `UNIQUE` constraint on `provider`) - used right after a successful OAuth/OpenID callback, and again on every token refresh. */
  save(input: SaveLinkedAccountInput): LinkedAccountEntry {
    const existing = this.findRaw(input.provider);
    const id = existing?.id ?? crypto.randomUUID();
    const linkedAt = existing?.linked_at ?? new Date().toISOString();

    const accessTokenEncrypted = input.accessToken ? encryptToken(input.accessToken) : null;
    const refreshTokenEncrypted = input.refreshToken ? encryptToken(input.refreshToken) : null;

    this.database.connection
      .prepare(
        `INSERT INTO linked_accounts
           (id, provider, provider_user_id, display_name, avatar_url, extra_json,
            access_token_encrypted, refresh_token_encrypted, expires_at, linked_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(provider) DO UPDATE SET
           provider_user_id = excluded.provider_user_id,
           display_name = excluded.display_name,
           avatar_url = excluded.avatar_url,
           extra_json = excluded.extra_json,
           access_token_encrypted = excluded.access_token_encrypted,
           refresh_token_encrypted = excluded.refresh_token_encrypted,
           expires_at = excluded.expires_at`,
      )
      .run(
        id,
        input.provider,
        input.providerUserId,
        input.displayName ?? null,
        input.avatarUrl ?? null,
        input.extra ? JSON.stringify(input.extra) : null,
        accessTokenEncrypted,
        refreshTokenEncrypted,
        input.expiresAt ?? null,
        linkedAt,
      );

    this.logger.log(`Linked account saved: provider=${input.provider}, providerUserId=${input.providerUserId}`);
    return this.toEntry({
      id,
      provider: input.provider,
      provider_user_id: input.providerUserId,
      display_name: input.displayName ?? null,
      avatar_url: input.avatarUrl ?? null,
      extra_json: input.extra ? JSON.stringify(input.extra) : null,
      access_token_encrypted: accessTokenEncrypted,
      refresh_token_encrypted: refreshTokenEncrypted,
      expires_at: input.expiresAt ?? null,
      linked_at: linkedAt,
    });
  }

  /** Public-safe view (never includes token columns) - what `AuthController.getStatus()` returns to the frontend. */
  getPublicView(provider: LinkedAccountProvider): LinkedAccountPublicView | null {
    const row = this.findRaw(provider);
    if (!row) return null;
    const entry = this.toEntry(row);
    return {
      provider: entry.provider,
      providerUserId: entry.providerUserId,
      displayName: entry.displayName,
      avatarUrl: entry.avatarUrl,
      extra: entry.extra,
      linkedAt: entry.linkedAt,
    };
  }

  listPublicViews(): LinkedAccountPublicView[] {
    const providers: LinkedAccountProvider[] = ['faceit', 'steam'];
    return providers
      .map((p) => this.getPublicView(p))
      .filter((v): v is LinkedAccountPublicView => v !== null);
  }

  /**
   * Decrypts and returns the stored access token for a provider, for
   * INTERNAL backend use only (e.g. FaceitOAuthService refreshing/using
   * it) - never exposed through any controller. Returns `null` if
   * nothing is linked, or if decryption fails (corrupt/tampered value -
   * treated the same as "not linked" rather than throwing, since the
   * caller's correct response is the same either way: ask the user to
   * re-link).
   */
  getDecryptedAccessToken(provider: LinkedAccountProvider): string | null {
    const row = this.findRaw(provider);
    if (!row?.access_token_encrypted) return null;
    try {
      return decryptToken(row.access_token_encrypted);
    } catch (err) {
      this.logger.warn(`Failed to decrypt stored access token for "${provider}" - treating as unlinked: ${err}`);
      return null;
    }
  }

  getDecryptedRefreshToken(provider: LinkedAccountProvider): string | null {
    const row = this.findRaw(provider);
    if (!row?.refresh_token_encrypted) return null;
    try {
      return decryptToken(row.refresh_token_encrypted);
    } catch (err) {
      this.logger.warn(`Failed to decrypt stored refresh token for "${provider}" - treating as unlinked: ${err}`);
      return null;
    }
  }

  getExpiresAt(provider: LinkedAccountProvider): Date | null {
    const row = this.findRaw(provider);
    return row?.expires_at ? new Date(row.expires_at) : null;
  }

  /**
   * Fully removes a linked account - deletes the row (tokens included)
   * from the database, not just from the UI. There is no "soft delete"
   * for this table: once unlinked, the encrypted tokens are gone too, so
   * re-linking always requires a fresh OAuth/OpenID flow.
   */
  unlink(provider: LinkedAccountProvider): void {
    this.database.connection.prepare('DELETE FROM linked_accounts WHERE provider = ?').run(provider);
    this.logger.log(`Linked account removed: provider=${provider}`);
  }

  private findRaw(provider: LinkedAccountProvider): LinkedAccountRow | undefined {
    return this.database.connection
      .prepare('SELECT * FROM linked_accounts WHERE provider = ?')
      .get(provider) as LinkedAccountRow | undefined;
  }

  private toEntry(row: LinkedAccountRow): LinkedAccountEntry {
    return {
      id: row.id,
      provider: row.provider as LinkedAccountProvider,
      providerUserId: row.provider_user_id,
      displayName: row.display_name,
      avatarUrl: row.avatar_url,
      extra: row.extra_json ? JSON.parse(row.extra_json) : null,
      expiresAt: row.expires_at,
      linkedAt: row.linked_at,
    };
  }
}
