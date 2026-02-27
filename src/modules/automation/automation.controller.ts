import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { AutomationExecutionStatus } from '@prisma/client';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Roles } from '../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { UserRole } from '../users/enums/user.role';
import { AutomationMetadataService } from './automation-metadata.service';
import { AutomationService } from './automation.service';
import { CreateAutomationDto } from './dto/create-automation.dto';
import { ExecuteAutomationDto } from './dto/execute-automation.dto';
import { UpdateAutomationDto } from './dto/update-automation.dto';

@ApiTags('automations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.MANAGER)
@Controller('automations')
export class AutomationController {
  constructor(
    private readonly service: AutomationService,
    private readonly metadataService: AutomationMetadataService,
  ) {}

  private getUser(req: Request) {
    const user = ((req as any)?.user ?? {}) as any;

    const id = String(user.id ?? user.user_id ?? user.userId ?? user.sub ?? '').trim();
    const tenantId = String(user.tenant_id ?? user.tenantId ?? '').trim();

    if (!id || !tenantId) {
      throw new UnauthorizedException('Contexto de autenticação ausente: req.user.id / req.user.tenant_id');
    }

    return {
      id,
      tenant_id: tenantId,
      role: user.role ? String(user.role) : undefined,
    };
  }

  @Get()
  async list(@Req() req: Request) {
    return this.service.list(this.getUser(req));
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateAutomationDto) {
    return this.service.create(this.getUser(req), dto);
  }

  @Get('metadata/entities')
  async listEntities() {
    return this.metadataService.listEntities();
  }

  @Get('metadata/entities/:entityName/fields')
  async listEntityFields(@Param('entityName') entityName: string) {
    return this.metadataService.listUpdatableFields(entityName);
  }

  @Get('metadata/entities/:entityName/records')
  async listEntityRecords(
    @Req() req: Request,
    @Param('entityName') entityName: string,
    @Query('q') query?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const limit = Number(limitRaw ?? 10);
    return this.metadataService.searchRecords({
      tenantId: this.getUser(req).tenant_id,
      entityName,
      query,
      limit: Number.isFinite(limit) ? limit : 10,
    });
  }

  @Get(':id')
  async getById(@Req() req: Request, @Param('id') id: string) {
    return this.service.getById(this.getUser(req), id);
  }

  @Put(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateAutomationDto) {
    return this.service.update(this.getUser(req), id, dto);
  }

  @Post(':id/execute')
  async execute(@Req() req: Request, @Param('id') id: string, @Body() dto: ExecuteAutomationDto) {
    return this.service.executeManual(this.getUser(req), id, dto);
  }

  @Get(':id/executions')
  async listExecutions(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('status') statusRaw?: string,
    @Query('from') fromRaw?: string,
    @Query('to') toRaw?: string,
    @Query('search') search?: string,
    @Query('limit') limitRaw?: string,
  ) {
    const status = this.parseStatus(statusRaw);
    const from = this.parseDate(fromRaw);
    const to = this.parseDate(toRaw);
    const limit = Number(limitRaw ?? 100);

    return this.service.listExecutions(this.getUser(req), id, {
      ...(status ? { status } : {}),
      ...(from ? { from } : {}),
      ...(to ? { to } : {}),
      ...(search ? { search } : {}),
      ...(Number.isFinite(limit) ? { limit } : {}),
    });
  }

  private parseStatus(value?: string): AutomationExecutionStatus | undefined {
    const normalized = String(value || '')
      .trim()
      .toUpperCase();
    if (!normalized) return undefined;
    if (normalized === AutomationExecutionStatus.SUCCESS) return AutomationExecutionStatus.SUCCESS;
    if (normalized === AutomationExecutionStatus.ERROR) return AutomationExecutionStatus.ERROR;
    return undefined;
  }

  private parseDate(value?: string): Date | undefined {
    const raw = String(value || '').trim();
    if (!raw) return undefined;
    const parsed = new Date(raw);
    if (Number.isNaN(parsed.getTime())) return undefined;
    return parsed;
  }
}
