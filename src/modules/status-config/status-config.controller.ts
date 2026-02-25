import { BadRequestException, Body, Controller, Delete, Get, Param, Patch, Post, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateStatusConfigDto } from './dto/create-status-config.dto';
import { ListStatusConfigQueryDto } from './dto/list-status-config-query.dto';
import { UpdateStatusConfigDto } from './dto/update-status-config.dto';
import { StatusConfigService } from './status-config.service';

@ApiTags('status-configs')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('status-configs')
export class StatusConfigController {
  constructor(private readonly service: StatusConfigService) {}

  @Get()
  @ApiOperation({ summary: 'Listar configurações de status por tenant' })
  @ApiOkResponse({ description: 'Lista retornada com sucesso.' })
  async list(@Req() req: Request, @Query() query: ListStatusConfigQueryDto) {
    return this.service.list(this.getTenantId(req), query);
  }

  @Post('seed-defaults')
  @ApiOperation({ summary: 'Semear status padrao (process, lead, invoice, opportunity, contract)' })
  async seedDefaults(@Req() req: Request) {
    return this.service.seedDefaults(this.getTenantId(req));
  }

  @Post()
  @ApiBody({ type: CreateStatusConfigDto })
  @ApiCreatedResponse({ description: 'Status criado com sucesso.' })
  async create(@Req() req: Request, @Body() dto: CreateStatusConfigDto) {
    return this.service.create(this.getTenantId(req), dto);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateStatusConfigDto })
  @ApiOkResponse({ description: 'Status atualizado com sucesso.' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateStatusConfigDto) {
    return this.service.update(this.getTenantId(req), id, dto);
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Status removido com sucesso.' })
  async remove(@Req() req: Request, @Param('id') id: string) {
    return this.service.remove(this.getTenantId(req), id);
  }

  private getTenantId(req: Request): string {
    const tenantId = String((req as any)?.user?.tenant_id ?? (req as any)?.user?.tenantId ?? '').trim();
    if (!tenantId) throw new BadRequestException('tenant_id ausente no token.');
    return tenantId;
  }
}

