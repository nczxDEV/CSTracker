import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { AuthController } from './auth.controller';
import { OAuthStateService } from './oauth-state.service';
import { LinkedAccountsService } from './linked-accounts.service';
import { FaceitOAuthService } from './faceit-oauth.service';
import { SteamAuthService } from './steam-auth.service';
import { PlayersModule } from '../players/players.module';

/**
 * "Bejelentkezés FACEIT-tel / Steammel" - see linked-account.model.ts for
 * the full feature description. `DatabaseService` isn't imported here
 * explicitly since `DatabaseModule` is `@Global()` (see
 * database.module.ts). Imports `PlayersModule` to reuse its already-
 * configured `FaceitClient` (Data API - best-effort level/ELO
 * enrichment) and `SteamClient` (public profile enrichment) instances,
 * rather than instantiating separate duplicate HTTP clients here.
 */
@Module({
  imports: [HttpModule.register({ timeout: 8000 }), PlayersModule],
  controllers: [AuthController],
  providers: [OAuthStateService, LinkedAccountsService, FaceitOAuthService, SteamAuthService],
  exports: [LinkedAccountsService],
  // NOTE: `LeetifyClient` (used by AuthController's "My Leetify Stats"
  // endpoint) is injected directly from `PlayersModule` (re-exported
  // there) - no separate provider needed here.
})
export class AuthModule {}
