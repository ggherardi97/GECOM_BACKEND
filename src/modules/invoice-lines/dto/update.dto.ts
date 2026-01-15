import { PartialType } from '@nestjs/mapped-types';
import { CreateInvoiceLineDTO } from './create.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class UpdateInvoiceLineDTO extends PartialType(CreateInvoiceLineDTO) {
  @ApiPropertyOptional({ description: 'Optional: change invoice_id (usually not recommended).', example: '7c38b352-0b45-4c8d-8f02-3c6a2b1f6f2d' })
  @IsOptional()
  @IsUUID('4')
  invoice_id?: string;
}