import { IsInt, IsOptional, Max, Min, IsDateString, ValidateIf } from 'class-validator';

export class UpdateProcessDTO {
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  completed?: number;

  /**
   * Accept ISO date string or null (to clear).
   * If you don't want to allow null, remove the ValidateIf/IsDateString combo and keep only IsDateString.
   */
  @IsOptional()
  @ValidateIf((_, value) => value !== null)
  @IsDateString()
  ship_date?: string | null;

  @IsOptional()
  @IsInt()
  status?: number;
}
