import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsUUID, MaxLength } from 'class-validator';

export class UpdateWhatsappConversationWorkflowDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsUUID('4')
  owner_user_id?: string | null;

  @ApiPropertyOptional({
    enum: ['NEW', 'QUALIFIED', 'LEAD_CAPTURED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WON', 'LOST', 'CLOSED'],
  })
  @IsOptional()
  @IsIn(['NEW', 'QUALIFIED', 'LEAD_CAPTURED', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WON', 'LOST', 'CLOSED'])
  status?: string;
}
