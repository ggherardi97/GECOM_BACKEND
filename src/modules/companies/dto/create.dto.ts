import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsString, IsOptional, IsUUID, IsInt, Min } from 'class-validator';

export class CreateCompanyDTO {
  @ApiProperty({
    description: 'Nome da empresa',
    example: 'Acme Tecnologia LTDA',
  })
  @IsString()
  @IsNotEmpty({ message: 'O nome da empresa é obrigatório' })
  company_name: string;

  // ✅ AGORA OPCIONAL
  @ApiPropertyOptional({
    description: 'ID do contato primário (usuário responsável). Pode ser enviado depois via PATCH.',
    example: 'b8f9b6a4-3e5d-4c9e-9b6a-1d9e7a3f2c11',
  })
  @IsOptional()
  @IsUUID('4', { message: 'O ID do contato primário deve ser um UUID válido' })
  user_id?: string;

  @ApiPropertyOptional({ description: 'Telefone da empresa', example: '+55 11 98765-4321' })
  @IsString()
  @IsOptional()
  phone?: string;

  @ApiPropertyOptional({ description: 'CNPJ da empresa', example: '12.345.678/0001-90' })
  @IsString()
  @IsOptional()
  company_number?: string;

  @ApiPropertyOptional({ description: 'Setor de atuação da empresa', example: 'Tecnologia' })
  @IsString()
  @IsOptional()
  sector?: string;

  @ApiPropertyOptional({ description: 'Categoria da empresa', example: 'Software' })
  @IsString()
  @IsOptional()
  category?: string;

  @ApiPropertyOptional({ description: 'Complemento do endereço (sala, andar, etc)', example: 'Edifício Alpha, Sala 402' })
  @IsString()
  @IsOptional()
  address_line?: string;

  @ApiPropertyOptional({ description: 'Rua/Avenida', example: 'Avenida Paulista' })
  @IsString()
  @IsOptional()
  address_street?: string;

  @ApiPropertyOptional({ description: 'Número do endereço', example: '1000' })
  @IsString()
  @IsOptional()
  address_number?: string;

  @ApiPropertyOptional({ description: 'Cidade', example: 'São Paulo' })
  @IsString()
  @IsOptional()
  address_city?: string;

  @ApiPropertyOptional({ description: 'País', example: 'Brasil' })
  @IsString()
  @IsOptional()
  address_country?: string;

  @ApiPropertyOptional({ description: 'CEP / Postal code', example: '09271-400' })
  @IsString()
  @IsOptional()
  address_postalcode?: string;

  @ApiPropertyOptional({ description: 'Estado / State', example: 'SP' })
  @IsString()
  @IsOptional()
  address_state?: string;

  @ApiPropertyOptional({ description: 'Number of invoices for the company', example: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  number_of_invoices?: number;

  @ApiPropertyOptional({ description: 'Company language', example: 'pt-BR' })
  @IsString()
  @IsOptional()
  language?: string;
}