import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, ValidateIf, IsBoolean } from 'class-validator';

export class UpdateMyProfileDTO {
  @ApiPropertyOptional({ example: 'Gustavo Gherardi' })
  @IsOptional()
  @IsString()
  full_name?: string;

  @ApiPropertyOptional({ example: '+55 11 99999-9999' })
  @IsOptional()
  @IsString()
  phonenumber?: string;

  @ApiPropertyOptional({
    description: 'User password (mínimo 8 caracteres). Only validated when provided.',
    example: 'securityPassword123',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.password != null && String(o.password).trim().length > 0)
  @MinLength(8, { message: 'The password must be at least 8 characters long.' })
  password?: string;

  @ApiPropertyOptional({ description: 'Mark terms as accepted', example: true })
  @IsOptional()
  @IsBoolean()
  acept_terms?: boolean;
}
