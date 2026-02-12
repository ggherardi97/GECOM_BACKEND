import { IsInt, IsOptional, IsUUID, Min } from 'class-validator';

export class MoveCardDto {
  @IsUUID('4')
  target_column_id!: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  target_order?: number;
}
