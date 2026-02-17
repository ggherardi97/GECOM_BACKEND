import { ApiProperty } from '@nestjs/swagger';

export class TrackingLinkResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  transportId!: string;

  @ApiProperty({ enum: ['AIR', 'SEA'] })
  mode!: 'AIR' | 'SEA';

  @ApiProperty({ enum: ['FR24', 'MARINETRAFFIC'] })
  provider!: 'FR24' | 'MARINETRAFFIC';

  @ApiProperty()
  externalId!: string;

  @ApiProperty({ required: false, nullable: true })
  lastSyncedAt!: string | null;
}
