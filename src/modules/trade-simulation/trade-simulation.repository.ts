import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import {
  Prisma,
  TradeSimulationCalculationMode,
  TradeSimulationStatus,
  TradeSimulationTaxType,
  TradeSimulationType,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { handlePrismaError } from '../utils/errors';

@Injectable()
export class TradeSimulationRepository {
  private readonly logger = new Logger(TradeSimulationRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async createSimulation(input: {
    tenantId: string;
    userId: string;
    companyId: string;
    type: TradeSimulationType;
    status?: TradeSimulationStatus;
    calculationMode?: TradeSimulationCalculationMode;
    currency: string;
    exchangeRate?: Prisma.Decimal | null;
    incoterm?: string | null;
    originCountry?: string | null;
    destinationState?: string | null;
    customsValue: Prisma.Decimal;
    freightInternational?: Prisma.Decimal | null;
    insuranceInternational?: Prisma.Decimal | null;
    otherAdditions?: Prisma.Decimal | null;
    icmsRate?: Prisma.Decimal | null;
  }) {
    try {
      return await this.prisma.trade_simulations.create({
        data: {
          tenant_id: input.tenantId,
          company_id: input.companyId,
          created_by_user_id: input.userId,
          type: input.type,
          status: input.status ?? TradeSimulationStatus.DRAFT,
          calculation_mode: input.calculationMode ?? TradeSimulationCalculationMode.MANUAL,
          currency: input.currency,
          exchange_rate: input.exchangeRate ?? null,
          incoterm: input.incoterm ?? null,
          origin_country: input.originCountry ?? null,
          destination_state: input.destinationState ?? null,
          customs_value: input.customsValue,
          freight_international: input.freightInternational ?? null,
          insurance_international: input.insuranceInternational ?? null,
          other_additions: input.otherAdditions ?? null,
          icms_rate: input.icmsRate ?? null,
          updated_at: new Date(),
        },
      });
    } catch (error) {
      handlePrismaError(error, 'creating trade simulation');
    }
  }

  async listSimulations(input: {
    tenantId: string;
    companyId?: string;
    type?: TradeSimulationType;
    status?: TradeSimulationStatus;
    take: number;
    skip: number;
  }) {
    try {
      const where: Prisma.trade_simulationsWhereInput = {
        tenant_id: input.tenantId,
        ...(input.companyId ? { company_id: input.companyId } : {}),
        ...(input.type ? { type: input.type } : {}),
        ...(input.status ? { status: input.status } : {}),
      };

      const rows = await this.prisma.trade_simulations.findMany({
        where,
        orderBy: { created_at: 'desc' },
        take: input.take,
        skip: input.skip,
      });
      const total = await this.prisma.trade_simulations.count({ where });

      return { rows, total };
    } catch (error) {
      handlePrismaError(error, 'listing trade simulations');
    }
  }

  async findSimulationById(tenantId: string, simulationId: string) {
    try {
      return await this.prisma.trade_simulations.findFirst({
        where: { id: simulationId, tenant_id: tenantId },
        include: {
          items: true,
          costs: true,
          taxes: true,
        },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching trade simulation by id');
    }
  }

  async getSimulationHeader(tenantId: string, simulationId: string) {
    try {
      return await this.prisma.trade_simulations.findFirst({
        where: { id: simulationId, tenant_id: tenantId },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching trade simulation header');
    }
  }

  async updateSimulation(tenantId: string, simulationId: string, data: Prisma.trade_simulationsUpdateInput) {
    try {
      const updated = await this.prisma.trade_simulations.updateMany({
        where: { id: simulationId, tenant_id: tenantId },
        data: {
          ...data,
          updated_at: new Date(),
        },
      });

      if (!updated || updated.count === 0) {
        throw new NotFoundException('Simulação não encontrada.');
      }

      return this.getSimulationHeader(tenantId, simulationId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      handlePrismaError(error, 'updating trade simulation');
    }
  }

  async createItem(input: {
    tenantId: string;
    simulationId: string;
    productId?: string | null;
    description: string;
    ncm: string;
    quantity: Prisma.Decimal;
    unitPrice: Prisma.Decimal;
    itemValue: Prisma.Decimal;
    freightAllocated?: Prisma.Decimal | null;
    insuranceAllocated?: Prisma.Decimal | null;
    customsValueAllocated?: Prisma.Decimal | null;
    notes?: string | null;
  }) {
    try {
      return await this.prisma.trade_simulation_items.create({
        data: {
          tenant_id: input.tenantId,
          trade_simulation_id: input.simulationId,
          product_id: input.productId ?? null,
          description: input.description,
          ncm: input.ncm,
          quantity: input.quantity,
          unit_price: input.unitPrice,
          item_value: input.itemValue,
          freight_allocated: input.freightAllocated ?? null,
          insurance_allocated: input.insuranceAllocated ?? null,
          customs_value_allocated: input.customsValueAllocated ?? null,
          notes: input.notes ?? null,
          updated_at: new Date(),
        },
      });
    } catch (error) {
      handlePrismaError(error, 'creating trade simulation item');
    }
  }

  async getItemById(tenantId: string, simulationId: string, itemId: string) {
    try {
      return await this.prisma.trade_simulation_items.findFirst({
        where: {
          id: itemId,
          tenant_id: tenantId,
          trade_simulation_id: simulationId,
        },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching trade simulation item');
    }
  }

  async updateItem(
    tenantId: string,
    simulationId: string,
    itemId: string,
    data: Prisma.trade_simulation_itemsUpdateInput,
  ) {
    try {
      const updated = await this.prisma.trade_simulation_items.updateMany({
        where: {
          id: itemId,
          tenant_id: tenantId,
          trade_simulation_id: simulationId,
        },
        data: {
          ...data,
          updated_at: new Date(),
        },
      });

      if (!updated || updated.count === 0) {
        throw new NotFoundException('Item da simulação não encontrado.');
      }

      return this.getItemById(tenantId, simulationId, itemId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      handlePrismaError(error, 'updating trade simulation item');
    }
  }

  async deleteItem(tenantId: string, simulationId: string, itemId: string) {
    try {
      const deleted = await this.prisma.trade_simulation_items.deleteMany({
        where: {
          id: itemId,
          tenant_id: tenantId,
          trade_simulation_id: simulationId,
        },
      });

      if (!deleted || deleted.count === 0) {
        throw new NotFoundException('Item da simulação não encontrado.');
      }

      return { ok: true };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      handlePrismaError(error, 'deleting trade simulation item');
    }
  }

  async createCost(input: {
    tenantId: string;
    simulationId: string;
    data: Omit<Prisma.trade_simulation_costsUncheckedCreateInput, 'tenant_id' | 'trade_simulation_id'>;
  }) {
    try {
      return await this.prisma.trade_simulation_costs.create({
        data: {
          ...input.data,
          tenant_id: input.tenantId,
          trade_simulation_id: input.simulationId,
          updated_at: new Date(),
        },
      });
    } catch (error) {
      handlePrismaError(error, 'creating trade simulation cost');
    }
  }

  async getCostById(tenantId: string, simulationId: string, costId: string) {
    try {
      return await this.prisma.trade_simulation_costs.findFirst({
        where: {
          id: costId,
          tenant_id: tenantId,
          trade_simulation_id: simulationId,
        },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching trade simulation cost');
    }
  }

  async updateCost(
    tenantId: string,
    simulationId: string,
    costId: string,
    data: Prisma.trade_simulation_costsUpdateInput,
  ) {
    try {
      const updated = await this.prisma.trade_simulation_costs.updateMany({
        where: {
          id: costId,
          tenant_id: tenantId,
          trade_simulation_id: simulationId,
        },
        data: {
          ...data,
          updated_at: new Date(),
        },
      });

      if (!updated || updated.count === 0) {
        throw new NotFoundException('Custo da simulação não encontrado.');
      }

      return this.getCostById(tenantId, simulationId, costId);
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      handlePrismaError(error, 'updating trade simulation cost');
    }
  }

  async deleteCost(tenantId: string, simulationId: string, costId: string) {
    try {
      const deleted = await this.prisma.trade_simulation_costs.deleteMany({
        where: {
          id: costId,
          tenant_id: tenantId,
          trade_simulation_id: simulationId,
        },
      });

      if (!deleted || deleted.count === 0) {
        throw new NotFoundException('Custo da simulação não encontrado.');
      }

      return { ok: true };
    } catch (error) {
      if (error instanceof NotFoundException) {
        throw error;
      }
      handlePrismaError(error, 'deleting trade simulation cost');
    }
  }

  async findSimulationWithRelations(tenantId: string, simulationId: string) {
    try {
      return await this.prisma.trade_simulations.findFirst({
        where: { id: simulationId, tenant_id: tenantId },
        include: {
          items: true,
          costs: true,
          taxes: true,
        },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching simulation with relations');
    }
  }

  async findRuleByNcm(tenantId: string, ncm: string, referenceDate: Date) {
    try {
      return await this.prisma.ncm_tax_rules.findFirst({
        where: {
          tenant_id: tenantId,
          ncm,
          OR: [
            {
              valid_from: null,
              valid_to: null,
            },
            {
              AND: [{ valid_from: { lte: referenceDate } }, { valid_to: { gte: referenceDate } }],
            },
            {
              AND: [{ valid_from: { lte: referenceDate } }, { valid_to: null }],
            },
            {
              AND: [{ valid_from: null }, { valid_to: { gte: referenceDate } }],
            },
          ],
        },
        orderBy: [
          { valid_from: 'desc' },
          { created_at: 'desc' },
        ],
      });
    } catch (error) {
      handlePrismaError(error, 'fetching NCM tax rule');
    }
  }

  async replaceSimulationTaxes(input: {
    tenantId: string;
    simulationId: string;
    taxes: Array<{
      trade_simulation_item_id?: string | null;
      tax_type: TradeSimulationTaxType;
      base_amount_brl?: Prisma.Decimal | null;
      rate?: Prisma.Decimal | null;
      amount_brl: Prisma.Decimal;
      metadata_json?: Prisma.InputJsonValue | null;
    }>;
    calculationPayloadJson?: Prisma.InputJsonValue | null;
  }) {
    try {
      return await this.prisma.transaction(async (transactionClient) => {
        await transactionClient.trade_simulation_taxes.deleteMany({
          where: {
            tenant_id: input.tenantId,
            trade_simulation_id: input.simulationId,
          },
        });

        if (input.taxes.length > 0) {
          await transactionClient.trade_simulation_taxes.createMany({
            data: input.taxes.map((taxRow) => ({
              tenant_id: input.tenantId,
              trade_simulation_id: input.simulationId,
              trade_simulation_item_id: taxRow.trade_simulation_item_id ?? null,
              tax_type: taxRow.tax_type,
              base_amount_brl: taxRow.base_amount_brl ?? null,
              rate: taxRow.rate ?? null,
              amount_brl: taxRow.amount_brl,
              metadata_json: taxRow.metadata_json ?? Prisma.JsonNull,
              updated_at: new Date(),
            })),
          });
        }

        await transactionClient.trade_simulations.updateMany({
          where: {
            id: input.simulationId,
            tenant_id: input.tenantId,
          },
          data: {
            calculation_payload_json: input.calculationPayloadJson ?? Prisma.JsonNull,
            updated_at: new Date(),
          },
        });

        return transactionClient.trade_simulations.findFirst({
          where: {
            id: input.simulationId,
            tenant_id: input.tenantId,
          },
          include: {
            items: true,
            costs: true,
            taxes: true,
          },
        });
      });
    } catch (error) {
      handlePrismaError(error, 'replacing trade simulation taxes');
    }
  }

  async ensureCompanyExistsForTenant(tenantId: string, companyId: string): Promise<void> {
    try {
      const company = await this.prisma.companies.findFirst({
        where: { id: companyId, tenant_id: tenantId },
        select: { id: true },
      });

      if (!company) {
        throw new BadRequestException('Empresa inválida para este tenant.');
      }
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }
      this.logger.error(`Error validating company ${companyId} for tenant ${tenantId}`);
      handlePrismaError(error, 'validating trade simulation company');
    }
  }
}


