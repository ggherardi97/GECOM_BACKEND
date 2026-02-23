import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import {
  Prisma,
  TradeSimulationCalculationMode,
  TradeSimulationCostAllocationMethod,
  TradeSimulationCostType,
  TradeSimulationStatus,
  TradeSimulationTaxType,
  TradeSimulationType,
} from '@prisma/client';
import { CreateTradeSimulationDto } from './dto/create-trade-simulation.dto';
import { UpdateTradeSimulationDto } from './dto/update-trade-simulation.dto';
import { CreateTradeSimulationItemDto } from './dto/create-trade-simulation-item.dto';
import { UpdateTradeSimulationItemDto } from './dto/update-trade-simulation-item.dto';
import { CreateTradeSimulationCostDto } from './dto/create-trade-simulation-cost.dto';
import { UpdateTradeSimulationCostDto } from './dto/update-trade-simulation-cost.dto';
import { ListTradeSimulationsQueryDto } from './dto/list-trade-simulations-query.dto';
import { CalculateTradeSimulationDto } from './dto/calculate-trade-simulation.dto';
import { TtceLookupDto } from './dto/ttce-lookup.dto';
import { TradeSimulationRepository } from './trade-simulation.repository';
import { TTCE_PROVIDER } from './providers/ttce-provider.interface';
import type { ITtceProvider } from './providers/ttce-provider.interface';
import { TtceTaxRequest } from './types/ttce.types';

@Injectable()
export class TradeSimulationService {
  private readonly logger = new Logger(TradeSimulationService.name);

  constructor(
    private readonly repository: TradeSimulationRepository,
    @Inject(TTCE_PROVIDER)
    private readonly ttceProvider: ITtceProvider,
  ) {}

  async createSimulation(tenantId: string, userId: string, dto: CreateTradeSimulationDto) {
    await this.repository.ensureCompanyExistsForTenant(tenantId, dto.company_id);

    const simulation = await this.repository.createSimulation({
      tenantId,
      userId,
      companyId: dto.company_id,
      type: dto.type,
      status: dto.status,
      calculationMode: dto.calculation_mode,
      currency: String(dto.currency).trim().toUpperCase(),
      exchangeRate: this.toDecimalOrNull(dto.exchange_rate),
      incoterm: this.toTrimmedOrNull(dto.incoterm),
      originCountry: this.toUpperOrNull(dto.origin_country),
      destinationState: this.toUpperOrNull(dto.destination_state),
      customsValue: this.toDecimalRequired(dto.customs_value, 'customs_value'),
      freightInternational: this.toDecimalOrNull(dto.freight_international),
      insuranceInternational: this.toDecimalOrNull(dto.insurance_international),
      otherAdditions: this.toDecimalOrNull(dto.other_additions),
      icmsRate: this.toDecimalOrNull(dto.icms_rate),
    });

    if (!simulation) {
      throw new InternalServerErrorException('Falha ao criar simulação.');
    }

    return simulation;
  }

  async listSimulations(tenantId: string, query: ListTradeSimulationsQueryDto) {
    const take = this.normalizePageNumber(query.take, 20, 1, 100);
    const skip = this.normalizePageNumber(query.skip, 0, 0, 1000000);

    const listed = await this.repository.listSimulations({
      tenantId,
      companyId: query.company_id,
      type: query.type,
      status: query.status,
      take,
      skip,
    });

    return {
      data: listed.rows,
      total: listed.total,
      take,
      skip,
    };
  }

  async getSimulationById(tenantId: string, simulationId: string) {
    const simulation = await this.repository.findSimulationById(tenantId, simulationId);
    if (!simulation) {
      throw new NotFoundException('Simulação não encontrada.');
    }

    return simulation;
  }

  async updateSimulation(tenantId: string, simulationId: string, dto: UpdateTradeSimulationDto) {
    const simulation = await this.getRequiredSimulationHeader(tenantId, simulationId);
    this.ensureDraft(simulation.status);

    const updateData: Prisma.trade_simulationsUpdateInput = {
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.calculation_mode !== undefined ? { calculation_mode: dto.calculation_mode } : {}),
      ...(dto.currency !== undefined ? { currency: String(dto.currency).trim().toUpperCase() } : {}),
      ...(dto.exchange_rate !== undefined ? { exchange_rate: this.toDecimalOrNull(dto.exchange_rate) } : {}),
      ...(dto.incoterm !== undefined ? { incoterm: this.toTrimmedOrNull(dto.incoterm) } : {}),
      ...(dto.origin_country !== undefined ? { origin_country: this.toUpperOrNull(dto.origin_country) } : {}),
      ...(dto.destination_state !== undefined ? { destination_state: this.toUpperOrNull(dto.destination_state) } : {}),
      ...(dto.customs_value !== undefined ? { customs_value: this.toDecimalRequired(dto.customs_value, 'customs_value') } : {}),
      ...(dto.freight_international !== undefined
        ? { freight_international: this.toDecimalOrNull(dto.freight_international) }
        : {}),
      ...(dto.insurance_international !== undefined
        ? { insurance_international: this.toDecimalOrNull(dto.insurance_international) }
        : {}),
      ...(dto.other_additions !== undefined ? { other_additions: this.toDecimalOrNull(dto.other_additions) } : {}),
      ...(dto.icms_rate !== undefined ? { icms_rate: this.toDecimalOrNull(dto.icms_rate) } : {}),
    };

    const updated = await this.repository.updateSimulation(tenantId, simulationId, updateData);
    if (!updated) {
      throw new NotFoundException('Simulação não encontrada.');
    }

    return updated;
  }

  async addItem(tenantId: string, simulationId: string, dto: CreateTradeSimulationItemDto) {
    const simulation = await this.getRequiredSimulationHeader(tenantId, simulationId);
    this.ensureDraft(simulation.status);

    const quantity = this.toDecimalRequired(dto.quantity, 'quantity');
    const unitPrice = this.toDecimalRequired(dto.unit_price, 'unit_price');
    const itemValue = this.toMoney(quantity.mul(unitPrice));

    const created = await this.repository.createItem({
      tenantId,
      simulationId,
      productId: dto.product_id ?? null,
      description: dto.description.trim(),
      ncm: dto.ncm.trim(),
      quantity,
      unitPrice,
      itemValue,
      freightAllocated: this.toDecimalOrNull(dto.freight_allocated),
      insuranceAllocated: this.toDecimalOrNull(dto.insurance_allocated),
      customsValueAllocated: this.toDecimalOrNull(dto.customs_value_allocated),
      notes: this.toTrimmedOrNull(dto.notes),
    });

    if (!created) {
      throw new InternalServerErrorException('Falha ao adicionar item.');
    }

    return created;
  }

  async updateItem(tenantId: string, simulationId: string, itemId: string, dto: UpdateTradeSimulationItemDto) {
    const simulation = await this.getRequiredSimulationHeader(tenantId, simulationId);
    this.ensureDraft(simulation.status);

    const existing = await this.repository.getItemById(tenantId, simulationId, itemId);
    if (!existing) {
      throw new NotFoundException('Item da simulação não encontrado.');
    }

    const quantity = dto.quantity !== undefined ? this.toDecimalRequired(dto.quantity, 'quantity') : existing.quantity;
    const unitPrice = dto.unit_price !== undefined ? this.toDecimalRequired(dto.unit_price, 'unit_price') : existing.unit_price;
    const itemValue = this.toMoney(quantity.mul(unitPrice));

    const updateData: Prisma.trade_simulation_itemsUpdateInput = {
      ...(dto.product_id !== undefined ? { product_id: dto.product_id ?? null } : {}),
      ...(dto.description !== undefined ? { description: dto.description.trim() } : {}),
      ...(dto.ncm !== undefined ? { ncm: dto.ncm.trim() } : {}),
      ...(dto.quantity !== undefined ? { quantity } : {}),
      ...(dto.unit_price !== undefined ? { unit_price: unitPrice } : {}),
      item_value: itemValue,
      ...(dto.freight_allocated !== undefined ? { freight_allocated: this.toDecimalOrNull(dto.freight_allocated) } : {}),
      ...(dto.insurance_allocated !== undefined
        ? { insurance_allocated: this.toDecimalOrNull(dto.insurance_allocated) }
        : {}),
      ...(dto.customs_value_allocated !== undefined
        ? { customs_value_allocated: this.toDecimalOrNull(dto.customs_value_allocated) }
        : {}),
      ...(dto.notes !== undefined ? { notes: this.toTrimmedOrNull(dto.notes) } : {}),
    };

    const updated = await this.repository.updateItem(tenantId, simulationId, itemId, updateData);
    if (!updated) {
      throw new NotFoundException('Item da simulação não encontrado.');
    }

    return updated;
  }

  async removeItem(tenantId: string, simulationId: string, itemId: string) {
    const simulation = await this.getRequiredSimulationHeader(tenantId, simulationId);
    this.ensureDraft(simulation.status);

    return this.repository.deleteItem(tenantId, simulationId, itemId);
  }

  async addCost(tenantId: string, simulationId: string, dto: CreateTradeSimulationCostDto) {
    const simulation = await this.getRequiredSimulationHeader(tenantId, simulationId);
    this.ensureDraft(simulation.status);

    const costData: Omit<Prisma.trade_simulation_costsUncheckedCreateInput, 'tenant_id' | 'trade_simulation_id'> = {
      cost_type: dto.cost_type,
      amount: this.toDecimalRequired(dto.amount, 'amount'),
      currency: String(dto.currency).trim().toUpperCase(),
      exchange_rate: this.toDecimalOrNull(dto.exchange_rate),
      is_in_icms_base: dto.is_in_icms_base ?? true,
      allocation_method: dto.allocation_method ?? TradeSimulationCostAllocationMethod.TOTAL,
      notes: this.toTrimmedOrNull(dto.notes),
    };

    const created = await this.repository.createCost({
      tenantId,
      simulationId,
      data: costData,
    });

    if (!created) {
      throw new InternalServerErrorException('Falha ao adicionar custo.');
    }

    return created;
  }

  async updateCost(tenantId: string, simulationId: string, costId: string, dto: UpdateTradeSimulationCostDto) {
    const simulation = await this.getRequiredSimulationHeader(tenantId, simulationId);
    this.ensureDraft(simulation.status);

    const existing = await this.repository.getCostById(tenantId, simulationId, costId);
    if (!existing) {
      throw new NotFoundException('Custo da simulação não encontrado.');
    }

    const updateData: Prisma.trade_simulation_costsUpdateInput = {
      ...(dto.cost_type !== undefined ? { cost_type: dto.cost_type } : {}),
      ...(dto.amount !== undefined ? { amount: this.toDecimalRequired(dto.amount, 'amount') } : {}),
      ...(dto.currency !== undefined ? { currency: String(dto.currency).trim().toUpperCase() } : {}),
      ...(dto.exchange_rate !== undefined ? { exchange_rate: this.toDecimalOrNull(dto.exchange_rate) } : {}),
      ...(dto.is_in_icms_base !== undefined ? { is_in_icms_base: dto.is_in_icms_base } : {}),
      ...(dto.allocation_method !== undefined ? { allocation_method: dto.allocation_method } : {}),
      ...(dto.notes !== undefined ? { notes: this.toTrimmedOrNull(dto.notes) } : {}),
    };

    const updated = await this.repository.updateCost(tenantId, simulationId, costId, updateData);
    if (!updated) {
      throw new NotFoundException('Custo da simulação não encontrado.');
    }

    return updated;
  }

  async removeCost(tenantId: string, simulationId: string, costId: string) {
    const simulation = await this.getRequiredSimulationHeader(tenantId, simulationId);
    this.ensureDraft(simulation.status);

    return this.repository.deleteCost(tenantId, simulationId, costId);
  }

  async calculate(tenantId: string, simulationId: string, dto: CalculateTradeSimulationDto) {
    const simulation = await this.getRequiredSimulationWithRelations(tenantId, simulationId);

    const calculationMode = dto.calculation_mode ?? simulation.calculation_mode;
    if (calculationMode === TradeSimulationCalculationMode.TTCE) {
      this.validateTtceEnvironment();
      return this.calculateUsingTtce(tenantId, simulation, calculationMode);
    }

    if (simulation.type !== TradeSimulationType.IMPORT) {
      throw new BadRequestException('Cálculo local está disponível apenas para IMPORT no momento.');
    }

    return this.calculateLocally(tenantId, simulation, calculationMode);
  }

  async ttceLookup(dto: TtceLookupDto) {
    this.validateTtceEnvironment();

    const request: TtceTaxRequest = {
      ncm: dto.ncm.trim(),
      customsValue: dto.customsValue,
      currency: dto.currency.trim().toUpperCase(),
      originCountry: this.toUpperOrNull(dto.originCountry) ?? undefined,
      destinationState: this.toUpperOrNull(dto.destinationState) ?? undefined,
    };

    await this.ttceProvider.authenticate();
    const response = await this.ttceProvider.getTaxes(request);

    return {
      taxes: response.taxes,
      ...(dto.includeRaw ? { raw: response.raw } : {}),
    };
  }

  private async calculateUsingTtce(
    tenantId: string,
    simulation: Awaited<ReturnType<TradeSimulationRepository['findSimulationWithRelations']>>,
    mode: TradeSimulationCalculationMode,
  ) {
    if (!simulation) {
      throw new NotFoundException('Simulação não encontrada.');
    }

    if (!simulation.items || simulation.items.length === 0) {
      throw new BadRequestException('Adicione ao menos um item para calcular via TTCE.');
    }

    const payloadCollection: Array<{ request: TtceTaxRequest; responseSummary: unknown }> = [];
    const taxRows: Array<{
      trade_simulation_item_id?: string | null;
      tax_type: TradeSimulationTaxType;
      base_amount_brl?: Prisma.Decimal | null;
      rate?: Prisma.Decimal | null;
      amount_brl: Prisma.Decimal;
      metadata_json?: Prisma.InputJsonValue | null;
    }> = [];

    for (const item of simulation.items) {
      const request: TtceTaxRequest = {
        ncm: item.ncm,
        customsValue: (item.customs_value_allocated ?? item.item_value).toString(),
        currency: simulation.currency,
        originCountry: simulation.origin_country ?? undefined,
        destinationState: simulation.destination_state ?? undefined,
      };

      const response = await this.ttceProvider.getTaxes(request);
      payloadCollection.push({
        request,
        responseSummary: {
          taxesCount: response.taxes.length,
          taxes: response.taxes,
        },
      });

      for (const tax of response.taxes) {
        const normalizedTaxType = this.normalizeTaxType(tax.taxType);
        taxRows.push({
          trade_simulation_item_id: item.id,
          tax_type: normalizedTaxType,
          base_amount_brl: this.toDecimalOrNull(tax.baseAmountBrl),
          rate: this.toDecimalOrNull(tax.rate),
          amount_brl: this.toMoney(this.toDecimalRequired(tax.amountBrl, 'amountBrl')),
          metadata_json: {
            source: 'TTCE',
            rawTaxType: tax.taxType,
          } as Prisma.InputJsonValue,
        });
      }
    }

    const updatedSimulation = await this.repository.replaceSimulationTaxes({
      tenantId,
      simulationId: simulation.id,
      taxes: taxRows,
      calculationPayloadJson: {
        mode,
        source: 'TTCE',
        lookups: payloadCollection,
      } as Prisma.InputJsonValue,
    });

    if (!updatedSimulation) {
      throw new InternalServerErrorException('Falha ao persistir cálculo TTCE.');
    }

    return this.buildCalculationResponse(updatedSimulation, mode);
  }

  private async calculateLocally(
    tenantId: string,
    simulation: Awaited<ReturnType<TradeSimulationRepository['findSimulationWithRelations']>>,
    mode: TradeSimulationCalculationMode,
  ) {
    if (!simulation) {
      throw new NotFoundException('Simulação não encontrada.');
    }

    const exchangeRate = this.resolveExchangeRate(simulation.currency, simulation.exchange_rate);
    const referenceDate = new Date();

    let totalVaBrl = new Prisma.Decimal(0);
    let totalIi = new Prisma.Decimal(0);
    let totalIpi = new Prisma.Decimal(0);
    let totalPis = new Prisma.Decimal(0);
    let totalCofins = new Prisma.Decimal(0);

    const taxRows: Array<{
      trade_simulation_item_id?: string | null;
      tax_type: TradeSimulationTaxType;
      base_amount_brl?: Prisma.Decimal | null;
      rate?: Prisma.Decimal | null;
      amount_brl: Prisma.Decimal;
      metadata_json?: Prisma.InputJsonValue | null;
    }> = [];

    const rulesAudit: Array<{ itemId: string; ncm: string; ruleFound: boolean }> = [];

    for (const item of simulation.items) {
      const currentRule = await this.repository.findRuleByNcm(tenantId, item.ncm, referenceDate);
      const iiRate = currentRule?.ii_rate ?? new Prisma.Decimal(0);
      const ipiRate = currentRule?.ipi_rate ?? new Prisma.Decimal(0);
      const pisRate = currentRule?.pis_rate ?? new Prisma.Decimal(0);
      const cofinsRate = currentRule?.cofins_rate ?? new Prisma.Decimal(0);

      const valueInSimulationCurrency = item.customs_value_allocated ?? item.item_value;
      const vaBrl = this.toMoney(valueInSimulationCurrency.mul(exchangeRate));

      const ii = this.toMoney(vaBrl.mul(iiRate));
      const ipiBase = vaBrl.add(ii);
      const ipi = this.toMoney(ipiBase.mul(ipiRate));
      const pisBase = vaBrl.add(ii).add(ipi);
      const pis = this.toMoney(pisBase.mul(pisRate));
      const cofinsBase = vaBrl.add(ii).add(ipi);
      const cofins = this.toMoney(cofinsBase.mul(cofinsRate));

      totalVaBrl = totalVaBrl.add(vaBrl);
      totalIi = totalIi.add(ii);
      totalIpi = totalIpi.add(ipi);
      totalPis = totalPis.add(pis);
      totalCofins = totalCofins.add(cofins);

      rulesAudit.push({
        itemId: item.id,
        ncm: item.ncm,
        ruleFound: !!currentRule,
      });

      taxRows.push({
        trade_simulation_item_id: item.id,
        tax_type: TradeSimulationTaxType.II,
        base_amount_brl: vaBrl,
        rate: iiRate,
        amount_brl: ii,
        metadata_json: {
          source: 'RULES',
          ruleId: currentRule?.id ?? null,
          ruleMissing: !currentRule,
        } as Prisma.InputJsonValue,
      });
      taxRows.push({
        trade_simulation_item_id: item.id,
        tax_type: TradeSimulationTaxType.IPI,
        base_amount_brl: ipiBase,
        rate: ipiRate,
        amount_brl: ipi,
        metadata_json: {
          source: 'RULES',
          ruleId: currentRule?.id ?? null,
          ruleMissing: !currentRule,
        } as Prisma.InputJsonValue,
      });
      taxRows.push({
        trade_simulation_item_id: item.id,
        tax_type: TradeSimulationTaxType.PIS,
        base_amount_brl: pisBase,
        rate: pisRate,
        amount_brl: pis,
        metadata_json: {
          source: 'RULES',
          ruleId: currentRule?.id ?? null,
          ruleMissing: !currentRule,
        } as Prisma.InputJsonValue,
      });
      taxRows.push({
        trade_simulation_item_id: item.id,
        tax_type: TradeSimulationTaxType.COFINS,
        base_amount_brl: cofinsBase,
        rate: cofinsRate,
        amount_brl: cofins,
        metadata_json: {
          source: 'RULES',
          ruleId: currentRule?.id ?? null,
          ruleMissing: !currentRule,
        } as Prisma.InputJsonValue,
      });
    }

    let costsInIcmsBase = new Prisma.Decimal(0);
    for (const cost of simulation.costs) {
      if (!cost.is_in_icms_base) {
        continue;
      }

      const costFx = this.resolveExchangeRate(cost.currency, cost.exchange_rate ?? simulation.exchange_rate);
      costsInIcmsBase = costsInIcmsBase.add(cost.amount.mul(costFx));
    }

    const normalizedCostsInIcmsBase = this.toMoney(costsInIcmsBase);

    const icmsRate = simulation.icms_rate ?? new Prisma.Decimal(0);
    if (icmsRate.greaterThan(0)) {
      if (icmsRate.greaterThanOrEqualTo(1)) {
        throw new BadRequestException('icms_rate deve ser menor que 1 (ex.: 0.180000).');
      }

      const numerator = totalVaBrl
        .add(totalIi)
        .add(totalIpi)
        .add(totalPis)
        .add(totalCofins)
        .add(normalizedCostsInIcmsBase);
      const denominator = new Prisma.Decimal(1).sub(icmsRate);
      const icmsBase = this.toMoney(numerator.div(denominator));
      const icmsAmount = this.toMoney(icmsBase.mul(icmsRate));

      taxRows.push({
        trade_simulation_item_id: null,
        tax_type: TradeSimulationTaxType.ICMS,
        base_amount_brl: icmsBase,
        rate: icmsRate,
        amount_brl: icmsAmount,
        metadata_json: {
          source: 'LOCAL_CALC',
          costsInIcmsBase: normalizedCostsInIcmsBase.toString(),
        } as Prisma.InputJsonValue,
      });
    }

    const updatedSimulation = await this.repository.replaceSimulationTaxes({
      tenantId,
      simulationId: simulation.id,
      taxes: taxRows,
      calculationPayloadJson: {
        mode,
        source: 'LOCAL_CALC',
        exchangeRate: exchangeRate.toString(),
        rulesAudit,
      } as Prisma.InputJsonValue,
    });

    if (!updatedSimulation) {
      throw new InternalServerErrorException('Falha ao persistir cálculo local.');
    }

    return this.buildCalculationResponse(updatedSimulation, mode);
  }

  private buildCalculationResponse(
    simulation: NonNullable<Awaited<ReturnType<TradeSimulationRepository['replaceSimulationTaxes']>>>,
    mode: TradeSimulationCalculationMode,
  ) {
    const totalsByTax = simulation.taxes.reduce<Record<string, Prisma.Decimal>>((accumulator, taxEntry) => {
      if (!accumulator[taxEntry.tax_type]) {
        accumulator[taxEntry.tax_type] = new Prisma.Decimal(0);
      }

      accumulator[taxEntry.tax_type] = accumulator[taxEntry.tax_type].add(taxEntry.amount_brl);
      return accumulator;
    }, {});

    const totalTaxes = Object.values(totalsByTax).reduce<Prisma.Decimal>((sumAccumulator, value) => {
      return sumAccumulator.add(value);
    }, new Prisma.Decimal(0));

    return {
      simulation_id: simulation.id,
      calculation_mode: mode,
      totals: {
        total_taxes_brl: this.toMoney(totalTaxes).toString(),
        by_tax_type: Object.entries(totalsByTax).reduce<Record<string, string>>((accumulator, [taxType, amount]) => {
          accumulator[taxType] = this.toMoney(amount).toString();
          return accumulator;
        }, {}),
      },
      taxes: simulation.taxes.map((tax) => ({
        id: tax.id,
        tax_type: tax.tax_type,
        trade_simulation_item_id: tax.trade_simulation_item_id,
        base_amount_brl: tax.base_amount_brl?.toString() ?? null,
        rate: tax.rate?.toString() ?? null,
        amount_brl: tax.amount_brl.toString(),
        metadata_json: tax.metadata_json,
      })),
    };
  }

  private validateTtceEnvironment() {
    const requiredKeys = [
      'SISCOMEX_PFX_BASE64',
      'SISCOMEX_PFX_PASSPHRASE',
      'SISCOMEX_ROLE_TYPE',
    ];

    const missingKeys = requiredKeys.filter((key) => !(process.env[key] ?? '').trim());
    if (missingKeys.length > 0) {
      this.logger.error(`TTCE config missing keys: ${missingKeys.join(', ')}`);
      throw new BadRequestException('Configuração TTCE incompleta. Verifique as variáveis SISCOMEX.');
    }
  }

  private normalizeTaxType(rawTaxType: string): TradeSimulationTaxType {
    const value = String(rawTaxType ?? '').trim().toUpperCase();
    const available = Object.values(TradeSimulationTaxType);
    if (available.includes(value as TradeSimulationTaxType)) {
      return value as TradeSimulationTaxType;
    }
    return TradeSimulationTaxType.OTHER;
  }

  private resolveExchangeRate(currencyCode: string, exchangeRate?: Prisma.Decimal | null): Prisma.Decimal {
    const normalizedCurrencyCode = String(currencyCode ?? '').trim().toUpperCase();

    if (normalizedCurrencyCode === 'BRL') {
      return exchangeRate && exchangeRate.greaterThan(0) ? exchangeRate : new Prisma.Decimal(1);
    }

    if (!exchangeRate || !exchangeRate.greaterThan(0)) {
      throw new BadRequestException('exchange_rate é obrigatório quando a moeda não é BRL.');
    }

    return exchangeRate;
  }

  private async getRequiredSimulationHeader(tenantId: string, simulationId: string) {
    const simulation = await this.repository.getSimulationHeader(tenantId, simulationId);
    if (!simulation) {
      throw new NotFoundException('Simulação não encontrada.');
    }

    return simulation;
  }

  private async getRequiredSimulationWithRelations(tenantId: string, simulationId: string) {
    const simulation = await this.repository.findSimulationWithRelations(tenantId, simulationId);
    if (!simulation) {
      throw new NotFoundException('Simulação não encontrada.');
    }

    return simulation;
  }

  private ensureDraft(status: TradeSimulationStatus) {
    if (status !== TradeSimulationStatus.DRAFT) {
      throw new BadRequestException('Apenas simulações em DRAFT podem ser alteradas.');
    }
  }

  private normalizePageNumber(
    value: string | undefined,
    defaultValue: number,
    minimumValue: number,
    maximumValue: number,
  ): number {
    if (value == null || String(value).trim().length === 0) {
      return defaultValue;
    }

    const numericValue = Number(value);
    if (!Number.isFinite(numericValue)) {
      return defaultValue;
    }

    const integerValue = Math.trunc(numericValue);
    if (integerValue < minimumValue) {
      return minimumValue;
    }

    if (integerValue > maximumValue) {
      return maximumValue;
    }

    return integerValue;
  }

  private toTrimmedOrNull(value?: string | null): string | null {
    if (value == null) {
      return null;
    }

    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }

  private toUpperOrNull(value?: string | null): string | null {
    const normalized = this.toTrimmedOrNull(value);
    return normalized ? normalized.toUpperCase() : null;
  }

  private toDecimalRequired(value: unknown, fieldName: string): Prisma.Decimal {
    if (value === null || value === undefined || String(value).trim().length === 0) {
      throw new BadRequestException(`Campo obrigatório: ${fieldName}`);
    }

    try {
      return new Prisma.Decimal(value as Prisma.Decimal.Value);
    } catch {
      throw new BadRequestException(`Valor inválido para ${fieldName}`);
    }
  }

  private toDecimalOrNull(value?: unknown): Prisma.Decimal | null {
    if (value === null || value === undefined || String(value).trim().length === 0) {
      return null;
    }

    try {
      return new Prisma.Decimal(value as Prisma.Decimal.Value);
    } catch {
      throw new BadRequestException('Valor decimal inválido.');
    }
  }

  private toMoney(value: Prisma.Decimal): Prisma.Decimal {
    return value.toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP);
  }
}



