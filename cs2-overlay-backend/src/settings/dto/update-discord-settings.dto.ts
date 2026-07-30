import { IsArray, IsBoolean, IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateDiscordSettingsDto {
  /** A Discord webhook URL (https://discord.com/api/webhooks/...) - the user creates this themselves in their own server's channel settings. */
  @IsOptional()
  @IsString()
  @MaxLength(512)
  webhookUrl?: string;

  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @IsOptional()
  @IsBoolean()
  alertOnVacBan?: boolean;

  @IsOptional()
  @IsBoolean()
  alertOnMatchEnd?: boolean;

  /** Subset of ['any', 'faceit', 'premier', 'casual'] - see MatchContextService for what each value means. */
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  matchTypes?: string[];

  /** "Player Tracking" feature (see PlayerTrackingModule) - alert when a tracked player LOSES a match. Defaults to ON. */
  @IsOptional()
  @IsBoolean()
  alertOnTrackedPlayerLoss?: boolean;

  /** "Player Tracking" feature - alert when a tracked player WINS a match. Defaults to OFF. */
  @IsOptional()
  @IsBoolean()
  alertOnTrackedPlayerWin?: boolean;
}
