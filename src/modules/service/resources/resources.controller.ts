import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { getTenantId } from '../common/request-auth.util';
import { CreateAppointmentDto, CreateResourceDto, UpdateAppointmentDto, UpdateResourceDto } from './resources.dto';
import { ResourcesService } from './resources.service';

@UseGuards(JwtAuthGuard)
@Controller('service/resources')
export class ResourcesController {
  constructor(private readonly service: ResourcesService) {}

  @Get()
  listResources(@Req() req: any) {
    return this.service.listResources(getTenantId(req));
  }

  @Post()
  createResource(@Req() req: any, @Body() dto: CreateResourceDto) {
    return this.service.createResource(getTenantId(req), dto);
  }

  @Get('appointments')
  listAppointments(@Req() req: any) {
    return this.service.listAppointments(getTenantId(req));
  }

  @Get('appointments/:id')
  getAppointment(@Req() req: any, @Param('id') id: string) {
    return this.service.getAppointment(getTenantId(req), id);
  }

  @Post('appointments')
  createAppointment(@Req() req: any, @Body() dto: CreateAppointmentDto) {
    return this.service.createAppointment(getTenantId(req), dto);
  }

  @Patch('appointments/:id')
  updateAppointment(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateAppointmentDto) {
    return this.service.updateAppointment(getTenantId(req), id, dto);
  }

  @Delete('appointments/:id')
  removeAppointment(@Req() req: any, @Param('id') id: string) {
    return this.service.removeAppointment(getTenantId(req), id);
  }

  @Get(':id')
  getResource(@Req() req: any, @Param('id') id: string) {
    return this.service.getResource(getTenantId(req), id);
  }

  @Patch(':id')
  updateResource(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateResourceDto) {
    return this.service.updateResource(getTenantId(req), id, dto);
  }

  @Delete(':id')
  removeResource(@Req() req: any, @Param('id') id: string) {
    return this.service.removeResource(getTenantId(req), id);
  }
}
