import { IsBoolean, IsInt, IsOptional, IsString, MaxLength, Min } from 'class-validator';

export class CreateLeadStageDto {
  @IsString()
  @MaxLength(150)
  name!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @IsBoolean()
  is_won?: boolean;

  @IsOptional()
  @IsBoolean()
  is_lost?: boolean;

  @IsOptional()
  @IsBoolean()
  is_active?: boolean;
}
