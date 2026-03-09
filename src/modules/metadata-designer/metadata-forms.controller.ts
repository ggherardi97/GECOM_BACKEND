import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/enums/user.role';
import { getMetadataAuthUser } from './metadata-auth.util';
import { CreateMetadataFormDto } from './dto/create-metadata-form.dto';
import { UpdateMetadataFormDto } from './dto/update-metadata-form.dto';
import { MetadataFormsService } from './metadata-forms.service';

@ApiTags('metadata-forms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('metadata')
export class MetadataFormsController {
  constructor(private readonly formsService: MetadataFormsService) {}

  @Get('entities/:id/forms')
  listByEntity(@Req() req: Request, @Param('id') entityId: string, @Query('include_inactive') includeInactive?: string) {
    const include = String(includeInactive || '').toLowerCase() === 'true';
    return this.formsService.listByEntity(getMetadataAuthUser(req), entityId, include);
  }

  @Get('entities/:id/forms/resolve')
  resolveByContext(@Req() req: Request, @Param('id') entityId: string, @Query('context') context?: string) {
    return this.formsService.resolveFormForContext(getMetadataAuthUser(req), entityId, context || 'MAIN');
  }

  @Post('entities/:id/forms')
  create(@Req() req: Request, @Param('id') entityId: string, @Body() dto: CreateMetadataFormDto) {
    return this.formsService.create(getMetadataAuthUser(req), entityId, dto);
  }

  @Put('forms/:formId')
  update(@Req() req: Request, @Param('formId') formId: string, @Body() dto: UpdateMetadataFormDto) {
    return this.formsService.update(getMetadataAuthUser(req), formId, dto);
  }

  @Post('entities/:id/forms/:formId/publish')
  publish(@Req() req: Request, @Param('id') entityId: string, @Param('formId') formId: string) {
    return this.formsService.publishForm(getMetadataAuthUser(req), entityId, formId);
  }
}

