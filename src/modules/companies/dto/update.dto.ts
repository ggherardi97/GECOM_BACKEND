import { PartialType } from '@nestjs/mapped-types';
import { CreateCompanyDTO } from './create.dto';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class UpdateCompanyDTO extends PartialType(CreateCompanyDTO) {
  @ApiPropertyOptional({
    description: 'User responsible for the company',
    example: 'e9a11fbb-0c7b-4b80-aad7-d692a8e438d6',
  })
  @IsOptional()
  @IsUUID()
  user_id?: string;
}