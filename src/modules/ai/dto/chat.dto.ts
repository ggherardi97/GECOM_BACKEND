import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsObject,
  IsOptional,
  IsString,
  MaxLength,
  ValidateNested,
} from 'class-validator';

class AiChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'], example: 'user' })
  @IsString()
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty({ example: 'Crie um dashboard de faturamento dos ultimos 6 meses.' })
  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class AiChatDto {
  @ApiPropertyOptional({ example: 'pt-BR' })
  @IsOptional()
  @IsString()
  @MaxLength(20)
  lang?: string;

  @ApiPropertyOptional({ default: false })
  @IsOptional()
  @IsBoolean()
  confirmed?: boolean;

  @ApiPropertyOptional({
    example: {
      intent: 'create_record',
      record_draft: {
        entity_name: 'incidents',
        values: {
          title: 'Chamado de teste',
        },
      },
    },
  })
  @IsOptional()
  @IsObject()
  draft?: Record<string, unknown>;

  @ApiProperty({ type: [AiChatMessageDto] })
  @IsArray()
  @ArrayMaxSize(30)
  @ValidateNested({ each: true })
  @Type(() => AiChatMessageDto)
  messages!: AiChatMessageDto[];
}
