import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { AddPlanModuleDto } from './dto/add-plan-module.dto';
import { UpdatePlanModuleDto } from './dto/update-plan-module.dto';
import { UpsertTenantSubscriptionDto } from './dto/upsert-tenant-subscription.dto';
import { UpsertTenantModuleOverrideDto } from './dto/upsert-tenant-module-override.dto';
import { UpdateAreaEntityConfigDto } from './dto/update-area-entity-config.dto';
import { ModulesService } from './modules.service';
import { PlansService } from './plans.service';
import { TenantSubscriptionService } from './tenant-subscription.service';
import { TenantModulesResolverService } from './tenant-modules-resolver.service';
import { BillingAreaEntityConfigService } from './billing-area-entity-config.service';
import { AdminOnlyGuard } from './guards/admin-only.guard';
import { Public } from '../auth/decorators/public.decorator';
import { BillingBootstrapGuard } from './guards/billing-bootstrap.guard';

function parseOptionalBoolean(value?: string): boolean | undefined {
  if (value === undefined || value === null || String(value).trim() === '') return undefined;
  const normalized = String(value).trim().toLowerCase();
  return normalized === '1' || normalized === 'true' || normalized === 'yes';
}

@ApiTags('billing-admin')
@ApiBearerAuth()
@UseGuards(AdminOnlyGuard)
@Controller('admin/billing')
export class BillingPlansAdminController {
  constructor(
    private readonly modulesService: ModulesService,
    private readonly plansService: PlansService,
    private readonly tenantSubscriptionService: TenantSubscriptionService,
    private readonly tenantModulesResolverService: TenantModulesResolverService,
    private readonly billingAreaEntityConfigService: BillingAreaEntityConfigService,
  ) {}

  @Get('modules')
  listModules(@Query('q') q?: string, @Query('is_active') is_active?: string) {
    return this.modulesService.list({
      q,
      is_active: parseOptionalBoolean(is_active),
    });
  }

  @Post('modules')
  createModule(@Body() dto: CreateModuleDto) {
    return this.modulesService.create(dto);
  }

  @Get('modules/:id')
  getModule(@Param('id') id: string) {
    return this.modulesService.getById(id);
  }

  @Put('modules/:id')
  updateModule(@Param('id') id: string, @Body() dto: UpdateModuleDto) {
    return this.modulesService.update(id, dto);
  }

  @Get('plans')
  listPlans(@Query('q') q?: string, @Query('is_active') is_active?: string) {
    return this.plansService.list({
      q,
      is_active: parseOptionalBoolean(is_active),
    });
  }

  @Post('plans')
  createPlan(@Body() dto: CreatePlanDto) {
    return this.plansService.create(dto);
  }

  @Get('plans/:id')
  getPlan(@Param('id') id: string) {
    return this.plansService.getById(id);
  }

  @Put('plans/:id')
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.update(id, dto);
  }

  @Get('plans/:id/modules')
  listPlanModules(@Param('id') planId: string) {
    return this.plansService.listPlanModules(planId);
  }

  @Post('plans/:id/modules')
  addPlanModule(@Param('id') planId: string, @Body() dto: AddPlanModuleDto) {
    return this.plansService.addModule(planId, dto);
  }

  @Put('plan-modules/:id')
  updatePlanModule(@Param('id') id: string, @Body() dto: UpdatePlanModuleDto) {
    return this.plansService.updatePlanModule(id, dto);
  }

  @Delete('plan-modules/:id')
  removePlanModule(@Param('id') id: string) {
    return this.plansService.removePlanModule(id);
  }

  @Get('area-entity-config')
  getAreaEntityConfig() {
    return this.billingAreaEntityConfigService.getConfig();
  }

  @Get('area-entity-config/entities')
  listAreaEntityConfigEntities() {
    return this.billingAreaEntityConfigService.listAvailableEntities();
  }

  @Put('area-entity-config')
  updateAreaEntityConfig(@Body() dto: UpdateAreaEntityConfigDto) {
    return this.billingAreaEntityConfigService.updateConfig(dto);
  }

  @Get('tenants/:tenantId/subscription')
  getTenantSubscription(@Param('tenantId') tenantId: string) {
    return this.tenantSubscriptionService.getCurrentByTenant(tenantId);
  }

  @Put('tenants/:tenantId/subscription')
  upsertTenantSubscription(
    @Param('tenantId') tenantId: string,
    @Body() dto: UpsertTenantSubscriptionDto,
  ) {
    return this.tenantSubscriptionService.upsertByTenant(tenantId, dto);
  }

  @Get('tenants/:tenantId/overrides')
  getTenantOverrides(@Param('tenantId') tenantId: string) {
    return this.tenantModulesResolverService.getOverridesByTenant(tenantId);
  }

  @Put('tenants/:tenantId/overrides/:moduleId')
  upsertTenantOverride(
    @Param('tenantId') tenantId: string,
    @Param('moduleId') moduleId: string,
    @Body() dto: UpsertTenantModuleOverrideDto,
  ) {
    return this.tenantModulesResolverService.upsertOverride(tenantId, moduleId, dto);
  }
}

@ApiTags('billing-admin')
@ApiBearerAuth()
@UseGuards(AdminOnlyGuard)
@Controller('admin/tenants')
export class BillingTenantsAdminController {
  constructor(private readonly tenantSubscriptionService: TenantSubscriptionService) {}

  @Get('search')
  searchTenants(@Query('q') q?: string, @Query('limit') limit?: string) {
    const max = Number(limit);
    return this.tenantSubscriptionService.searchTenants({
      q,
      limit: Number.isFinite(max) ? max : undefined,
    });
  }
}

@ApiTags('billing')
@ApiBearerAuth()
@Controller('me')
export class BillingMeController {
  constructor(
    private readonly tenantModulesResolverService: TenantModulesResolverService,
    private readonly billingAreaEntityConfigService: BillingAreaEntityConfigService,
  ) {}

  @Get('modules')
  async getMyModules(@Req() req: any) {
    const tenantId = String(req?.user?.tenant_id ?? '').trim();
    if (!tenantId) throw new BadRequestException('tenant_id ausente no usuario autenticado.');

    const [enabledModules, enabledAreas, areaEntityConfig] = await Promise.all([
      this.tenantModulesResolverService.getEnabledModules(tenantId),
      this.tenantModulesResolverService.getEnabledAreas(tenantId),
      this.billingAreaEntityConfigService.getConfig(),
    ]);

    return { tenant_id: tenantId, enabledModules, enabledAreas, areaEntityConfig };
  }
}

@ApiTags('billing-public')
@Controller('public/billing')
export class BillingPublicController {
  constructor(
    private readonly modulesService: ModulesService,
    private readonly plansService: PlansService,
  ) {}

  @Public()
  @Get('plans')
  listPublicPlans() {
    return this.plansService.listPublicPlans();
  }

  @Public()
  @Get('modules')
  listPublicModules() {
    return this.modulesService.listPublicModules();
  }
}

@ApiTags('billing-bootstrap')
@Public()
@UseGuards(BillingBootstrapGuard)
@Controller('public/bootstrap/billing')
export class BillingBootstrapController {
  constructor(
    private readonly modulesService: ModulesService,
    private readonly plansService: PlansService,
    private readonly billingAreaEntityConfigService: BillingAreaEntityConfigService,
  ) {}

  @Get('modules')
  listModules(@Query('q') q?: string, @Query('is_active') is_active?: string) {
    return this.modulesService.list({
      q,
      is_active: parseOptionalBoolean(is_active),
    });
  }

  @Post('modules')
  createModule(@Body() dto: CreateModuleDto) {
    return this.modulesService.create(dto);
  }

  @Get('modules/:id')
  getModule(@Param('id') id: string) {
    return this.modulesService.getById(id);
  }

  @Put('modules/:id')
  updateModule(@Param('id') id: string, @Body() dto: UpdateModuleDto) {
    return this.modulesService.update(id, dto);
  }

  @Get('plans')
  listPlans(@Query('q') q?: string, @Query('is_active') is_active?: string) {
    return this.plansService.list({
      q,
      is_active: parseOptionalBoolean(is_active),
    });
  }

  @Post('plans')
  createPlan(@Body() dto: CreatePlanDto) {
    return this.plansService.create(dto);
  }

  @Get('plans/:id')
  getPlan(@Param('id') id: string) {
    return this.plansService.getById(id);
  }

  @Put('plans/:id')
  updatePlan(@Param('id') id: string, @Body() dto: UpdatePlanDto) {
    return this.plansService.update(id, dto);
  }

  @Get('plans/:id/modules')
  listPlanModules(@Param('id') planId: string) {
    return this.plansService.listPlanModules(planId);
  }

  @Post('plans/:id/modules')
  addPlanModule(@Param('id') planId: string, @Body() dto: AddPlanModuleDto) {
    return this.plansService.addModule(planId, dto);
  }

  @Put('plan-modules/:id')
  updatePlanModule(@Param('id') id: string, @Body() dto: UpdatePlanModuleDto) {
    return this.plansService.updatePlanModule(id, dto);
  }

  @Delete('plan-modules/:id')
  removePlanModule(@Param('id') id: string) {
    return this.plansService.removePlanModule(id);
  }

  @Get('area-entity-config')
  getAreaEntityConfig() {
    return this.billingAreaEntityConfigService.getConfig();
  }

  @Get('area-entity-config/entities')
  listAreaEntityConfigEntities() {
    return this.billingAreaEntityConfigService.listAvailableEntities();
  }

  @Put('area-entity-config')
  updateAreaEntityConfig(@Body() dto: UpdateAreaEntityConfigDto) {
    return this.billingAreaEntityConfigService.updateConfig(dto);
  }
}
