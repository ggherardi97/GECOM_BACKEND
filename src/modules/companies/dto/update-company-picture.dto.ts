import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateCompanyPictureDTO {
  @ApiPropertyOptional({
    description: 'Base64 or dataURL. Send null/empty string to clear.',
    example: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
  })
  base64?: string | null;
}