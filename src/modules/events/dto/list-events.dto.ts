import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsUUID } from 'class-validator';

export class ListEventsByRelatedDTO {
  @ApiProperty({
    description: 'Table name',
    example: 'processes',
  })
  @IsString()
  related_table: string;

  @ApiProperty({
    description: 'Related record ID',
    example: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
  })
  @IsUUID()
  related_id: string;
}
