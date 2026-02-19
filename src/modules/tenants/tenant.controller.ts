import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiTags,
} from '@nestjs/swagger';
import { Public } from '../auth/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateTenantDTO } from './dto/create-tenant.dto';
import { UpdateTenantDTO } from './dto/update-tenant.dto';
import { TenantService } from './tenant.service';
import { TenantSafe } from './tenant.repository';
import type { Request } from 'express';

@ApiTags('tenants')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('tenants')
export class TenantController {
  constructor(private readonly service: TenantService) {}

  private getTenantId(req: Request): string {
    const tenantId = String((req as any)?.user?.tenant_id ?? (req as any)?.user?.tenantId ?? '').trim();
    if (!tenantId) throw new BadRequestException('tenant_id is missing from authenticated user.');
    return tenantId;
  }

  private assertTenantOwnership(requesterTenantId: string, resourceTenantId: string): void {
    if (requesterTenantId !== resourceTenantId) {
      throw new ForbiddenException('You can only access your own tenant.');
    }
  }

  @Public()
  @Post()
  @ApiOperation({
    summary: 'Create tenant',
    description: 'Creates a tenant. company_id is optional for onboarding.',
  })
  @ApiBody({ type: CreateTenantDTO })
  @ApiCreatedResponse({ description: 'Tenant successfully created' })
  create(@Body() data: CreateTenantDTO): Promise<TenantSafe> {
    return this.service.create(data);
  }

  @Get()
  @ApiOperation({
    summary: 'List tenants',
    description: 'Returns active (not soft-deleted) tenants.',
  })
  @ApiOkResponse({ description: 'List of tenants' })
  findAll(@Req() req: Request): Promise<TenantSafe[]> {
    const tenantId = this.getTenantId(req);
    return this.service.findAll(tenantId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get tenant by ID',
    description: 'Returns one tenant by ID.',
  })
  @ApiParam({ name: 'id', description: 'Tenant ID (uuid)' })
  @ApiOkResponse({ description: 'Tenant found' })
  findById(@Req() req: Request, @Param('id') id: string): Promise<TenantSafe> {
    const tenantId = this.getTenantId(req);
    this.assertTenantOwnership(tenantId, id);
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update tenant',
    description: 'Updates tenant fields and allows linking/unlinking company_id.',
  })
  @ApiParam({ name: 'id', description: 'Tenant ID (uuid)' })
  @ApiBody({ type: UpdateTenantDTO })
  @ApiOkResponse({ description: 'Tenant updated' })
  update(@Req() req: Request, @Param('id') id: string, @Body() data: UpdateTenantDTO): Promise<TenantSafe> {
    const tenantId = this.getTenantId(req);
    this.assertTenantOwnership(tenantId, id);
    return this.service.update(id, data);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete tenant',
    description: 'Soft deletes a tenant (sets deleted_at).',
  })
  @ApiParam({ name: 'id', description: 'Tenant ID (uuid)' })
  @ApiOkResponse({ description: 'Tenant removed' })
  remove(@Req() req: Request, @Param('id') id: string): Promise<{ ok: true }> {
    const tenantId = this.getTenantId(req);
    this.assertTenantOwnership(tenantId, id);
    return this.service.remove(id);
  }
}
