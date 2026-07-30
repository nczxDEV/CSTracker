import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { ThrottlerModule } from '@nestjs/throttler';
import configuration from './config/configuration';
import { PlayersModule } from './players/players.module';
import { SavedPlayersModule } from './saved-players/saved-players.module';
import { DatabaseModule } from './database/database.module';
import { SettingsModule } from './settings/settings.module';
import { GsiModule } from './gsi/gsi.module';
import { PlayerTrackingModule } from './player-tracking/player-tracking.module';
import { AuthModule } from './auth/auth.module';
import { HealthController } from './health/health.controller';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [configuration] }),
    ThrottlerModule.forRootAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => [
        {
          ttl: config.get<number>('rateLimit.ttlSeconds', 60) * 1000,
          limit: config.get<number>('rateLimit.maxRequests', 30),
        },
      ],
    }),
    DatabaseModule,
    SettingsModule,
    PlayersModule,
    SavedPlayersModule,
    GsiModule,
    PlayerTrackingModule,
    AuthModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
