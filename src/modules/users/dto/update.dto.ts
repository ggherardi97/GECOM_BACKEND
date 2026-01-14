import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDTO } from './create.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateUserDTO extends PartialType(CreateUserDTO) {
  @ApiPropertyOptional({
    description: 'User password (mínimo 8 caracteres)',
    example: 'securityPassword123',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @MinLength(8, { message: 'The password must be at least 8 characters long.' })
  password?: string;
}
