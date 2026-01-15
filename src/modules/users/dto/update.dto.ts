import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDTO } from './create.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength, ValidateIf } from 'class-validator';

export class UpdateUserDTO extends PartialType(CreateUserDTO) {
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
}
