import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { IsBoolean, IsOptional } from 'class-validator';

export class GetTrackingQueryDto {
  @ApiPropertyOptional({ description: 'Force provider refresh bypassing cache if possible.' })
  @IsOptional()
  @Transform(({ value }) => {
    if (typeof value === 'boolean') return value;
    const normalized = String(value ?? '')
      .trim()
      .toLowerCase();
    return normalized === '1' || normalized === 'true' || normalized === 'yes';
  })
  @IsBoolean()
  refresh?: boolean;
}
