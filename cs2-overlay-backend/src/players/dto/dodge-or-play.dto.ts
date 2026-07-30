import { IsNotEmpty, IsString } from 'class-validator';

/**
 * "Dodge or Play" feature - same input shape as ResolveMatchroomDto (a
 * FACEIT matchroom URL, or a raw match ID).
 */
export class DodgeOrPlayDto {
  @IsString()
  @IsNotEmpty()
  url!: string;
}
