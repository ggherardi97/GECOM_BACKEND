import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsEmail, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

export class SignUpDTO {
  @ApiProperty({ example: 'Minha Empresa LTDA', maxLength: 255 })
  @IsString()
  @MaxLength(255)
  tenant_name!: string;

  @ApiProperty({ example: 'minha-empresa', maxLength: 80 })
  @IsString()
  @MaxLength(80)
  tenant_slug!: string;

  @ApiProperty({ example: 'Minha Empresa LTDA' })
  @IsString()
  company_name!: string;

  @ApiPropertyOptional({ example: '+55 11 99999-9999' })
  @IsOptional()
  @IsString()
  company_phone?: string;

  @ApiPropertyOptional({ example: '12.345.678/0001-90' })
  @IsOptional()
  @IsString()
  company_number?: string;

  @ApiPropertyOptional({ example: 'Tecnologia' })
  @IsOptional()
  @IsString()
  company_sector?: string;

  @ApiPropertyOptional({ example: 'Software' })
  @IsOptional()
  @IsString()
  company_category?: string;

  @ApiPropertyOptional({ example: 'Avenida Paulista' })
  @IsOptional()
  @IsString()
  company_address_street?: string;

  @ApiPropertyOptional({ example: '1000' })
  @IsOptional()
  @IsString()
  company_address_number?: string;

  @ApiPropertyOptional({ example: 'Sao Paulo' })
  @IsOptional()
  @IsString()
  company_address_city?: string;

  @ApiPropertyOptional({ example: 'Brasil' })
  @IsOptional()
  @IsString()
  company_address_country?: string;

  @ApiPropertyOptional({ example: 'SP' })
  @IsOptional()
  @IsString()
  company_address_state?: string;

  @ApiPropertyOptional({ example: '09271-400' })
  @IsOptional()
  @IsString()
  company_address_postalcode?: string;

  @ApiPropertyOptional({ example: 'pt-BR' })
  @IsOptional()
  @IsString()
  company_language?: string;

  @ApiProperty({ example: 'Admin Principal' })
  @IsString()
  admin_full_name!: string;

  @ApiProperty({ example: 'admin@empresa.com' })
  @IsEmail()
  admin_email!: string;

  @ApiProperty({ example: 'StrongPassword123', minLength: 8 })
  @IsString()
  @MinLength(8)
  admin_password!: string;

  @ApiPropertyOptional({ example: '+55 11 98888-7777' })
  @IsOptional()
  @IsString()
  admin_phone?: string;

  @ApiPropertyOptional({ example: true })
  @IsOptional()
  @IsBoolean()
  acept_terms?: boolean;
}

export class SignUpResponseDTO {
  @ApiProperty()
  tenant_id!: string;

  @ApiProperty()
  company_id!: string;

  @ApiProperty()
  user_id!: string;

  @ApiProperty()
  access_token!: string;

  @ApiProperty()
  refresh_token!: string;
}
