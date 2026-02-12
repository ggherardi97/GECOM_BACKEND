import { IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export enum BoardCardPriorityDto {
  LOW = 'LOW',
  MEDIUM = 'MEDIUM',
  HIGH = 'HIGH',
  URGENT = 'URGENT',
}

export class CreateCardDto {
  @IsUUID('4')
  board_id!: string;

  @IsUUID('4')
  column_id!: string;

  @IsString()
  @MaxLength(255)
  title!: string;

  @IsOptional()
  @IsString()
  description?: string;

  @IsOptional()
  @IsEnum(BoardCardPriorityDto)
  priority?: BoardCardPriorityDto;

  @IsOptional()
  @IsDateString()
  due_date?: string;

  @IsOptional()
  @IsDateString()
  start_date?: string;

  @IsOptional()
  @IsInt()
  @Min(0)
  sort_order?: number;

  @IsOptional()
  @IsUUID('4')
  assigned_to_user_id?: string;

  @IsOptional()
  @IsArray()
  @IsUUID('4', { each: true })
  assignee_user_ids?: string[];

  @IsOptional()
  @IsUUID('4')
  company_id?: string;

  @IsOptional()
  @IsUUID('4')
  process_id?: string;

  @IsOptional()
  @IsUUID('4')
  invoice_id?: string;

  @IsOptional()
  @IsString()
  @MaxLength(50)
  related_table?: string;

  @IsOptional()
  @IsUUID('4')
  related_id?: string;
}
