import { IsArray, IsUUID } from 'class-validator';

export class SetCardAssigneesDto {
  @IsArray()
  @IsUUID('4', { each: true })
  user_ids!: string[];
}
