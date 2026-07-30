import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { CacheModule } from '@nestjs/cache-manager';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { PlayersController } from './players.controller';
import { PlayersService } from './players.service';
import { FaceitClient } from './clients/faceit.client';
import { SteamClient } from './clients/steam.client';
import { LeetifyClient } from './clients/leetify.client';
import { PremierClient } from './clients/premier.client';
import { PlayersNormalizer } from './players.normalizer';
import { SettingsModule } from '../settings/settings.module';
import { DiscordModule } from '../discord/discord.module';
import { EloHistoryModule } from '../elo-history/elo-history.module';

@Module({
  imports: [
    HttpModule.register({ timeout: 5000 }),
    SettingsModule,
    DiscordModule,
    EloHistoryModule,
    CacheModule.registerAsync({
      isGlobal: false,
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        ttl: config.get<number>('cache.ttlSeconds', 600) * 1000,
        // A Redis store is recommended in production
        // (cache-manager-redis-store); in-memory is fine to get started
        // for the MVP.
      }),
    }),
  ],
  controllers: [PlayersController],
  providers: [
    PlayersService,
    FaceitClient,
    SteamClient,
    LeetifyClient,
    PremierClient,
    PlayersNormalizer,
  ],
  // SavedPlayersModule and GsiModule depend on this service to resolve
  // fresh player data (SavedPlayersService.save()/refresh(),
  // GsiController.getRoster()). FaceitClient is also exported so
  // PlayerTrackingModule can reuse the same FACEIT API client instance
  // (getPlayerByNickname/getPlayerHistory/getMatchStats) for the "Player
  // Tracking" Discord alerts feature, without instantiating a duplicate.
  // SteamClient and LeetifyClient are exported for the same reason, so
  // AuthModule ("Bejelentkezés FACEIT-tel / Steammel") can reuse them for
  // best-effort profile enrichment and the "My Leetify Stats" feature,
  // without a second, duplicate HTTP client instance.
  exports: [PlayersService, FaceitClient, SteamClient, LeetifyClient],
})
export class PlayersModule {}
