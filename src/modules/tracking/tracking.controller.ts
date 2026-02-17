import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GetTrackingQueryDto } from './dto/get-tracking-query.dto';
import { UpsertTrackingLinkDto } from './dto/upsert-tracking-link.dto';
import { TrackingService } from './tracking.service';

type AuthUser = {
  id: string;
  tenant_id: string;
};

@ApiTags('tracking')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('processes/:processId/tracking')
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Get()
  @ApiOperation({ summary: 'Get normalized tracking snapshot for a process' })
  async getTracking(
    @Req() req: Request,
    @Param('processId') processId: string,
    @Query() query: GetTrackingQueryDto,
  ) {
    const user = this.getUser(req);
    return this.trackingService.getTrackingSnapshot({
      tenantId: user.tenant_id,
      processId,
      forceRefresh: query.refresh === true,
    });
  }

  @Put('link')
  @ApiOperation({ summary: 'Create or update process tracking link' })
  async upsertLink(@Req() req: Request, @Param('processId') processId: string, @Body() dto: UpsertTrackingLinkDto) {
    const user = this.getUser(req);
    return this.trackingService.upsertTrackingLink({
      tenantId: user.tenant_id,
      processId,
      dto,
    });
  }

  @Delete('link')
  @ApiOperation({ summary: 'Delete process tracking link' })
  async deleteLink(@Req() req: Request, @Param('processId') processId: string) {
    const user = this.getUser(req);
    return this.trackingService.deleteTrackingLink({
      tenantId: user.tenant_id,
      processId,
    });
  }

  private getUser(req: Request): AuthUser {
    const user = ((req as any)?.user ?? {}) as any;

    const id = String(user.id ?? user.user_id ?? user.userId ?? user.sub ?? '').trim();
    const tenantId = String(user.tenant_id ?? user.tenantId ?? '').trim();

    if (!id || !tenantId) {
      throw new UnauthorizedException('Authentication context missing: req.user.id / req.user.tenant_id');
    }

    return {
      id,
      tenant_id: tenantId,
    };
  }
}
