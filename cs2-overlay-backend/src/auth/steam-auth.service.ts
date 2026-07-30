import { Injectable, Logger } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { ConfigService } from '@nestjs/config';
import { firstValueFrom } from 'rxjs';
import { OAuthStateService } from './oauth-state.service';
import { LinkedAccountsService } from './linked-accounts.service';
import { SteamClient } from '../players/clients/steam.client';

const STEAM_OPENID_ENDPOINT = 'https://steamcommunity.com/openid/login';
const STEAM_CLAIMED_ID_PREFIX = 'https://steamcommunity.com/openid/id/';

/**
 * "Bejelentkezés Steammel" - Steam's official "Sign in through Steam"
 * flow, based on OpenID 2.0.
 *
 * IMPORTANT differences from the FACEIT OAuth2 flow (FaceitOAuthService)
 * this otherwise mirrors:
 *  - No client_id/client_secret/app registration of any kind - ANY
 *    website/app can use Steam OpenID login without prior sign-up. This
 *    is why the user didn't need to obtain any Steam OAuth credentials
 *    at all, unlike the FACEIT flow.
 *  - No access/refresh tokens - OpenID 2.0 is a one-time identity
 *    ASSERTION ("this browser session belongs to SteamID64 X"), not an
 *    ongoing delegated-access grant. There is nothing to refresh and
 *    nothing to revoke on Steam's side - `LinkedAccountsService.save()`
 *    is called with no `accessToken`/`refreshToken` at all for the
 *    'steam' provider (see the `linked_accounts` table doc comment).
 *  - The CSRF `state` we generate (OAuthStateService) is OUR OWN
 *    addition - it isn't part of the OpenID 2.0 spec itself - carried
 *    through as an extra query parameter on `return_to` so we can still
 *    validate that this callback corresponds to a login WE initiated.
 */
@Injectable()
export class SteamAuthService {
  private readonly logger = new Logger(SteamAuthService.name);

  constructor(
    private readonly http: HttpService,
    private readonly config: ConfigService,
    private readonly state: OAuthStateService,
    private readonly linkedAccounts: LinkedAccountsService,
    private readonly steamClient: SteamClient,
  ) {}

  private get realm(): string {
    // The "trust root" - Steam displays this domain to the user on its
    // own login page ("You are signing in to <realm>"). Derived from the
    // same host/port this backend already binds to (see main.ts) - never
    // hardcoded separately, so it can never drift out of sync.
    const host = this.config.get<string>('host', '127.0.0.1');
    const port = this.config.get<number>('port', 3000);
    return `http://${host}:${port}/`;
  }

  private get callbackBaseUrl(): string {
    const host = this.config.get<string>('host', '127.0.0.1');
    const port = this.config.get<number>('port', 3000);
    return `http://${host}:${port}/auth/steam/callback`;
  }

  /**
   * Builds the URL the user's SYSTEM DEFAULT BROWSER should be sent to
   * (never the Tauri webview - same rationale as
   * FaceitOAuthService.buildAuthorizeUrl()) to start the Steam login.
   */
  buildLoginUrl(): string {
    const ourState = this.state.create('steam');
    const returnTo = `${this.callbackBaseUrl}?state=${encodeURIComponent(ourState)}`;

    const params = new URLSearchParams({
      'openid.ns': 'http://specs.openid.net/auth/2.0',
      'openid.mode': 'checkid_setup',
      'openid.return_to': returnTo,
      'openid.realm': this.realm,
      'openid.identity': 'http://specs.openid.net/auth/2.0/identifier_select',
      'openid.claimed_id': 'http://specs.openid.net/auth/2.0/identifier_select',
    });
    return `${STEAM_OPENID_ENDPOINT}?${params.toString()}`;
  }

  /**
   * Handles the OpenID callback. `query` is the full set of query
   * parameters Steam appended to our `return_to` URL (our own `state`
   * PLUS all of Steam's `openid.*` assertion fields). Validates our CSRF
   * `state` first, then re-validates the OpenID assertion itself with
   * Steam directly (`openid.mode=check_authentication`) - this second
   * step is what actually proves the callback wasn't forged by a
   * malicious site that merely guessed/observed a valid-looking SteamID
   * in the URL; skipping it would make the whole login trivially
   * spoofable.
   *
   * Returns the linked SteamID64 on success, throws on any validation
   * failure.
   */
  async handleCallback(query: Record<string, string>): Promise<string> {
    const ourState = query.state;
    if (!ourState || !this.state.consume('steam', ourState)) {
      throw new Error('Invalid or expired login attempt (state mismatch) - please try logging in again.');
    }

    const claimedId = query['openid.claimed_id'];
    if (!claimedId || !claimedId.startsWith(STEAM_CLAIMED_ID_PREFIX)) {
      throw new Error("Steam's response did not include a valid claimed identity.");
    }
    const steamId64 = claimedId.slice(STEAM_CLAIMED_ID_PREFIX.length);
    if (!/^\d{17}$/.test(steamId64)) {
      throw new Error('Could not extract a valid SteamID64 from the OpenID response.');
    }

    await this.verifyWithSteam(query);

    let displayName: string | null = null;
    let avatarUrl: string | null = null;
    try {
      const summary = await this.steamClient.getPlayerSummary(steamId64);
      displayName = summary?.personaname ?? null;
      avatarUrl = summary?.avatarfull ?? null;
    } catch (err) {
      this.logger.warn(`Best-effort Steam profile enrichment failed for ${steamId64}: ${err}`);
    }

    this.linkedAccounts.save({
      provider: 'steam',
      providerUserId: steamId64,
      displayName,
      avatarUrl,
      extra: null,
      // No tokens for Steam OpenID - see class doc comment.
      accessToken: null,
      refreshToken: null,
      expiresAt: null,
    });

    this.logger.log(`Steam account linked: ${displayName ?? steamId64}`);
    return steamId64;
  }

  /**
   * Re-submits the FULL set of `openid.*` fields Steam sent us back to
   * Steam itself with `openid.mode` switched to `check_authentication` -
   * per the OpenID 2.0 spec, this is the direct (server-to-server)
   * verification step that confirms the assertion is genuine and hasn't
   * been replayed/tampered with. Steam responds with a plain-text body
   * containing `is_valid:true` (success) or `is_valid:false` (reject).
   */
  private async verifyWithSteam(query: Record<string, string>): Promise<void> {
    const params = new URLSearchParams();
    for (const [key, value] of Object.entries(query)) {
      if (key.startsWith('openid.')) {
        params.set(key, value);
      }
    }
    params.set('openid.mode', 'check_authentication');

    const response = await firstValueFrom(
      this.http.post(STEAM_OPENID_ENDPOINT, params.toString(), {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      }),
    );

    const body = String(response.data ?? '');
    if (!/is_valid\s*:\s*true/i.test(body)) {
      throw new Error("Steam rejected the login assertion (failed check_authentication) - this callback may be forged or replayed.");
    }
  }

  unlink(): void {
    this.linkedAccounts.unlink('steam');
  }
}
