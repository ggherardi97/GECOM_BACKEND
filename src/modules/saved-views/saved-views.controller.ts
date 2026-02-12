import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
  UnauthorizedException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';

import { CreateSavedViewDto } from './dto/create-saved-view.dto';
import { ListSavedViewsQueryDto } from './dto/list-saved-views.dto';
import { UpdateSavedViewDto } from './dto/update-saved-view.dto';
import { SavedViewsService } from './saved-views.service';
import { RequestUser } from './saved-views.types';

import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('saved-views')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('saved-views')
export class SavedViewsController {
  constructor(private readonly service: SavedViewsService) {}

private getUser(req: Request): RequestUser {
  const user = ((req as any)?.user ?? {}) as any;

  // Accept multiple common JWT payload shapes
  const idRaw =
    user.id ??
    user.user_id ??
    user.userId ??
    user.sub ??
    user.uid;

  const tenantRaw =
    user.tenant_id ??
    user.tenantId ??
    user.tenantid ??
    user.tenant ??
    user.tid;

  const id = idRaw != null ? String(idRaw) : "";
  const tenantId = tenantRaw != null ? String(tenantRaw) : "";

  if (id.trim().length === 0 || tenantId.trim().length === 0) {
    // Helpful debug (won't break prod; remove if you want)
    // eslint-disable-next-line no-console
    console.warn("[SavedViews] Missing auth context. req.user keys:", Object.keys(user || {}));

    throw new UnauthorizedException(
      "Authentication context missing: req.user.id / req.user.tenant_id."
    );
  }

  return {
    id,
    tenant_id: tenantId,
    role: user.role != null ? String(user.role) : undefined,
  };
}


  @Get()
  async list(@Req() req: Request, @Query() query: ListSavedViewsQueryDto) {
    const user = this.getUser(req);
    if (!query.entity_name) return [];

    return this.service.listByEntity({
      tenantId: user.tenant_id,
      entityName: query.entity_name,
      userId: user.id,
      userRole: user.role,
      includeInactive: query.include_inactive,
    });
  }

  @Get('default/:entityName')
  async getDefault(@Req() req: Request, @Param('entityName') entityName: string) {
    const user = this.getUser(req);
    return this.service.getDefault({ tenantId: user.tenant_id, userId: user.id, entityName });
  }

  @Put('default/:entityName/:savedViewId')
  async setDefault(
    @Req() req: Request,
    @Param('entityName') entityName: string,
    @Param('savedViewId') savedViewId: string,
  ) {
    const user = this.getUser(req);
    return this.service.setDefault({ tenantId: user.tenant_id, userId: user.id, entityName, savedViewId });
  }

  @Delete('default/:entityName')
  async clearDefault(@Req() req: Request, @Param('entityName') entityName: string) {
    const user = this.getUser(req);
    return this.service.clearDefault({ tenantId: user.tenant_id, userId: user.id, entityName });
  }

  @Get(':id')
  async getById(@Req() req: Request, @Param('id') id: string) {
    const user = this.getUser(req);
    return this.service.getById({ tenantId: user.tenant_id, id, userId: user.id, userRole: user.role });
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateSavedViewDto) {
    const user = this.getUser(req);
    return this.service.create({ tenantId: user.tenant_id, userId: user.id }, dto);
  }

  @Patch(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateSavedViewDto) {
    const user = this.getUser(req);
    return this.service.update({ tenantId: user.tenant_id, id, userId: user.id }, dto);
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    const user = this.getUser(req);
    return this.service.remove({ tenantId: user.tenant_id, id, userId: user.id });
  }
}
