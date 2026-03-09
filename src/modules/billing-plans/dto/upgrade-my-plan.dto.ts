import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class UpgradeMyPlanDto {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  plan_id!: string;
}

