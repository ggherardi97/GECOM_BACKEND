import { IsOptional, IsUUID } from 'class-validator';

export class ConvertLeadDto {
  @IsOptional()
  @IsUUID('4')
  company_id?: string;

  @IsOptional()
  @IsUUID('4')
  contact_id?: string;
}
