import { Body, Controller, Delete, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/enums/user.role';
import { getMetadataAuthUser } from './metadata-auth.util';
import { CreateMetadataFieldDto } from './dto/create-metadata-field.dto';
import { UpdateMetadataFieldDto } from './dto/update-metadata-field.dto';
import { MetadataFieldsService } from './metadata-fields.service';

@ApiTags('metadata-fields')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('metadata')
export class MetadataFieldsController {
  constructor(private readonly fieldsService: MetadataFieldsService) {}

  @Get('entities/:id/fields')
  listByEntity(@Req() req: Request, @Param('id') entityId: string, @Query('include_inactive') includeInactive?: string) {
    const include = String(includeInactive || '').toLowerCase() === 'true';
    return this.fieldsService.listByEntity(getMetadataAuthUser(req), entityId, include);
  }

  @Post('entities/:id/fields')
  create(@Req() req: Request, @Param('id') entityId: string, @Body() dto: CreateMetadataFieldDto) {
    return this.fieldsService.create(getMetadataAuthUser(req), entityId, dto);
  }

  @Put('fields/:fieldId')
  update(@Req() req: Request, @Param('fieldId') fieldId: string, @Body() dto: UpdateMetadataFieldDto) {
    return this.fieldsService.update(getMetadataAuthUser(req), fieldId, dto);
  }

  @Delete('fields/:fieldId')
  remove(@Req() req: Request, @Param('fieldId') fieldId: string) {
    return this.fieldsService.softDelete(getMetadataAuthUser(req), fieldId);
  }
}

