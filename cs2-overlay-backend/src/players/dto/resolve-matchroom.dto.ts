import { IsNotEmpty, IsString } from 'class-validator';

/**
 * "Load from Matchroom" feature - accepts either a full FACEIT matchroom
 * URL (e.g. https://www.faceit.com/en/cs2/room/1-abc...) or a raw match
 * ID directly - see matchroom.util.ts `parseMatchroomInput()`.
 */
export class ResolveMatchroomDto {
  @IsString()
  @IsNotEmpty()
  url!: string;
}
