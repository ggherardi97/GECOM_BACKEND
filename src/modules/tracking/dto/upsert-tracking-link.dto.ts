import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, MaxLength } from 'class-validator';

enum TrackingModeEnum {
  AIR = 'AIR',
  SEA = 'SEA',
}

enum TrackingProviderEnum {
  FR24 = 'FR24',
  MARINETRAFFIC = 'MARINETRAFFIC',
}

export class UpsertTrackingLinkDto {
  @ApiProperty({ enum: TrackingModeEnum, example: TrackingModeEnum.AIR })
  @IsEnum(TrackingModeEnum)
  mode!: TrackingModeEnum;

  @ApiProperty({ enum: TrackingProviderEnum, example: TrackingProviderEnum.FR24 })
  @IsEnum(TrackingProviderEnum)
  provider!: TrackingProviderEnum;

  @ApiProperty({ example: 'AZ1234' })
  @IsString()
  @MaxLength(120)
  externalId!: string;
}
