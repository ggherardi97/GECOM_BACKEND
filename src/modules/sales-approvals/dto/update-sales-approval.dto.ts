import { PartialType } from '@nestjs/mapped-types';
import { CreateSalesApprovalDto } from './create-sales-approval.dto';

export class UpdateSalesApprovalDto extends PartialType(CreateSalesApprovalDto) {}
