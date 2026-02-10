import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateProfilePictureDTO {
  @ApiPropertyOptional({
    description: 'Base64 image (can be raw base64 OR data URL like data:image/png;base64,...)',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
  })
  @IsOptional()
  @IsString()
  base64?: string;
}
