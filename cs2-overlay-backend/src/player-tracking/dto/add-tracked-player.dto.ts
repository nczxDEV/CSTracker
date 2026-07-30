import { IsString, MaxLength, MinLength } from 'class-validator';

export class AddTrackedPlayerDto {
  /** A FACEIT nickname - see PlayerTrackingModule for why only FACEIT players can be tracked. */
  @IsString()
  @MinLength(1)
  @MaxLength(128)
  identifier!: string;
}
