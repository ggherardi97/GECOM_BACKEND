import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';

export class CreateTenantDTO {
  @ApiProperty({ example: 'Minha Empresa LTDA', maxLength: 255 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name!: string;

  @ApiProperty({ example: 'minha-empresa', maxLength: 80 })
  @IsString()
  @IsNotEmpty()
  @MaxLength(80)
  slug!: string;

  @ApiPropertyOptional({ example: '2b50f0a2-4db7-4b6c-8f40-cfdf9413fcf6' })
  @IsOptional()
  @IsUUID('4')
  company_id?: string;

  @ApiPropertyOptional({ example: 1, description: '1=ACTIVE, 2=INACTIVE, 3=SUSPENDED, 4=DELETED' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(4)
  status?: number;
}
