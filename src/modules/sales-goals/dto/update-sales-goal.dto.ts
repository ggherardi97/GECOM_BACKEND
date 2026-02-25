import { PartialType } from '@nestjs/mapped-types';
import { CreateSalesGoalDto } from './create-sales-goal.dto';

export class UpdateSalesGoalDto extends PartialType(CreateSalesGoalDto) {}
