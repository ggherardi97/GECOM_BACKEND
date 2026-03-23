import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { getAuthUser, getTenantId, getUserId } from '../common/request-auth.util';
import { CreateIncidentDto, UpdateIncidentDto } from './incidents.dto';
import { IncidentsService } from './incidents.service';

@UseGuards(JwtAuthGuard)
@Controller('service/incidents')
export class IncidentsController {
  constructor(private readonly service: IncidentsService) {}

  @Get()
  list(@Req() req: any) {
    return this.service.list(getTenantId(req));
  }

  @Get(':id/timeline')
  timeline(@Req() req: any, @Param('id') id: string) {
    return this.service.getTimeline(getTenantId(req), id);
  }

  @Get(':id/related')
  related(@Req() req: any, @Param('id') id: string) {
    return this.service.getRelated(getTenantId(req), id);
  }

  @Get(':id')
  getById(@Req() req: any, @Param('id') id: string) {
    return this.service.getById(getTenantId(req), id);
  }

  @Post()
  create(@Req() req: any, @Body() dto: CreateIncidentDto) {
    return this.service.create(getTenantId(req), getUserId(req), dto);
  }

  @Patch(':id')
  update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateIncidentDto) {
    return this.service.update(getTenantId(req), getUserId(req), id, dto);
  }

  @Post(':id/create-work-order')
  createWorkOrder(@Req() req: any, @Param('id') id: string, @Body() dto: any) {
    return this.service.createWorkOrderFromIncident(getAuthUser(req), id, dto || {});
  }

  @Delete(':id')
  remove(@Req() req: any, @Param('id') id: string) {
    return this.service.remove(getTenantId(req), id);
  }
}
