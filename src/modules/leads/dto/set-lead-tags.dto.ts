import { IsArray, IsUUID } from 'class-validator';

export class SetLeadTagsDto {
  @IsArray()
  @IsUUID('4', { each: true })
  tag_ids!: string[];
}
