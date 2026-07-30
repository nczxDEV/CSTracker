import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import * as crypto from 'crypto';
import { OAuthStateService } from './oauth-state.service';
import { LinkedAccountsService } from './linked-accounts.service';
import { FaceitClient } from '../players/clients/faceit.client';

/**
 * "Bejelentkezés FACEIT-tel" - FACEIT Connect (OAuth2, Authorization Code
 * + PKCE).
 *
 * ENDPOINTS: FACEIT Connect isn't part of the regular Data API
 * (open.faceit.com/data/v4, see FaceitClient) - it's a separate identity
 * service. The endpoints below match FACEIT's official documentation
 * (docs.faceit.com/getting-started/authentication/oauth2/) and the
 * well-known open-source NextAuth.js/Auth.js FACEIT providers' built-in
 * configuration. All three are overridable via `.env`
 * (`FACEIT_OAUTH_*_URL`) in case FACEIT ever changes them without
 * updating those references - see configuration.ts.
 *
 * PKCE: the OAuth2 Client created in the FACEIT Developer Portal for
 * this app uses the "Authorization Code with PKCE" grant type. We
 * generate a fresh `code_verifier` per login attempt (stored server-side
 * alongside the CSRF `state` - see OAuthStateService), derive the
 * `code_challenge` (SHA-256, base64url), and send the ORIGINAL verifier
 * back during the token exchange - this is IN ADDITION to (not instead
 * of) the confidential Client Secret, since this FACEIT app is a proper
 * server-side client that can (and does) keep the secret safe in the
 * backend's own `.env`, never exposed to the frontend.
 */
@Injectable()
export class FaceitOAuthService {
  private readonly logger = new Logger(FaceitOAuthService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly state: OAuthStateService,
    private readonly linkedAccounts: LinkedAccountsService,
    private readonly faceitClient: FaceitClient,
  ) {}

  private get clientId(): string | undefined {
    return this.config.get<string>('faceitOAuth.clientId');
  }
  private get clientSecret(): string | undefined {
    return this.config.get<string>('faceitOAuth.clientSecret');
  }
  private get redirectUri(): string | undefined {
    return this.config.get<string>('faceitOAuth.redirectUri');
  }
  private get authorizeUrl(): string {
    return this.config.get<string>('faceitOAuth.authorizeUrl')!;
  }
  private get tokenUrl(): string {
    return this.config.get<string>('faceitOAuth.tokenUrl')!;
  }
  private get userInfoUrl(): string {
    return this.config.get<string>('faceitOAuth.userInfoUrl')!;
  }

  get isConfigured(): boolean {
    return Boolean(this.clientId && this.clientSecret && this.redirectUri);
  }

  /**
   * Builds the URL the user's SYSTEM DEFAULT BROWSER should be sent to
   * (never the Tauri webview itself - see AuthController.faceitLogin())
   * to start the FACEIT login flow, including a fresh CSRF `state` and a
   * PKCE `code_challenge` derived from a freshly generated
   * `code_verifier` (persisted via OAuthStateService, consumed exactly
   * once in `handleCallback()` below).
   */
  buildAuthorizeUrl(): string {
    const codeVerifier = crypto.randomBytes(32).toString('base64url');
    const codeChallenge = crypto.createHash('sha256').update(codeVerifier).digest('base64url');
    const state = this.state.create('faceit', codeVerifier);

    const params = new URLSearchParams({
      response_type: 'code',
      client_id: this.clientId as string,
      redirect_uri: this.redirectUri as string,
      // Matches the scopes actually enabled on the FACEIT OAuth2 Client
      // (see App Studio -> OAuth2 Clients -> this client's "Scopes") -
      // "openid" is mandatory (basic identity/nickname), "profile" adds
      // the avatar/display info shown in the Account tab.
      scope: 'openid profile',
      state,
      code_challenge: codeChallenge,
      code_challenge_method: 'S256',
    });
    return `${this.authorizeUrl}?${params.toString()}`;
  }

  /**
   * Handles the OAuth2 callback: validates `state` (CSRF - see
   * OAuthStateService), exchanges the authorization `code` for an
   * access/refresh token pair (using the PKCE `code_verifier` from the
   * matching login attempt AND the confidential client secret), fetches
   * the user's own FACEIT profile via the userinfo/resource endpoint,
   * and persists everything (tokens encrypted) via LinkedAccountsService.
   *
   * Throws on any failure (invalid state, FACEIT rejecting the code,
   * network error) - `AuthController` turns that into a user-facing
   * error page rather than silently doing nothing.
   */
  async handleCallback(code: string, state: string): Promise<void> {
    const consumed = this.state.consume('faceit', state);
    if (!consumed) {
      throw new Error('Invalid or expired login attempt (state mismatch) - please try logging in again.');
    }

    const tokenResponse = await firstValueFrom(
      this.http.post(
        this.tokenUrl,
        new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: this.redirectUri as string,
          client_id: this.clientId as string,
          code_verifier: consumed.codeVerifier ?? '',
        }).toString(),
        {
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            // FACEIT's token endpoint accepts the client credentials via
            // HTTP Basic auth (standard OAuth2 confidential-client
            // convention) - sent here rather than as extra body fields.
            Authorization:
              'Basic ' + Buffer.from(`${this.clientId}:${this.clientSecret}`).toString('base64'),
          },
        },
      ),
    );

    const { access_token, refresh_token, expires_in } = tokenResponse.data ?? {};
    if (!access_token) {
      throw new Error('FACEIT did not return an access token for this login attempt.');
    }

    const profile = await firstValueFrom(
      this.http.get(this.userInfoUrl, {
        headers: { Authorization: `Bearer ${access_token}` },
      }),
    );
    const info = profile.data ?? {};
    // FACEIT's userinfo response uses OpenID-Connect-style claim names -
    // `sub`/`guid` (the stable FACEIT player ID) and `nickname`/`picture`
    // depending on exactly which claim set the granted scopes unlock;
    // read defensively so a minor naming difference degrades to "missing
    // display info" rather than a crash.
    const faceitPlayerId: string | undefined = info.guid ?? info.sub;
    if (!faceitPlayerId) {
      throw new Error("FACEIT's userinfo response did not include a player ID (guid/sub).");
    }

    // Enrich with level/ELO for the "Linked Accounts" row display, via
    // the EXISTING FaceitClient (Data API, separate from this OAuth
    // identity flow) - best-effort only, never blocks linking the
    // account if this lookup happens to fail.
    let elo: number | null = null;
    let level: number | null = null;
    try {
      const byNickname = info.nickname
        ? await this.faceitClient.getPlayerByNickname(info.nickname)
        : null;
      elo = byNickname?.games?.cs2?.faceit_elo ?? byNickname?.games?.csgo?.faceit_elo ?? null;
      level = byNickname?.games?.cs2?.skill_level ?? byNickname?.games?.csgo?.skill_level ?? null;
    } catch (err) {
      this.logger.warn(`Best-effort FACEIT level/ELO enrichment failed: ${err}`);
    }

    this.linkedAccounts.save({
      provider: 'faceit',
      providerUserId: faceitPlayerId,
      displayName: info.nickname ?? null,
      avatarUrl: info.picture ?? info.avatar ?? null,
      extra: { level, elo },
      accessToken: access_token,
      refreshToken: refresh_token ?? null,
      expiresAt: expires_in ? new Date(Date.now() + expires_in * 1000).toISOString() : null,
    });

    this.logger.log(`FACEIT account linked: ${info.nickname ?? faceitPlayerId}`);
  }

  unlink(): void {
    this.linkedAccounts.unlink('faceit');
  }
}
