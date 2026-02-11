import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, Req } from '@nestjs/common';
import { CreateSavedViewDto } from './dto/create-saved-view.dto';
import { ListSavedViewsQueryDto } from './dto/list-saved-views.dto';
import { UpdateSavedViewDto } from './dto/update-saved-view.dto';
import { SavedViewsService } from './saved-views.service';
import { RequestUser } from './saved-views.types';

@Controller('api/saved-views')
export class SavedViewsController {
  constructor(private readonly service: SavedViewsService) {}

  private getUser(req: any): RequestUser {
    // Your auth layer should set req.user. This keeps compilation safe.
    const user = (req?.user ?? {}) as Partial<RequestUser>;
    return {
      id: String(user.id ?? ''),
      tenant_id: String(user.tenant_id ?? ''),
      role: user.role ? String(user.role) : undefined,
    };
  }

  @Get()
  async list(@Req() req: any, @Query() query: ListSavedViewsQueryDto) {
    const user = this.getUser(req);

    // entity_name is required for listing
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
  async getDefault(@Req() req: any, @Param('entityName') entityName: string) {
    const user = this.getUser(req);
    return this.service.getDefault({ tenantId: user.tenant_id, userId: user.id, entityName });
  }

  @Put('default/:entityName/:savedViewId')
  async setDefault(@Req() req: any, @Param('entityName') entityName: string, @Param('savedViewId') savedViewId: string) {
    const user = this.getUser(req);
    return this.service.setDefault({ tenantId: user.tenant_id, userId: user.id, entityName, savedViewId });
  }

  @Delete('default/:entityName')
  async clearDefault(@Req() req: any, @Param('entityName') entityName: string) {
    const user = this.getUser(req);
    return this.service.clearDefault({ tenantId: user.tenant_id, userId: user.id, entityName });
  }

  @Get(':id')
  async getById(@Req() req: any, @Param('id') id: string) {
    const user = this.getUser(req);
    return this.service.getById({ tenantId: user.tenant_id, id, userId: user.id, userRole: user.role });
  }

  @Post()
  async create(@Req() req: any, @Body() dto: CreateSavedViewDto) {
    const user = this.getUser(req);
    return this.service.create({ tenantId: user.tenant_id, userId: user.id }, dto);
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() dto: UpdateSavedViewDto) {
    const user = this.getUser(req);
    return this.service.update({ tenantId: user.tenant_id, id, userId: user.id }, dto);
  }

  @Delete(':id')
  async remove(@Req() req: any, @Param('id') id: string) {
    const user = this.getUser(req);
    return this.service.remove({ tenantId: user.tenant_id, id, userId: user.id });
  }
}
