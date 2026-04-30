import { Body, Controller, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { CreatePublicGecomLeadDto } from './dto/create-public-gecom-lead.dto';
import { LeadsService } from './leads.service';

@ApiTags('public')
@Controller('public')
export class PublicGecomContactController {
  constructor(private readonly leadsService: LeadsService) {}

  @Public()
  @Post('gecom-contact')
  async createPublicGecomContactLead(@Body() dto: CreatePublicGecomLeadDto) {
    return this.leadsService.createPublicGecomContactLead(dto);
  }
}

