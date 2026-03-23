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

class AutomationAiChatMessageDto {
  @ApiProperty({ enum: ['user', 'assistant'], example: 'user' })
  @IsString()
  @IsIn(['user', 'assistant'])
  role!: 'user' | 'assistant';

  @ApiProperty({ example: 'Quando um lead for criado, envie um e-mail para vendas.' })
  @IsString()
  @MaxLength(4000)
  content!: string;
}

export class AutomationAiChatDto {
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
      name: 'Recebível ao pagar invoice',
      entity_name: 'invoices',
      trigger_type: 'ENTITY_EVENT',
    },
  })
  @IsOptional()
  @IsObject()
  draft_automation?: Record<string, unknown>;

  @ApiProperty({ type: [AutomationAiChatMessageDto] })
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => AutomationAiChatMessageDto)
  messages!: AutomationAiChatMessageDto[];
}
