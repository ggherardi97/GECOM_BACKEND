import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';

export class AiHomeSearchDto {
  @ApiProperty({ example: 'faturas vencidas da empresa ACME' })
  @IsString()
  @MaxLength(500)
  query!: string;

  @ApiPropertyOptional({ type: [String], example: ['invoices', 'companies'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  entities?: string[];
}

