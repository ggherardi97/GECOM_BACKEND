import {
  Controller,
  Post,
  Body,
  Get,
  Param,
  Patch,
  Delete,
  Query,
  UseGuards,
  Req,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { TransportsService } from './transports.service';
import { Prisma } from '@prisma/client';
import { ApiBearerAuth, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';

@ApiTags('transports')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('transports')
export class TransportsController {
  constructor(private readonly transportsService: TransportsService) {}

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

  // GET /transports/types  ✅ must come BEFORE /:id
  @Get('types')
  @ApiOperation({
    summary: 'List all transports types',
    description: 'Returns a list of all transports types',
  })
  @ApiOkResponse({ description: 'List of transports types' })
  async findAllTransportTypes() {
    return this.transportsService.findAllTransportTypes();
  }

  // GET /transports?process_id=...&transport_type_id=...&transport_status_id=...
  @Get()
  @ApiOperation({
    summary: 'List transports',
    description: 'Returns a list of transports. Supports filters via querystring.',
  })
  @ApiOkResponse({ description: 'List of transports' })
  async findMany(
    @Req() req: Request,
    @Query('process_id') process_id?: string,
    @Query('transport_type_id') transport_type_id?: string,
    @Query('transport_status_id') transport_status_id?: string,
  ) {
    const tenantId = this.getTenantId(req);
    const isAdmin = this.isAdmin(req);
    const companyId = isAdmin ? undefined : this.getCompanyId(req);

    if (!isAdmin && !companyId) {
      throw new BadRequestException('company_id is missing from authenticated user.');
    }

    return this.transportsService.findMany(
      { process_id, transport_type_id, transport_status_id },
      tenantId,
      companyId ?? undefined,
    );
  }

  // GET /transports/:id
  @Get(':id')
  @ApiOperation({ summary: 'Get transport by ID' })
  @ApiOkResponse({ description: 'Transport' })
  async findById(@Req() req: Request, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    const isAdmin = this.isAdmin(req);
    const companyId = isAdmin ? undefined : this.getCompanyId(req);

    if (!isAdmin && !companyId) {
      throw new BadRequestException('company_id is missing from authenticated user.');
    }

    const transport = await this.transportsService.findById(id, tenantId);

    // Non-admin: extra safety (should already be filtered, but keep)
    if (!isAdmin && String((transport as any)?.process_company_id ?? '') !== String(companyId)) {
      throw new ForbiddenException('Você não tem acesso a este transporte.');
    }

    return transport;
  }

  // POST /transports
  @Post()
  @ApiOperation({ summary: 'Create transport' })
  async create(@Req() req: Request, @Body() body: Prisma.transportsCreateInput) {
    const tenantId = this.getTenantId(req);
    const isAdmin = this.isAdmin(req);
    const companyId = isAdmin ? undefined : this.getCompanyId(req);

    if (!isAdmin && !companyId) {
      throw new BadRequestException('company_id is missing from authenticated user.');
    }

    // Non-admin cannot create transport for a process outside their company.
    // We validate in service using process relationship.
    return this.transportsService.create(body, tenantId, companyId ?? undefined);
  }

  // PATCH /transports/:id
  @Patch(':id')
  @ApiOperation({ summary: 'Update transport by ID' })
  async patch(@Req() req: Request, @Param('id') id: string, @Body() body: Prisma.transportsUncheckedUpdateInput) {
    const tenantId = this.getTenantId(req);
    const isAdmin = this.isAdmin(req);
    const companyId = isAdmin ? undefined : this.getCompanyId(req);

    if (!isAdmin && !companyId) {
      throw new BadRequestException('company_id is missing from authenticated user.');
    }

    return this.transportsService.patchById(id, body, tenantId, companyId ?? undefined);
  }

  // DELETE /transports/:id
  @Delete(':id')
  @ApiOperation({ summary: 'Delete transport by ID' })
  async delete(@Req() req: Request, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    const isAdmin = this.isAdmin(req);
    const companyId = isAdmin ? undefined : this.getCompanyId(req);

    if (!isAdmin && !companyId) {
      throw new BadRequestException('company_id is missing from authenticated user.');
    }

    return this.transportsService.deleteById(id, tenantId, companyId ?? undefined);
  }
}
