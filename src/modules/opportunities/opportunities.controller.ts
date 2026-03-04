import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { OpportunitiesService } from './opportunities.service';
import { CreateOpportunityDto } from './dto/create-opportunity.dto';
import { UpdateOpportunityDto } from './dto/update-opportunity.dto';
import { ConvertOpportunityToInvoiceDto } from './dto/convert-opportunity-to-invoice.dto';
import { AccessResource } from '../access-control/decorators/access-resource.decorator';

@ApiTags('opportunities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@AccessResource('opportunities')
@Controller('opportunities')
export class OpportunitiesController {
  constructor(private readonly service: OpportunitiesService) {}

  private getUser(req: Request) {
    const user = ((req as any)?.user ?? {}) as any;
    const id = String(user.id ?? user.user_id ?? user.userId ?? user.sub ?? '').trim();
    const tenantId = String(user.tenant_id ?? user.tenantId ?? '').trim();

    if (!id || !tenantId) {
      throw new UnauthorizedException('Authentication context missing: req.user.id / req.user.tenant_id');
    }

    return { id, tenant_id: tenantId };
  }

  @Get()
  async list(
    @Req() req: Request,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('company_id') company_id?: string,
    @Query('lead_id') lead_id?: string,
    @Query('owner_user_id') owner_user_id?: string,
    @Query('fields') fields?: string,
  ) {
    return this.service.list(this.getUser(req), { q, status, company_id, lead_id, owner_user_id, fields });
  }

  @Get(':id')
  async findById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findById(this.getUser(req), id);
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateOpportunityDto) {
    return this.service.create(this.getUser(req), dto);
  }

  @Patch(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateOpportunityDto) {
    return this.service.update(this.getUser(req), id, dto);
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    return this.service.remove(this.getUser(req), id);
  }

  @Get(':id/events')
  async listEvents(@Req() req: Request, @Param('id') id: string) {
    return this.service.listTimeline(this.getUser(req), id);
  }

  @Post(':id/events')
  async addEvent(@Req() req: Request, @Param('id') id: string, @Body() body: { title?: string; description?: string }) {
    if (!body || typeof body !== 'object') {
      throw new BadRequestException('Invalid payload');
    }
    return this.service.addTimelineEvent(this.getUser(req), id, body);
  }

  @Post(':id/convert-to-invoice')
  async convertToInvoice(@Req() req: Request, @Param('id') id: string, @Body() dto: ConvertOpportunityToInvoiceDto) {
    return this.service.convertToInvoice(this.getUser(req), id, dto);
  }
}
