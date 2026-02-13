import { IsOptional, IsString, MaxLength } from 'class-validator';

export class CreateLeadTagDto {
  @IsString()
  @MaxLength(100)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(30)
  color?: string;
}
