import { IsOptional, IsString, MaxLength } from 'class-validator';

export class UpdateApiKeysDto {
  @IsOptional()
  @IsString()
  @MaxLength(256)
  faceitApiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  steamApiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(256)
  leetifyApiKey?: string;

  @IsOptional()
  @IsString()
  @MaxLength(512)
  leetifyApiBaseUrl?: string;
}
