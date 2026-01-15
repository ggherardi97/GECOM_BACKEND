import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
  ValidateIf,
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

  @ApiPropertyOptional({
    description: 'Senha do usuário (mínimo 8 caracteres). Se não vier (ou vier vazia), o backend gera uma temporária.',
    example: 'senhaSegura123',
    minLength: 8,
  })
  @IsOptional()
  @IsString()
  @ValidateIf((o) => o.password != null && String(o.password).trim().length > 0)
  @MinLength(8, { message: 'A senha deve ter pelo menos 8 caracteres' })
  password?: string;

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

  @ApiPropertyOptional({
    description: 'Company membership (N users -> 1 company)',
    example: 'e3594b9c-fea9-4e72-adc2-29bccb16cf35',
  })
  @IsOptional()
  @IsUUID('4')
  company_id?: string;
}