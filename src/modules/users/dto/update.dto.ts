import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDTO } from './create.dto';
import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class UpdateUserDTO extends PartialType(CreateUserDTO) {
  @ApiProperty({
    description: 'User password (mínimo 6 caracteres)',
    example: 'securityPassword123',
    minLength: 6,
  })
  @IsString()
  @MinLength(8, { message: 'The password must be at least 6 characters long.' })
  password: string;
}
