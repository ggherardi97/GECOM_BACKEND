import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Delete,
  UseGuards,
  Req,
  Query,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import {
  ApiTags,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ProcessService } from './process.service';
import { CreateProcessDTO } from './dto/create-process.dto';
import { UpdateProcessStatusDTO } from './dto/update-process-status.dto';
import { UpdateProcessDTO } from './dto/update-process.dto';

@ApiTags('processes')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('processes')
export class ProcessController {
  constructor(private readonly service: ProcessService) {}

  private getTenantId(req: Request): string {
    const tenantId = String((req as any)?.user?.tenant_id ?? (req as any)?.user?.tenantId ?? '').trim();
    if (!tenantId) throw new BadRequestException('tenant_id is missing from authenticated user.');
    return tenantId;
  }

  private getCompanyId(req: Request): string | null {
    const companyId = (req as any)?.user?.company_id ?? (req as any)?.user?.companyId ?? null;
    return companyId ? String(companyId) : null;
  }

  private isAdmin(req: Request): boolean {
    const role = String((req as any)?.user?.role ?? '').toUpperCase();
    return role === 'ADMIN' || (req as any)?.user?.isAdmin === true;
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new process',
    description: 'Creates a new process and logs a system event',
  })
  @ApiBody({ type: CreateProcessDTO })
  @ApiCreatedResponse({ description: 'Process successfully created' })
  async create(@Req() req: Request, @Body() data: CreateProcessDTO) {
    const tenantId = this.getTenantId(req);

    // Non-admin must create only for their own company_id
    if (!this.isAdmin(req)) {
      const companyId = this.getCompanyId(req);
      if (!companyId) throw new BadRequestException('company_id is missing from authenticated user.');
      if (String(data.company_id ?? '') !== companyId) {
        throw new ForbiddenException('Você não tem permissão para criar processos para outra empresa.');
      }
    }

    return this.service.create(data, tenantId);
  }

  @Get()
  @ApiOperation({
    summary: 'List processes',
    description:
      'ADMIN: all processes (optional filters: company_id, status, status_config_id). Non-admin: only processes from user company. Supports fields=dashboard for lightweight payload.',
  })
  @ApiOkResponse({ description: 'List of processes' })
  async findAll(
    @Req() req: Request,
    @Query('company_id') companyIdQuery?: string,
    @Query('status') statusQuery?: string,
    @Query('status_config_id') statusConfigIdQuery?: string,
    @Query('fields') fields?: string
  ) {
    const tenantId = this.getTenantId(req);
    const fieldsMode = String(fields ?? '').trim().toLowerCase();

    const isDashboard = fieldsMode === 'dashboard';

    if (this.isAdmin(req)) {
      const companyId = companyIdQuery && String(companyIdQuery).trim().length > 0 ? String(companyIdQuery).trim() : undefined;

      if (isDashboard) {
        return this.service.findAllDashboard(
          { company_id: companyId, status: statusQuery, status_config_id: statusConfigIdQuery },
          tenantId,
        );
      }

      return this.service.findAll(
        { company_id: companyId, status: statusQuery, status_config_id: statusConfigIdQuery },
        tenantId,
      );
    }

    const companyId = this.getCompanyId(req);
    if (!companyId) throw new BadRequestException('company_id is missing from authenticated user.');

    if (isDashboard) {
      return this.service.findAllDashboard(
        { company_id: companyId, status: statusQuery, status_config_id: statusConfigIdQuery },
        tenantId,
      );
    }

    return this.service.findAll(
      { company_id: companyId, status: statusQuery, status_config_id: statusConfigIdQuery },
      tenantId,
    );
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get process by ID',
    description: 'Returns a specific process by its ID (tenant-safe).',
  })
  @ApiParam({ name: 'id', description: 'Process ID' })
  @ApiOkResponse({ description: 'Process found' })
  async findById(@Req() req: Request, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    const process = await this.service.findById(id, tenantId);

    // Non-admin must match company
    if (!this.isAdmin(req)) {
      const companyId = this.getCompanyId(req);
      if (!companyId) throw new BadRequestException('company_id is missing from authenticated user.');

      if (String((process as any)?.company_id ?? '') !== companyId) {
        throw new ForbiddenException('Você não tem acesso a este processo.');
      }
    }

    return process;
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update process fields',
    description: 'Updates completed, ship_date and/or status for a process (tenant-safe).',
  })
  @ApiParam({ name: 'id', description: 'Process ID' })
  @ApiBody({ type: UpdateProcessDTO })
  async update(@Req() req: Request, @Param('id') id: string, @Body() data: UpdateProcessDTO) {
    const tenantId = this.getTenantId(req);

    // Authorization check via existing record (tenant-safe)
    const existing = await this.service.findById(id, tenantId);
    if (!this.isAdmin(req)) {
      const companyId = this.getCompanyId(req);
      if (!companyId) throw new BadRequestException('company_id is missing from authenticated user.');
      if (String((existing as any)?.company_id ?? '') !== companyId) {
        throw new ForbiddenException('Você não tem permissão para alterar este processo.');
      }
    }

    return this.service.update(id, tenantId, data);
  }

  @Patch(':id/status')
  @ApiOperation({
    summary: 'Update process status',
    description: 'Updates the status of a process and creates a status change event (tenant-safe).',
  })
  @ApiParam({ name: 'id', description: 'Process ID' })
  @ApiBody({ type: UpdateProcessStatusDTO })
  @ApiOkResponse({ description: 'Process status updated' })
  async updateStatus(@Req() req: Request, @Param('id') id: string, @Body() data: UpdateProcessStatusDTO) {
    const tenantId = this.getTenantId(req);
    if (data.status === undefined && !data.status_config_id) {
      throw new BadRequestException('Informe status ou status_config_id.');
    }

    const existing = await this.service.findById(id, tenantId);
    if (!this.isAdmin(req)) {
      const companyId = this.getCompanyId(req);
      if (!companyId) throw new BadRequestException('company_id is missing from authenticated user.');
      if (String((existing as any)?.company_id ?? '') !== companyId) {
        throw new ForbiddenException('Você não tem permissão para alterar este processo.');
      }
    }

    return this.service.updateStatus(id, tenantId, {
      status: data.status,
      status_config_id: data.status_config_id,
    });
  }

  @Get(':id/events')
  @ApiOperation({
    summary: 'Get process events',
    description: 'Returns all events related to a specific process (tenant-safe).',
  })
  @ApiParam({ name: 'id', description: 'Process ID' })
  @ApiOkResponse({ description: 'List of process events' })
  async getProcessEvents(@Req() req: Request, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);

    const existing = await this.service.findById(id, tenantId);
    if (!this.isAdmin(req)) {
      const companyId = this.getCompanyId(req);
      if (!companyId) throw new BadRequestException('company_id is missing from authenticated user.');
      if (String((existing as any)?.company_id ?? '') !== companyId) {
        throw new ForbiddenException('Você não tem acesso a este processo.');
      }
    }

    return this.service.getProcessEvents(id, tenantId);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a process',
    description: 'Soft deletes a process and creates a deletion event (tenant-safe).',
  })
  @ApiParam({ name: 'id', description: 'Process ID' })
  @ApiOkResponse({ description: 'Process deleted' })
  async remove(@Req() req: Request, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);

    const existing = await this.service.findById(id, tenantId);
    if (!this.isAdmin(req)) {
      const companyId = this.getCompanyId(req);
      if (!companyId) throw new BadRequestException('company_id is missing from authenticated user.');
      if (String((existing as any)?.company_id ?? '') !== companyId) {
        throw new ForbiddenException('Você não tem permissão para excluir este processo.');
      }
    }

    return this.service.softDelete(id, tenantId);
  }
}
