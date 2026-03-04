import { Type } from 'class-transformer';
import {
  IsArray,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { MODULE_AREA_KEYS } from '../module-areas';

export class BillingAreaEntityConfigAreaDto {
  @IsString()
  @IsIn(MODULE_AREA_KEYS as unknown as string[])
  id!: string;

  @IsString()
  @MaxLength(80)
  label!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  order?: number;

  @IsArray()
  @IsString({ each: true })
  @MaxLength(120, { each: true })
  entities!: string[];
}

export class UpdateAreaEntityConfigDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => BillingAreaEntityConfigAreaDto)
  areas!: BillingAreaEntityConfigAreaDto[];
}
