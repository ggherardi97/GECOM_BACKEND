import {
  Body,
  Controller,
  Get,
  Param,
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
import { CalendarActivitiesService } from './calendar-activities.service';

type AuthUser = {
  id: string;
  tenant_id: string;
  role?: string;
};

@ApiTags('calendar-activities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('calendar-activities')
export class CalendarActivitiesController {
  constructor(private readonly service: CalendarActivitiesService) {}

  private getUser(req: Request): AuthUser {
    const user = ((req as any)?.user ?? {}) as any;
    const id = String(user.id ?? user.user_id ?? user.userId ?? user.sub ?? '').trim();
    const tenantId = String(user.tenant_id ?? user.tenantId ?? '').trim();
    const role = String(user.role ?? '').trim();
    if (!id || !tenantId) {
      throw new UnauthorizedException('Authentication context missing: req.user.id / req.user.tenant_id');
    }
    return { id, tenant_id: tenantId, role };
  }

  @Get('definitions')
  definitions() {
    return this.service.getDefinitions();
  }

  @Get('events')
  listEvents(
    @Req() req: Request,
    @Query('start') start?: string,
    @Query('end') end?: string,
    @Query('types') types?: string,
  ) {
    return this.service.listEvents(this.getUser(req), { start, end, types });
  }

  @Get('lookups/:entity')
  lookup(
    @Req() req: Request,
    @Param('entity') entity: string,
    @Query('q') q?: string,
    @Query('limit') limit?: string,
    @Query('related_table') relatedTable?: string,
  ) {
    const max = Number(limit);
    return this.service.lookup(this.getUser(req), entity, {
      q,
      related_table: relatedTable,
      limit: Number.isFinite(max) ? max : undefined,
    });
  }

  @Post(':type')
  create(@Req() req: Request, @Param('type') type: string, @Body() payload: any) {
    return this.service.create(this.getUser(req), type, payload || {});
  }
}

