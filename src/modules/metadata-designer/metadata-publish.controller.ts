import { Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/enums/user.role';
import { getMetadataAuthUser } from './metadata-auth.util';
import { MetadataPublishService } from './metadata-publish.service';

@ApiTags('metadata-publish')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('metadata')
export class MetadataPublishController {
  constructor(private readonly publishService: MetadataPublishService) {}

  @Post('entities/:id/publish')
  publishEntity(@Req() req: Request, @Param('id') entityId: string) {
    return this.publishService.publishEntity(getMetadataAuthUser(req), entityId);
  }

  @Get('entities/:id/publish-log')
  listPublishLog(@Req() req: Request, @Param('id') entityId: string) {
    return this.publishService.listPublishLog(getMetadataAuthUser(req), entityId);
  }
}

