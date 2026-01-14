import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';
import { UserRole, UserStatusEnum } from '../enums';

export class CreateUserDTO {
  @ApiProperty({
    description: 'Nome completo do usuário',
    example: 'João Silva',
  })
  @IsString()
  @IsNotEmpty({ message: 'O nome é obrigatório' })
  full_name: string;

  @ApiProperty({
    description: 'E-mail do usuário',
    example: 'joao.silva@email.com',
  })
  @IsEmail({}, { message: 'E-mail inválido' })
  email: string;

  @ApiProperty({
    description: 'Senha do usuário (mínimo 8 caracteres)',
    example: 'senhaSegura123',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres' })
  password: string;

  @ApiProperty({
    description: 'Papel do usuário dentro do sistema',
    enum: UserRole,
    example: UserRole.USER,
  })
  @IsEnum(UserRole, { message: 'O papel do usuário deve ser USER ou ADMIN' })
  role: UserRole;

  @ApiPropertyOptional({
    enum: UserStatusEnum,
    example: 'ACTIVE',
    description: 'Status of the user',
  })
  @IsOptional()
  @IsEnum(UserStatusEnum)
  status?: UserStatusEnum;

  @ApiPropertyOptional({
    description: 'User phone number',
    example: '+5511961383449',
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phonenumber?: string;

  @ApiPropertyOptional({
    description: 'Indicates if this is the first access',
    example: true,
  })
  @IsOptional()
  @IsBoolean()
  first_access?: boolean;
}
