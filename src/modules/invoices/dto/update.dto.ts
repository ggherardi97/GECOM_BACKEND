import { PartialType } from '@nestjs/mapped-types';
import { CreateInvoiceDTO } from './create.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString } from 'class-validator';

export class UpdateInvoiceDTO extends PartialType(CreateInvoiceDTO) {
  @ApiPropertyOptional({
    description: 'Optional: force invoice_number. Usually DB generates it.',
    example: 'INV-0000007',
  })
  @IsOptional()
  @IsString()
  invoice_number?: string;
}