import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/enums/user.role';
import { AdminConfigService } from './admin-config.service';
import {
  CreateEmailIntegrationDto,
  CreateOptionSetDto,
  CreateOptionSetOptionDto,
  PutMenuConfigDto,
  PutThemeSettingsDto,
  TestEmailIntegrationDto,
  ToggleEmailIntegrationDto,
  ToggleOptionActiveDto,
  UpdateEmailIntegrationDto,
  UpdateOptionSetOptionDto,
} from './dto/admin-config.dto';

type AuthUser = {
  id: string;
  tenant_id: string;
  role?: string;
};

@ApiTags('admin-config')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('admin')
export class AdminConfigController {
  constructor(private readonly service: AdminConfigService) {}

  private getUser(req: Request): AuthUser {
    const user = ((req as any)?.user ?? {}) as any;
    const id = String(user.id ?? user.user_id ?? user.userId ?? user.sub ?? '').trim();
    const tenantId = String(user.tenant_id ?? user.tenantId ?? '').trim();
    const role = String(user.role ?? '').trim();

    if (!id || !tenantId) {
      throw new BadRequestException('Contexto de autenticacao ausente: req.user.id / req.user.tenant_id');
    }

    return { id, tenant_id: tenantId, role };
  }

  @Get('metadata/entities')
  @Roles(UserRole.ADMIN)
  listEntities(@Req() req: Request) {
    return this.service.listMetadataEntities(this.getUser(req));
  }

  @Get('menu')
  getMenu(@Req() req: Request) {
    return this.service.getMenu(this.getUser(req));
  }

  @Put('menu')
  @Roles(UserRole.ADMIN)
  putMenu(@Req() req: Request, @Body() dto: PutMenuConfigDto) {
    return this.service.updateMenu(this.getUser(req), dto);
  }

  @Get('theme')
  getTheme(@Req() req: Request) {
    return this.service.getTheme(this.getUser(req));
  }

  @Put('theme')
  @Roles(UserRole.ADMIN)
  putTheme(@Req() req: Request, @Body() dto: PutThemeSettingsDto) {
    return this.service.updateTheme(this.getUser(req), dto);
  }

  @Get('option-sets')
  @Roles(UserRole.ADMIN)
  listOptionSets(
    @Req() req: Request,
    @Query('entity') entity?: string,
    @Query('field') field?: string,
  ) {
    return this.service.listOptionSets(this.getUser(req), entity, field);
  }

  @Post('option-sets')
  @Roles(UserRole.ADMIN)
  createOptionSet(@Req() req: Request, @Body() dto: CreateOptionSetDto) {
    return this.service.createOptionSet(this.getUser(req), dto);
  }

  @Get('option-sets/:id/options')
  @Roles(UserRole.ADMIN)
  listOptionSetOptions(@Req() req: Request, @Param('id') optionSetId: string) {
    return this.service.listOptionSetOptions(this.getUser(req), optionSetId);
  }

  @Post('option-sets/:id/options')
  @Roles(UserRole.ADMIN)
  createOptionSetOption(
    @Req() req: Request,
    @Param('id') optionSetId: string,
    @Body() dto: CreateOptionSetOptionDto,
  ) {
    return this.service.createOptionSetOption(this.getUser(req), optionSetId, dto);
  }

  @Put('options/:id')
  @Roles(UserRole.ADMIN)
  updateOption(@Req() req: Request, @Param('id') optionId: string, @Body() dto: UpdateOptionSetOptionDto) {
    return this.service.updateOption(this.getUser(req), optionId, dto);
  }

  @Patch('options/:id/toggle-active')
  @Roles(UserRole.ADMIN)
  toggleOption(@Req() req: Request, @Param('id') optionId: string, @Body() dto: ToggleOptionActiveDto) {
    return this.service.toggleOptionActive(this.getUser(req), optionId, dto);
  }

  @Get('email-integrations')
  @Roles(UserRole.ADMIN)
  listEmailIntegrations(@Req() req: Request) {
    return this.service.listEmailIntegrations(this.getUser(req));
  }

  @Post('email-integrations')
  @Roles(UserRole.ADMIN)
  createEmailIntegration(@Req() req: Request, @Body() dto: CreateEmailIntegrationDto) {
    return this.service.createEmailIntegration(this.getUser(req), dto);
  }

  @Put('email-integrations/:id')
  @Roles(UserRole.ADMIN)
  updateEmailIntegration(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateEmailIntegrationDto,
  ) {
    return this.service.updateEmailIntegration(this.getUser(req), id, dto);
  }

  @Patch('email-integrations/:id/toggle-active')
  @Roles(UserRole.ADMIN)
  toggleEmailIntegration(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: ToggleEmailIntegrationDto,
  ) {
    return this.service.toggleEmailIntegration(this.getUser(req), id, dto);
  }

  @Post('email-integrations/test')
  @Roles(UserRole.ADMIN)
  testEmailIntegration(@Req() req: Request, @Body() dto: TestEmailIntegrationDto) {
    return this.service.testEmailIntegration(this.getUser(req), dto);
  }
}
