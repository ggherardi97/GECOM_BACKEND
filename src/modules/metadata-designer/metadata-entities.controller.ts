import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/enums/user.role';
import { getMetadataAuthUser } from './metadata-auth.util';
import { CreateMetadataEntityDto } from './dto/create-metadata-entity.dto';
import { UpdateMetadataEntityDto } from './dto/update-metadata-entity.dto';
import { MetadataEntitiesService } from './metadata-entities.service';

@ApiTags('metadata-entities')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('metadata/entities')
export class MetadataEntitiesController {
  constructor(private readonly entitiesService: MetadataEntitiesService) {}

  @Get()
  list(
    @Req() req: Request,
    @Query('sync_core') syncCore?: string,
    @Query('q') q?: string,
    @Query('page') page?: string,
    @Query('page_size') pageSize?: string,
  ) {
    const forceSyncCore = String(syncCore || 'true').toLowerCase() !== 'false';
    return this.entitiesService.list(getMetadataAuthUser(req), forceSyncCore, {
      q,
      page,
      page_size: pageSize,
    });
  }

  @Post()
  create(@Req() req: Request, @Body() dto: CreateMetadataEntityDto) {
    return this.entitiesService.createCustom(getMetadataAuthUser(req), dto);
  }

  @Get(':id')
  getById(@Req() req: Request, @Param('id') id: string) {
    return this.entitiesService.getById(getMetadataAuthUser(req), id);
  }

  @Put(':id')
  update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateMetadataEntityDto) {
    return this.entitiesService.update(getMetadataAuthUser(req), id, dto);
  }
}
