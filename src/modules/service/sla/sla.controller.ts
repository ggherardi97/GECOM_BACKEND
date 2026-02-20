import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { getTenantId } from '../common/request-auth.util';
import {
  CreateSlaEventDto,
  CreateSlaInstanceDto,
  CreateSlaInstanceKpiDto,
  CreateSlaKpiDto,
  CreateSlaPolicyDto,
  UpdateSlaEventDto,
  UpdateSlaInstanceDto,
  UpdateSlaInstanceKpiDto,
  UpdateSlaKpiDto,
  UpdateSlaPolicyDto,
} from './sla.dto';
import { SlaService } from './sla.service';

@UseGuards(JwtAuthGuard)
@Controller('service/sla')
export class SlaController {
  constructor(private readonly service: SlaService) {}

  @Get('policies')
  listPolicies(@Req() req: any) {
    return this.service.listPolicies(getTenantId(req));
  }

  @Get('policies/:id')
  getPolicy(@Req() req: any, @Param('id') id: string) {
    return this.service.getPolicy(getTenantId(req), id);
  }

  @Post('policies')
  createPolicy(@Req() req: any, @Body() dto: CreateSlaPolicyDto) {
    return this.service.createPolicy(getTenantId(req), dto);
  }

  @Patch('policies/:id')
  updatePolicy(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateSlaPolicyDto) {
    return this.service.updatePolicy(getTenantId(req), id, dto);
  }

  @Delete('policies/:id')
  removePolicy(@Req() req: any, @Param('id') id: string) {
    return this.service.removePolicy(getTenantId(req), id);
  }

  @Get('kpis')
  listKpis(@Req() req: any) {
    return this.service.listKpis(getTenantId(req));
  }

  @Get('kpis/:id')
  getKpi(@Req() req: any, @Param('id') id: string) {
    return this.service.getKpi(getTenantId(req), id);
  }

  @Post('kpis')
  createKpi(@Req() req: any, @Body() dto: CreateSlaKpiDto) {
    return this.service.createKpi(getTenantId(req), dto);
  }

  @Patch('kpis/:id')
  updateKpi(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateSlaKpiDto) {
    return this.service.updateKpi(getTenantId(req), id, dto);
  }

  @Delete('kpis/:id')
  removeKpi(@Req() req: any, @Param('id') id: string) {
    return this.service.removeKpi(getTenantId(req), id);
  }

  @Get('instances')
  listInstances(@Req() req: any) {
    return this.service.listInstances(getTenantId(req));
  }

  @Get('instances/:id')
  getInstance(@Req() req: any, @Param('id') id: string) {
    return this.service.getInstance(getTenantId(req), id);
  }

  @Post('instances')
  createInstance(@Req() req: any, @Body() dto: CreateSlaInstanceDto) {
    return this.service.createInstance(getTenantId(req), dto);
  }

  @Patch('instances/:id')
  updateInstance(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateSlaInstanceDto) {
    return this.service.updateInstance(getTenantId(req), id, dto);
  }

  @Delete('instances/:id')
  removeInstance(@Req() req: any, @Param('id') id: string) {
    return this.service.removeInstance(getTenantId(req), id);
  }

  @Get('instance-kpis')
  listInstanceKpis(@Req() req: any) {
    return this.service.listInstanceKpis(getTenantId(req));
  }

  @Get('instance-kpis/:id')
  getInstanceKpi(@Req() req: any, @Param('id') id: string) {
    return this.service.getInstanceKpi(getTenantId(req), id);
  }

  @Post('instance-kpis')
  createInstanceKpi(@Req() req: any, @Body() dto: CreateSlaInstanceKpiDto) {
    return this.service.createInstanceKpi(getTenantId(req), dto);
  }

  @Patch('instance-kpis/:id')
  updateInstanceKpi(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateSlaInstanceKpiDto) {
    return this.service.updateInstanceKpi(getTenantId(req), id, dto);
  }

  @Delete('instance-kpis/:id')
  removeInstanceKpi(@Req() req: any, @Param('id') id: string) {
    return this.service.removeInstanceKpi(getTenantId(req), id);
  }

  @Get('events')
  listEvents(@Req() req: any) {
    return this.service.listEvents(getTenantId(req));
  }

  @Get('events/:id')
  getEvent(@Req() req: any, @Param('id') id: string) {
    return this.service.getEvent(getTenantId(req), id);
  }

  @Post('events')
  createEvent(@Req() req: any, @Body() dto: CreateSlaEventDto) {
    return this.service.createEvent(getTenantId(req), dto);
  }

  @Patch('events/:id')
  updateEvent(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateSlaEventDto) {
    return this.service.updateEvent(getTenantId(req), id, dto);
  }

  @Delete('events/:id')
  removeEvent(@Req() req: any, @Param('id') id: string) {
    return this.service.removeEvent(getTenantId(req), id);
  }
}
