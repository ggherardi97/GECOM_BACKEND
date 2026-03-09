import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, IsUUID } from 'class-validator';
import { SignUpDTO } from './signup.dto';

export class SignUpPaymentPrepareDTO extends SignUpDTO {
  @ApiPropertyOptional({
    description: 'Cupom opcional para regras promocionais no onboarding.',
    example: 'NEVERPAY',
  })
  @IsOptional()
  @IsString()
  coupon_code?: string;
}

export class SignUpPaymentPrepareResponseDTO {
  @ApiProperty({ format: 'uuid' })
  session_id!: string;

  @ApiProperty()
  stripe_publishable_key!: string;

  @ApiPropertyOptional()
  setup_intent_client_secret?: string | null;

  @ApiProperty({
    description: 'Quando false, o cadastro pode ser concluido sem validar cartao.',
  })
  requires_payment!: boolean;

  @ApiProperty()
  trial_days!: number;

  @ApiProperty()
  plan_name!: string;

  @ApiProperty()
  monthly_amount!: number;

  @ApiProperty()
  currency!: string;
}

export class SignUpPaymentCompleteDTO {
  @ApiProperty({ format: 'uuid' })
  @IsUUID()
  session_id!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  payment_method_id?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  setup_intent_id?: string;
}
