import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  Header,
  Logger,
  NotFoundException,
  Param,
  Query,
  Redirect,
} from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { FaceitOAuthService } from './faceit-oauth.service';
import { SteamAuthService } from './steam-auth.service';
import { LinkedAccountsService } from './linked-accounts.service';
import { AuthStatusResponse } from './auth-status.model';
import { LeetifyClient } from '../players/clients/leetify.client';

/**
 * "Bejelentkezés FACEIT-tel / Steammel" (AuthModule).
 *
 * All the `/login` and `/callback` routes here are meant to be opened in
 * the user's SYSTEM DEFAULT BROWSER (see launcher.js account tab -
 * `window.__TAURI__.opener.openUrl(...)`), never inside the Tauri
 * webview itself - this is the standard, secure pattern for OAuth in
 * desktop apps (the login page + password entry always happens in a
 * real, trusted browser the user already trusts with their FACEIT/Steam
 * password, never inside an embedded webview a malicious app could
 * theoretically instrument).
 *
 * `@SkipThrottle()` on the callback routes: FACEIT/Steam redirect the
 * user's browser here directly as part of a flow the user just
 * deliberately initiated - throttling it the same as arbitrary API
 * traffic would risk breaking a legitimate login for no security
 * benefit (the actual sensitive operations - the token exchange calls
 * themselves - are outbound, backend-to-provider calls, already
 * independently rate-limited by the provider's own API).
 */
@Controller('auth')
export class AuthController {
  private readonly logger = new Logger(AuthController.name);

  constructor(
    private readonly faceitOAuth: FaceitOAuthService,
    private readonly steamAuth: SteamAuthService,
    private readonly linkedAccounts: LinkedAccountsService,
    private readonly leetifyClient: LeetifyClient,
  ) {}

  /** GET /auth/status - polled by the Account tab after a login click; never returns tokens (see LinkedAccountsService.getPublicView()). */
  @Get('status')
  getStatus(): AuthStatusResponse {
    return {
      faceit: this.linkedAccounts.getPublicView('faceit'),
      steam: this.linkedAccounts.getPublicView('steam'),
    };
  }

  /**
   * GET /auth/me/leetify-profile - "My Leetify Stats" card (Account tab).
   * Requires a linked Steam account (Leetify identifies players by
   * SteamID64 - see LeetifyClient). Fetched FRESH on every call, never
   * cached/persisted (see leetify-profile.model.ts "Do not store data"
   * compliance note).
   */
  @Get('me/leetify-profile')
  async getMyLeetifyProfile() {
    const steam = this.linkedAccounts.getPublicView('steam');
    if (!steam) {
      throw new NotFoundException({
        error: 'STEAM_NOT_LINKED',
        message: 'Link your Steam account first to see your Leetify stats.',
      });
    }
    const profile = await this.leetifyClient.getFullProfile(steam.providerUserId);
    if (!profile) {
      throw new NotFoundException({
        error: 'LEETIFY_UNAVAILABLE',
        message:
          'No Leetify data available - make sure your Leetify API key is configured (Setup & GSI tab) and that you have a public Leetify profile.',
      });
    }
    return profile;
  }

  /** DELETE /auth/:provider - "Unlink" button. Fully deletes the row (tokens included), not just a UI-side hide. */
  @Delete(':provider')
  unlink(@Param('provider') provider: string): AuthStatusResponse {
    if (provider !== 'faceit' && provider !== 'steam') {
      throw new BadRequestException(`Unknown provider "${provider}" - expected "faceit" or "steam".`);
    }
    if (provider === 'faceit') this.faceitOAuth.unlink();
    else this.steamAuth.unlink();
    return this.getStatus();
  }

  // -------------------------------------------------------------------
  // FACEIT (OAuth2 + PKCE)
  // -------------------------------------------------------------------

  @Get('faceit/login')
  @Redirect()
  faceitLogin() {
    if (!this.faceitOAuth.isConfigured) {
      throw new BadRequestException(
        'FACEIT login is not configured on this build (missing OAuth client credentials).',
      );
    }
    return { url: this.faceitOAuth.buildAuthorizeUrl(), statusCode: 302 };
  }

  @Get('faceit/callback')
  @SkipThrottle()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async faceitCallback(
    @Query('code') code?: string,
    @Query('state') state?: string,
    @Query('error') error?: string,
  ): Promise<string> {
    if (error) {
      return this.renderCallbackPage(false, `FACEIT reported: ${error}`);
    }
    if (!code || !state) {
      return this.renderCallbackPage(false, 'Missing "code"/"state" in the FACEIT callback.');
    }
    try {
      await this.faceitOAuth.handleCallback(code, state);
      return this.renderCallbackPage(true, 'FACEIT account linked successfully.');
    } catch (err: any) {
      this.logger.warn(`FACEIT OAuth callback failed: ${err?.message || err}`);
      return this.renderCallbackPage(false, err?.message || 'Something went wrong linking your FACEIT account.');
    }
  }

  // -------------------------------------------------------------------
  // Steam (OpenID 2.0)
  // -------------------------------------------------------------------

  @Get('steam/login')
  @Redirect()
  steamLogin() {
    return { url: this.steamAuth.buildLoginUrl(), statusCode: 302 };
  }

  @Get('steam/callback')
  @SkipThrottle()
  @Header('Content-Type', 'text/html; charset=utf-8')
  async steamCallback(@Query() query: Record<string, string>): Promise<string> {
    try {
      await this.steamAuth.handleCallback(query);
      return this.renderCallbackPage(true, 'Steam account linked successfully.');
    } catch (err: any) {
      this.logger.warn(`Steam OpenID callback failed: ${err?.message || err}`);
      return this.renderCallbackPage(false, err?.message || 'Something went wrong linking your Steam account.');
    }
  }

  /**
   * Minimal, self-contained HTML page shown in the user's browser tab
   * right after the login flow completes (success or failure) - styled
   * to loosely match the app so it doesn't look like a bare error page,
   * with a short "you can close this tab" message and a best-effort
   * `window.close()` (works in most browsers for a tab that has no
   * further back-history, i.e. one that was opened via a direct
   * navigation like this one - not guaranteed on every browser/OS, hence
   * the visible message either way).
   */
  private renderCallbackPage(success: boolean, message: string): string {
    const color = success ? '#39e58a' : '#ff4d5e';
    const title = success ? 'Signed in \u2713' : 'Sign-in failed';
    return `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>CS Tracker</title>
<style>
  body { margin:0; height:100vh; display:flex; align-items:center; justify-content:center;
    background:#090b10; color:#f2f4f7; font-family:-apple-system,Segoe UI,Inter,sans-serif; }
  .box { text-align:center; padding:32px; }
  h1 { color:${color}; font-size:22px; margin:0 0 10px; }
  p { color:#9aa4b2; font-size:13px; max-width:360px; margin:0 auto; }
</style></head>
<body>
  <div class="box">
    <h1>${title}</h1>
    <p>${this.escapeHtml(message)}</p>
    <p style="margin-top:18px;">You can close this tab and return to CS Tracker.</p>
  </div>
  <script>setTimeout(function(){ try { window.close(); } catch (e) {} }, 1500);</script>
</body></html>`;
  }

  private escapeHtml(value: string): string {
    return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
}
