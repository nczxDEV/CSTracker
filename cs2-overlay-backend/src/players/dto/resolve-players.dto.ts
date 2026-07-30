import { ArrayMaxSize, ArrayMinSize, IsArray, IsString } from 'class-validator';

/**
 * In the MVP phase, the 10-player lobby list can be entered manually
 * (steamId, a searchable nickname, or FACEIT nickname, mixed). Automatic
 * lobby detection is NOT supported in this version - see the GSI module
 * for the officially supported live/automatic alternative.
 */
export class ResolvePlayersDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(10)
  @IsString({ each: true })
  identifiers!: string[];
}
