import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class SendWhatsappMessageDto {
  @ApiProperty({ example: 'Olá! Recebemos sua mensagem.' })
  @IsString()
  @IsNotEmpty()
  message!: string;

  @ApiPropertyOptional({ example: '5511999999999' })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  phone_number?: string;

  @ApiPropertyOptional({ example: 'https://api.seudominio.com.br' })
  @IsOptional()
  @IsString()
  webhook_base_url?: string;
}
