import { IsString, MaxLength } from 'class-validator';

export class SetSavedPlayerNoteDto {
  @IsString()
  @MaxLength(2000)
  text!: string;
}
