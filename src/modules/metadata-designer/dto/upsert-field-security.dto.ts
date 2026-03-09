import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Min,
  ValidateNested,
} from 'class-validator';

export class UpsertFieldSecurityRuleDto {
  @ApiPropertyOptional({ example: '50fbfe50-b7ca-41f2-89d4-10df498f0b95' })
  @IsOptional()
  @IsString()
  id?: string;

  @ApiProperty({ example: 'ROLE' })
  @IsString()
  principal_type!: string;

  @ApiProperty({ example: '5ab1b640-73f4-4f2d-a11f-75650d3a4e90' })
  @IsString()
  principal_id!: string;

  @ApiPropertyOptional({ example: '8f6daea2-c23f-4be8-9845-6f6e547e9773' })
  @IsOptional()
  @IsString()
  profile_id?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  can_view?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  can_read?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  can_edit?: boolean;

  @ApiPropertyOptional({ example: 'HIDDEN_TEXT' })
  @IsOptional()
  @IsString()
  mask_mode?: string;

  @ApiPropertyOptional({ default: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  priority?: number;
}

export class UpsertFieldSecurityDefaultsDto {
  @ApiPropertyOptional({ example: '30cc66f4-c7de-4b5f-b975-f6ca8f287d96' })
  @IsOptional()
  @IsString()
  entity_id?: string | null;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  default_can_view?: boolean;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  default_can_read?: boolean;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  default_can_edit?: boolean;

  @ApiPropertyOptional({ example: 'HIDDEN_TEXT' })
  @IsOptional()
  @IsString()
  default_mask_mode?: string;
}

export class UpsertFieldSecurityDto {
  @ApiProperty({ type: [UpsertFieldSecurityRuleDto] })
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => UpsertFieldSecurityRuleDto)
  rules!: UpsertFieldSecurityRuleDto[];

  @ApiPropertyOptional({ type: UpsertFieldSecurityDefaultsDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => UpsertFieldSecurityDefaultsDto)
  defaults?: UpsertFieldSecurityDefaultsDto;
}

