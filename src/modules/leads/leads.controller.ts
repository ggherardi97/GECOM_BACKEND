import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { LeadsService } from './leads.service';
import { CreateLeadDto } from './dto/create-lead.dto';
import { UpdateLeadDto } from './dto/update-lead.dto';
import { MoveLeadStageDto } from './dto/move-lead-stage.dto';
import { CreateLeadStageDto } from './dto/create-lead-stage.dto';
import { UpdateLeadStageDto } from './dto/update-lead-stage.dto';
import { CreateLeadActivityDto } from './dto/create-lead-activity.dto';
import { UpdateLeadActivityDto } from './dto/update-lead-activity.dto';
import { CreateLeadTagDto } from './dto/create-lead-tag.dto';
import { SetLeadTagsDto } from './dto/set-lead-tags.dto';
import { ConvertLeadDto } from './dto/convert-lead.dto';
import { ListLeadsQueryDto } from './dto/list-leads.dto';
import { AccessResource } from '../access-control/decorators/access-resource.decorator';

@ApiTags('leads')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@AccessResource('leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly service: LeadsService) {}

  private getUser(req: Request) {
    const user = ((req as any)?.user ?? {}) as any;

    const id = String(user.id ?? user.user_id ?? user.userId ?? user.sub ?? '').trim();
    const tenantId = String(user.tenant_id ?? user.tenantId ?? '').trim();

    if (!id || !tenantId) {
      throw new UnauthorizedException('Authentication context missing: req.user.id / req.user.tenant_id');
    }

    return {
      id,
      user_id: id,
      tenant_id: tenantId,
      role: user.role ? String(user.role) : undefined,
    };
  }

  @Get('stages')
  async listStages(@Req() req: Request) {
    return this.service.listStages(this.getUser(req));
  }

  @Post('stages')
  async createStage(@Req() req: Request, @Body() dto: CreateLeadStageDto) {
    return this.service.createStage(this.getUser(req), dto);
  }

  @Patch('stages/:stageId')
  async updateStage(@Req() req: Request, @Param('stageId') stageId: string, @Body() dto: UpdateLeadStageDto) {
    return this.service.updateStage(this.getUser(req), stageId, dto);
  }

  @Get()
  async listLeads(@Req() req: Request, @Query() query: ListLeadsQueryDto) {
    return this.service.listLeads(this.getUser(req), query);
  }

  @Get(':leadId')
  async getLeadById(@Req() req: Request, @Param('leadId') leadId: string) {
    return this.service.getLeadById(this.getUser(req), leadId);
  }

  @Post()
  async createLead(@Req() req: Request, @Body() dto: CreateLeadDto) {
    return this.service.createLead(this.getUser(req), dto);
  }

  @Patch(':leadId')
  async updateLead(@Req() req: Request, @Param('leadId') leadId: string, @Body() dto: UpdateLeadDto) {
    return this.service.updateLead(this.getUser(req), leadId, dto);
  }

  @Post(':leadId/stage')
  async moveLeadStage(@Req() req: Request, @Param('leadId') leadId: string, @Body() dto: MoveLeadStageDto) {
    return this.service.moveStage(this.getUser(req), leadId, dto);
  }

  @Post(':leadId/convert')
  async convertLead(@Req() req: Request, @Param('leadId') leadId: string, @Body() dto: ConvertLeadDto) {
    return this.service.convertLead(this.getUser(req), leadId, dto);
  }

  @Get(':leadId/activities')
  async listActivities(@Req() req: Request, @Param('leadId') leadId: string) {
    return this.service.listActivities(this.getUser(req), leadId);
  }

  @Post(':leadId/activities')
  async createActivity(@Req() req: Request, @Param('leadId') leadId: string, @Body() dto: CreateLeadActivityDto) {
    return this.service.createActivity(this.getUser(req), leadId, dto);
  }

  @Patch('activities/:activityId')
  async updateActivity(@Req() req: Request, @Param('activityId') activityId: string, @Body() dto: UpdateLeadActivityDto) {
    return this.service.updateActivity(this.getUser(req), activityId, dto);
  }

  @Get('meta/tags')
  async listTags(@Req() req: Request) {
    return this.service.listTags(this.getUser(req));
  }

  @Post('meta/tags')
  async createTag(@Req() req: Request, @Body() dto: CreateLeadTagDto) {
    return this.service.createTag(this.getUser(req), dto);
  }

  @Put(':leadId/tags')
  async setLeadTags(@Req() req: Request, @Param('leadId') leadId: string, @Body() dto: SetLeadTagsDto) {
    return this.service.setLeadTags(this.getUser(req), leadId, dto);
  }
}
