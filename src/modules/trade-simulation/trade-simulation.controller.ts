import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
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
import type { Request } from 'express';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CreateTradeSimulationDto } from './dto/create-trade-simulation.dto';
import { UpdateTradeSimulationDto } from './dto/update-trade-simulation.dto';
import { CreateTradeSimulationItemDto } from './dto/create-trade-simulation-item.dto';
import { UpdateTradeSimulationItemDto } from './dto/update-trade-simulation-item.dto';
import { CreateTradeSimulationCostDto } from './dto/create-trade-simulation-cost.dto';
import { UpdateTradeSimulationCostDto } from './dto/update-trade-simulation-cost.dto';
import { ListTradeSimulationsQueryDto } from './dto/list-trade-simulations-query.dto';
import { CalculateTradeSimulationDto } from './dto/calculate-trade-simulation.dto';
import { TtceLookupDto } from './dto/ttce-lookup.dto';
import { TradeSimulationService } from './trade-simulation.service';
import { BadRequestException } from '@nestjs/common';

@ApiTags('trade-simulations')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('trade-simulations')
export class TradeSimulationController {
  constructor(private readonly service: TradeSimulationService) {}

  @Post()
  @ApiOperation({ summary: 'Criar simulação de comércio exterior' })
  @ApiBody({ type: CreateTradeSimulationDto })
  @ApiCreatedResponse({ description: 'Simulação criada com sucesso.' })
  async create(@Req() req: Request, @Body() dto: CreateTradeSimulationDto) {
    const tenantId = this.getTenantId(req);
    const userId = this.getUserId(req);
    return this.service.createSimulation(tenantId, userId, dto);
  }

  @Get()
  @ApiOperation({ summary: 'Listar simulações com filtros e paginação' })
  @ApiOkResponse({ description: 'Lista de simulações retornada com sucesso.' })
  async list(@Req() req: Request, @Query() query: ListTradeSimulationsQueryDto) {
    const tenantId = this.getTenantId(req);
    return this.service.listSimulations(tenantId, query);
  }

  @Get(':id')
  @ApiParam({ name: 'id', description: 'ID da simulação' })
  @ApiOkResponse({ description: 'Simulação detalhada.' })
  async getById(@Req() req: Request, @Param('id') simulationId: string) {
    const tenantId = this.getTenantId(req);
    return this.service.getSimulationById(tenantId, simulationId);
  }

  @Patch(':id')
  @ApiParam({ name: 'id', description: 'ID da simulação' })
  @ApiBody({ type: UpdateTradeSimulationDto })
  @ApiOkResponse({ description: 'Simulação atualizada.' })
  async update(@Req() req: Request, @Param('id') simulationId: string, @Body() dto: UpdateTradeSimulationDto) {
    const tenantId = this.getTenantId(req);
    return this.service.updateSimulation(tenantId, simulationId, dto);
  }

  @Post(':id/items')
  @ApiParam({ name: 'id', description: 'ID da simulação' })
  @ApiBody({ type: CreateTradeSimulationItemDto })
  @ApiCreatedResponse({ description: 'Item adicionado com sucesso.' })
  async addItem(
    @Req() req: Request,
    @Param('id') simulationId: string,
    @Body() dto: CreateTradeSimulationItemDto,
  ) {
    const tenantId = this.getTenantId(req);
    return this.service.addItem(tenantId, simulationId, dto);
  }

  @Patch(':id/items/:itemId')
  @ApiParam({ name: 'id', description: 'ID da simulação' })
  @ApiParam({ name: 'itemId', description: 'ID do item da simulação' })
  @ApiBody({ type: UpdateTradeSimulationItemDto })
  @ApiOkResponse({ description: 'Item atualizado com sucesso.' })
  async updateItem(
    @Req() req: Request,
    @Param('id') simulationId: string,
    @Param('itemId') itemId: string,
    @Body() dto: UpdateTradeSimulationItemDto,
  ) {
    const tenantId = this.getTenantId(req);
    return this.service.updateItem(tenantId, simulationId, itemId, dto);
  }

  @Delete(':id/items/:itemId')
  @ApiParam({ name: 'id', description: 'ID da simulação' })
  @ApiParam({ name: 'itemId', description: 'ID do item da simulação' })
  @ApiOkResponse({ description: 'Item removido com sucesso.' })
  async deleteItem(@Req() req: Request, @Param('id') simulationId: string, @Param('itemId') itemId: string) {
    const tenantId = this.getTenantId(req);
    return this.service.removeItem(tenantId, simulationId, itemId);
  }

  @Post(':id/costs')
  @ApiParam({ name: 'id', description: 'ID da simulação' })
  @ApiBody({ type: CreateTradeSimulationCostDto })
  @ApiCreatedResponse({ description: 'Custo adicionado com sucesso.' })
  async addCost(@Req() req: Request, @Param('id') simulationId: string, @Body() dto: CreateTradeSimulationCostDto) {
    const tenantId = this.getTenantId(req);
    return this.service.addCost(tenantId, simulationId, dto);
  }

  @Patch(':id/costs/:costId')
  @ApiParam({ name: 'id', description: 'ID da simulação' })
  @ApiParam({ name: 'costId', description: 'ID do custo' })
  @ApiBody({ type: UpdateTradeSimulationCostDto })
  @ApiOkResponse({ description: 'Custo atualizado com sucesso.' })
  async updateCost(
    @Req() req: Request,
    @Param('id') simulationId: string,
    @Param('costId') costId: string,
    @Body() dto: UpdateTradeSimulationCostDto,
  ) {
    const tenantId = this.getTenantId(req);
    return this.service.updateCost(tenantId, simulationId, costId, dto);
  }

  @Delete(':id/costs/:costId')
  @ApiParam({ name: 'id', description: 'ID da simulação' })
  @ApiParam({ name: 'costId', description: 'ID do custo' })
  @ApiOkResponse({ description: 'Custo removido com sucesso.' })
  async deleteCost(@Req() req: Request, @Param('id') simulationId: string, @Param('costId') costId: string) {
    const tenantId = this.getTenantId(req);
    return this.service.removeCost(tenantId, simulationId, costId);
  }

  @Post(':id/calculate')
  @ApiParam({ name: 'id', description: 'ID da simulação' })
  @ApiBody({ type: CalculateTradeSimulationDto })
  @ApiOkResponse({ description: 'Cálculo executado com sucesso.' })
  async calculate(
    @Req() req: Request,
    @Param('id') simulationId: string,
    @Body() dto: CalculateTradeSimulationDto,
  ) {
    const tenantId = this.getTenantId(req);
    return this.service.calculate(tenantId, simulationId, dto);
  }

  @Post('ttce/lookup')
  @ApiBody({ type: TtceLookupDto })
  @ApiOkResponse({ description: 'Consulta TTCE executada com sucesso.' })
  async ttceLookup(@Body() dto: TtceLookupDto) {
    return this.service.ttceLookup(dto);
  }

  private getTenantId(req: Request): string {
    const user = (req as any).user ?? {};
    const tenantId = String(user.tenant_id ?? user.tenantId ?? '').trim();
    if (!tenantId) {
      throw new BadRequestException('Token sem tenant_id.');
    }

    return tenantId;
  }

  private getUserId(req: Request): string {
    const user = (req as any).user ?? {};
    const userId = String(user.id ?? user.sub ?? '').trim();
    if (!userId) {
      throw new BadRequestException('Token sem id de usuário.');
    }

    return userId;
  }
}


