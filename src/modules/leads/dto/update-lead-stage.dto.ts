import { PartialType } from '@nestjs/swagger';
import { CreateLeadStageDto } from './create-lead-stage.dto';

export class UpdateLeadStageDto extends PartialType(CreateLeadStageDto) {}
