import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength } from 'class-validator';

export class CreateWhatsappConversationNoteDto {
  @ApiProperty()
  @IsString()
  @MaxLength(4000)
  note_text!: string;
}
