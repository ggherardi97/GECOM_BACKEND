import { PartialType } from '@nestjs/swagger';
import { CreateWhatsappIntegrationDto } from './create-whatsapp-integration.dto';

export class UpdateWhatsappIntegrationDto extends PartialType(CreateWhatsappIntegrationDto) {}
