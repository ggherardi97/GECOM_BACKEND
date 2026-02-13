import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsObject, IsOptional, IsString, MaxLength } from 'class-validator';

export class AiGridFilterDto {
  @ApiProperty({ example: 'invoices' })
  @IsString()
  @MaxLength(100)
  entityName!: string;

  @ApiProperty({ example: 'mostra so as faturas dos ultimos 30 dias com total acima de 1000' })
  @IsString()
  @MaxLength(1000)
  naturalLanguage!: string;

  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @IsObject()
  currentViewDefinitionJson?: Record<string, unknown>;
}

