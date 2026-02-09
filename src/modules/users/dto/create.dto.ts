import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { UserRole, UserStatusEnum } from '../enums';

export class CreateUserDTO {
  @ApiProperty({ example: 'John Doe' })
  @IsString()
  full_name!: string;

  @ApiProperty({ example: 'john@company.com' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'StrongPassword123', minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiPropertyOptional({ enum: UserRole, example: UserRole.USER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;

  @ApiPropertyOptional({ enum: UserStatusEnum, example: UserStatusEnum.ACTIVE })
  @IsOptional()
  @IsEnum(UserStatusEnum)
  status?: UserStatusEnum;

  @ApiPropertyOptional({ example: 'b3b2b2b2-b2b2-b2b2-b2b2-b2b2b2b2b2b2' })
  @IsOptional()
  @IsString()
  company_id?: string;

  @ApiPropertyOptional({ example: '+55 11 99999-9999' })
  @IsOptional()
  @IsString()
  phonenumber?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  first_access?: boolean;
}
