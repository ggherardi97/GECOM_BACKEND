import { PartialType } from '@nestjs/mapped-types';
import { CreateSalesCommissionDto } from './create-sales-commission.dto';

export class UpdateSalesCommissionDto extends PartialType(CreateSalesCommissionDto) {}
