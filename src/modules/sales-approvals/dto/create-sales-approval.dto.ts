import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SalesApprovalEntity, SalesApprovalStatus } from '@prisma/client';
import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateSalesApprovalDto {
  @ApiProperty({ enum: SalesApprovalEntity })
  @IsEnum(SalesApprovalEntity)
  entity_type: SalesApprovalEntity;

  @ApiProperty({ description: 'ID da entidade em aprovacao' })
  @IsUUID('4')
  entity_id: string;

  @ApiPropertyOptional({ description: 'Oportunidade relacionada (opcional)' })
  @IsOptional()
  @IsUUID('4')
  opportunity_id?: string;

  @ApiProperty({ description: 'Titulo da solicitacao' })
  @IsString()
  title: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  description?: string;

  @ApiPropertyOptional({ description: 'Valor associado (string decimal)' })
  @IsOptional()
  @IsString()
  amount?: string;

  @ApiPropertyOptional({ enum: SalesApprovalStatus, default: SalesApprovalStatus.PENDING })
  @IsOptional()
  @IsEnum(SalesApprovalStatus)
  status?: SalesApprovalStatus;

  @ApiPropertyOptional({ description: 'Observacao de resolucao' })
  @IsOptional()
  @IsString()
  resolution_note?: string;
}
