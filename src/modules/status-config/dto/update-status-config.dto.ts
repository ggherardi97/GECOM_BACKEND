import { PartialType } from '@nestjs/swagger';
import { CreateStatusConfigDto } from './create-status-config.dto';

export class UpdateStatusConfigDto extends PartialType(CreateStatusConfigDto) {}

