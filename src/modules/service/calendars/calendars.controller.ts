import { Body, Controller, Delete, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from 'src/modules/auth/guards/jwt-auth.guard';
import { getTenantId } from '../common/request-auth.util';
import {
  CreateCalendarDto,
  CreateCalendarExceptionDto,
  CreateCalendarRuleDto,
  UpdateCalendarDto,
  UpdateCalendarExceptionDto,
  UpdateCalendarRuleDto,
} from './calendars.dto';
import { CalendarsService } from './calendars.service';

@UseGuards(JwtAuthGuard)
@Controller('service/calendars')
export class CalendarsController {
  constructor(private readonly service: CalendarsService) {}

  @Get()
  listCalendars(@Req() req: any) {
    return this.service.listCalendars(getTenantId(req));
  }

  @Post()
  createCalendar(@Req() req: any, @Body() dto: CreateCalendarDto) {
    return this.service.createCalendar(getTenantId(req), dto);
  }

  @Get('rules')
  listRules(@Req() req: any) {
    return this.service.listRules(getTenantId(req));
  }

  @Get('rules/:id')
  getRule(@Req() req: any, @Param('id') id: string) {
    return this.service.getRule(getTenantId(req), id);
  }

  @Post('rules')
  createRule(@Req() req: any, @Body() dto: CreateCalendarRuleDto) {
    return this.service.createRule(getTenantId(req), dto);
  }

  @Patch('rules/:id')
  updateRule(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCalendarRuleDto) {
    return this.service.updateRule(getTenantId(req), id, dto);
  }

  @Delete('rules/:id')
  removeRule(@Req() req: any, @Param('id') id: string) {
    return this.service.removeRule(getTenantId(req), id);
  }

  @Get('exceptions')
  listExceptions(@Req() req: any) {
    return this.service.listExceptions(getTenantId(req));
  }

  @Get('exceptions/:id')
  getException(@Req() req: any, @Param('id') id: string) {
    return this.service.getException(getTenantId(req), id);
  }

  @Post('exceptions')
  createException(@Req() req: any, @Body() dto: CreateCalendarExceptionDto) {
    return this.service.createException(getTenantId(req), dto);
  }

  @Patch('exceptions/:id')
  updateException(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCalendarExceptionDto) {
    return this.service.updateException(getTenantId(req), id, dto);
  }

  @Delete('exceptions/:id')
  removeException(@Req() req: any, @Param('id') id: string) {
    return this.service.removeException(getTenantId(req), id);
  }

  @Get(':id')
  getCalendar(@Req() req: any, @Param('id') id: string) {
    return this.service.getCalendar(getTenantId(req), id);
  }

  @Patch(':id')
  updateCalendar(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateCalendarDto) {
    return this.service.updateCalendar(getTenantId(req), id, dto);
  }

  @Delete(':id')
  removeCalendar(@Req() req: any, @Param('id') id: string) {
    return this.service.removeCalendar(getTenantId(req), id);
  }
}
