import { Injectable, Logger } from '@nestjs/common';
import * as crypto from 'crypto';
import { DatabaseService } from '../database/database.service';

interface OAuthLoginAttemptRow {
  state: string;
  provider: string;
  code_verifier: string | null;
  created_at: string;
}

/** How long a "state" value stays valid - generous enough to cover the user slowly reading/clicking through the browser consent screen, short enough to keep the CSRF window tight. */
const STATE_TTL_MS = 10 * 60 * 1000; // 10 minutes

/**
 * CSRF protection for the OAuth2 (FACEIT) / OpenID (Steam) login flows.
 *
 * Every "Login with ..." click generates a fresh, random `state` value,
 * persisted here BEFORE the user's browser is sent to the provider's
 * authorize/login page. The callback handler (`AuthController`) rejects
 * any request whose `state` doesn't match a row created by THIS backend,
 * or whose row has expired - this is what stops a malicious site from
 * tricking the user's browser into completing an OAuth flow the user
 * never actually initiated (a classic OAuth CSRF/login-fixation attack).
 *
 * Persisted in SQLite (not just an in-memory Map) so a login flow
 * survives an incidental backend restart mid-flow without a confusing
 * failure - login attempts are short-lived and low-volume, so this
 * adds negligible overhead.
 */
@Injectable()
export class OAuthStateService {
  private readonly logger = new Logger(OAuthStateService.name);

  constructor(private readonly database: DatabaseService) {}

  /**
   * Creates and persists a new state value for the given provider,
   * optionally alongside a PKCE `codeVerifier` (FACEIT only - see
   * FaceitOAuthService). Returns the generated `state` string to embed
   * in the authorize URL.
   */
  create(provider: string, codeVerifier?: string): string {
    this.pruneExpired();
    const state = crypto.randomBytes(24).toString('hex');
    this.database.connection
      .prepare(
        `INSERT INTO oauth_login_attempts (state, provider, code_verifier, created_at)
         VALUES (?, ?, ?, ?)`,
      )
      .run(state, provider, codeVerifier ?? null, new Date().toISOString());
    return state;
  }

  /**
   * Validates and consumes (single-use - deletes the row) a `state`
   * value for the given provider. Returns the associated `codeVerifier`
   * (or `null` if none was stored) on success, or `null` if the state is
   * missing/expired/for a different provider - callers must treat a
   * `null` return as "reject this callback with a 401/400", never
   * silently proceed.
   */
  consume(provider: string, state: string): { codeVerifier: string | null } | null {
    const row = this.database.connection
      .prepare('SELECT * FROM oauth_login_attempts WHERE state = ?')
      .get(state) as OAuthLoginAttemptRow | undefined;

    if (!row) {
      this.logger.warn(`OAuth callback rejected: unknown or already-used state ("${provider}").`);
      return null;
    }

    // Always delete on first use, even if we're about to reject it below
    // for being expired/mismatched - a state value must never be usable
    // twice, expired-and-retried or not.
    this.database.connection.prepare('DELETE FROM oauth_login_attempts WHERE state = ?').run(state);

    if (row.provider !== provider) {
      this.logger.warn(`OAuth callback rejected: state was issued for provider "${row.provider}", not "${provider}".`);
      return null;
    }

    const ageMs = Date.now() - new Date(row.created_at).getTime();
    if (ageMs > STATE_TTL_MS) {
      this.logger.warn(`OAuth callback rejected: state expired (${Math.round(ageMs / 1000)}s old, "${provider}").`);
      return null;
    }

    return { codeVerifier: row.code_verifier };
  }

  /** Best-effort cleanup of stale, never-completed login attempts (e.g. the user closed the browser tab without finishing) - runs on every `create()` call, cheap enough not to need a separate scheduler. */
  private pruneExpired(): void {
    const cutoff = new Date(Date.now() - STATE_TTL_MS).toISOString();
    this.database.connection.prepare('DELETE FROM oauth_login_attempts WHERE created_at < ?').run(cutoff);
  }
}
