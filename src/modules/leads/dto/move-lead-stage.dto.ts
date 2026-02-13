import { IsOptional, IsString, IsUUID } from 'class-validator';

export class MoveLeadStageDto {
  @IsUUID('4')
  stage_id!: string;

  @IsOptional()
  @IsString()
  note?: string;
}
