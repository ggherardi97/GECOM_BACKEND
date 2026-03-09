import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsBoolean, IsOptional } from 'class-validator';

export class CancelMyPlanDto {
  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  immediate?: boolean;
}

