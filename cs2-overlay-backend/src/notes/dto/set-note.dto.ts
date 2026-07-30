import { IsString, MaxLength } from 'class-validator';

export class SetNoteDto {
  @IsString()
  @MaxLength(2000)
  text!: string;
}
