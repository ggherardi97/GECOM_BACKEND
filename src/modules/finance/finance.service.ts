import { BadRequestException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FinancialEntryGroup,
  FinancialEntryStatus,
  FinancialImportJobStatus,
  FinancialImportSourceType,
  FinancialImportSuggestionKind,
  FinancialImportSuggestionStatus,
  FinancialMovementType,
  FinancialPaymentMethod,
  FinancialRecurrenceFrequency,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import OpenAI from 'openai';
import { PrismaService } from '../../prisma/prisma.service';
import {
  ApplyFinancialImportDto,
  CreateFinancialBankAccountDto,
  CreateFinancialBankMovementDto,
  CreateFinancialCategoryDto,
  CreateFinancialCostCenterDto,
  CreateFinancialPayableDto,
  CreateFinancialPayablePaymentDto,
  CreateFinancialReceivableDto,
  CreateFinancialReceivablePaymentDto,
  GenerateReceivableFromInvoiceDto,
  ReconcileFinancialBankAccountDto,
  ReconcileFinancialBankMovementDto,
  ReviewFinancialImportLineDto,
  UploadFinancialImportDto,
  UpdateFinancialBankAccountDto,
  UpdateFinancialBankMovementDto,
  UpdateFinancialCategoryDto,
  UpdateFinancialCostCenterDto,
  UpdateFinancialPayableDto,
  UpdateFinancialPayablePaymentDto,
  UpdateFinancialReceivableDto,
  UpdateFinancialReceivablePaymentDto,
} from './dto/finance.dto';

type AuthUser = {
  id: string;
  tenant_id: string;
};

type FinanceEntryState = {
  paidAmount: Prisma.Decimal;
  outstandingAmount: Prisma.Decimal;
  status: FinancialEntryStatus;
  isDelinquent: boolean;
  delinquentDays: number;
};

type FinanceImportParseLine = {
  line_number: number;
  external_id?: string | null;
  transaction_date?: Date | null;
  movement_type?: FinancialMovementType | null;
  amount: string;
  balance_after?: string | null;
  currency_code?: string | null;
  description?: string | null;
  counterparty_name?: string | null;
  document_number?: string | null;
  raw_text?: string | null;
  source_payload?: Record<string, unknown> | null;
};

type FinanceImportSuggestionDraft = {
  suggestion_kind: FinancialImportSuggestionKind;
  suggestion_status: FinancialImportSuggestionStatus;
  confidence_score: string;
  rule_code?: string | null;
  ai_reasoning?: string | null;
  suggested_category_id?: string | null;
  suggested_cost_center_id?: string | null;
  suggested_company_id?: string | null;
  matched_receivable_id?: string | null;
  matched_payable_id?: string | null;
  approved_action?: Record<string, unknown> | null;
};

@Injectable()
export class FinanceService {
  private readonly logger = new Logger(FinanceService.name);
  private readonly openAiClient: OpenAI | null;
  private readonly openAiModel: string;

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {
    const apiKey = this.configService.get<string>('OPENAI_API_KEY')?.trim();
    this.openAiClient = apiKey ? new OpenAI({ apiKey }) : null;
    this.openAiModel = this.configService.get<string>('OPENAI_MODEL_AUTOMATION') ?? 'gpt-5-mini';
  }

  private get db() {
    return this.prisma.raw;
  }

  async listCostCenters(user: AuthUser, q?: string) {
    const query = String(q || '').trim();
    return this.db.financial_cost_centers.findMany({
      where: {
        tenant_id: user.tenant_id,
        ...(query
          ? {
              OR: [
                { code: { contains: query, mode: 'insensitive' } },
                { name: { contains: query, mode: 'insensitive' } },
                { description: { contains: query, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ code: 'asc' }],
      include: {
        _count: { select: { categories: true, receivables: true, payables: true } },
      },
    });
  }

  async findCostCenterById(user: AuthUser, id: string) {
    const item = await this.db.financial_cost_centers.findFirst({
      where: { tenant_id: user.tenant_id, id },
      include: {
        categories: { orderBy: [{ code: 'asc' }] },
      },
    });
    if (!item) throw new NotFoundException('Cost center not found');
    return item;
  }

  async createCostCenter(user: AuthUser, dto: CreateFinancialCostCenterDto) {
    const created = await this.db.financial_cost_centers.create({
      data: {
        tenant_id: user.tenant_id,
        code: dto.code.trim(),
        name: dto.name.trim(),
        description: dto.description?.trim() || null,
        is_active: dto.is_active ?? true,
      },
    });
    return this.findCostCenterById(user, created.id);
  }

  async updateCostCenter(user: AuthUser, id: string, dto: UpdateFinancialCostCenterDto) {
    const existing = await this.db.financial_cost_centers.findFirst({
      where: { tenant_id: user.tenant_id, id },
    });
    if (!existing) throw new NotFoundException('Cost center not found');

    await this.db.financial_cost_centers.updateMany({
      where: { tenant_id: user.tenant_id, id },
      data: {
        ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
        updated_at: new Date(),
      },
    });

    return this.findCostCenterById(user, id);
  }

  async removeCostCenter(user: AuthUser, id: string) {
    const existing = await this.db.financial_cost_centers.findFirst({
      where: { tenant_id: user.tenant_id, id },
    });
    if (!existing) throw new NotFoundException('Cost center not found');

    try {
      await this.db.financial_cost_centers.deleteMany({
        where: { tenant_id: user.tenant_id, id },
      });
    } catch {
      throw new BadRequestException('Unable to delete cost center with related financial records');
    }

    return existing;
  }

  async listCategories(user: AuthUser, query: { q?: string; kind?: string }) {
    const q = String(query.q || '').trim();
    const kind = String(query.kind || '').trim();
    return this.db.financial_categories.findMany({
      where: {
        tenant_id: user.tenant_id,
        ...(kind ? { kind: kind as any } : {}),
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ code: 'asc' }],
      include: {
        cost_center: { select: { id: true, code: true, name: true } },
        parent: { select: { id: true, code: true, name: true } },
        _count: { select: { receivables: true, payables: true, bank_movements: true } },
      },
    });
  }

  async findCategoryById(user: AuthUser, id: string) {
    const item = await this.db.financial_categories.findFirst({
      where: { tenant_id: user.tenant_id, id },
      include: {
        cost_center: { select: { id: true, code: true, name: true } },
        parent: { select: { id: true, code: true, name: true } },
        children: { select: { id: true, code: true, name: true }, orderBy: [{ code: 'asc' }] },
      },
    });
    if (!item) throw new NotFoundException('Category not found');
    return item;
  }

  async createCategory(user: AuthUser, dto: CreateFinancialCategoryDto) {
    const created = await this.db.financial_categories.create({
      data: {
        tenant_id: user.tenant_id,
        code: dto.code.trim(),
        name: dto.name.trim(),
        kind: dto.kind ?? 'EXPENSE',
        parent_category_id: dto.parent_category_id ?? null,
        cost_center_id: dto.cost_center_id ?? null,
        description: dto.description?.trim() || null,
        is_active: dto.is_active ?? true,
      },
    });
    return this.findCategoryById(user, created.id);
  }

  async updateCategory(user: AuthUser, id: string, dto: UpdateFinancialCategoryDto) {
    const existing = await this.db.financial_categories.findFirst({
      where: { tenant_id: user.tenant_id, id },
    });
    if (!existing) throw new NotFoundException('Category not found');

    await this.db.financial_categories.updateMany({
      where: { tenant_id: user.tenant_id, id },
      data: {
        ...(dto.code !== undefined ? { code: dto.code.trim() } : {}),
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.kind !== undefined ? { kind: dto.kind } : {}),
        ...(dto.parent_category_id !== undefined ? { parent_category_id: dto.parent_category_id ?? null } : {}),
        ...(dto.cost_center_id !== undefined ? { cost_center_id: dto.cost_center_id ?? null } : {}),
        ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
        updated_at: new Date(),
      },
    });

    return this.findCategoryById(user, id);
  }

  async removeCategory(user: AuthUser, id: string) {
    const existing = await this.db.financial_categories.findFirst({
      where: { tenant_id: user.tenant_id, id },
    });
    if (!existing) throw new NotFoundException('Category not found');

    try {
      await this.db.financial_categories.deleteMany({
        where: { tenant_id: user.tenant_id, id },
      });
    } catch {
      throw new BadRequestException('Unable to delete category with related financial records');
    }

    return existing;
  }

  async listBankAccounts(user: AuthUser, query: { q?: string; is_active?: string }) {
    const q = String(query.q || '').trim();
    const active = this.toOptionalBoolean(query.is_active);
    return this.db.financial_bank_accounts.findMany({
      where: {
        tenant_id: user.tenant_id,
        ...(active === undefined ? {} : { is_active: active }),
        ...(q
          ? {
              OR: [
                { name: { contains: q, mode: 'insensitive' } },
                { bank_name: { contains: q, mode: 'insensitive' } },
                { account_number: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: 'asc' }],
      include: {
        currency: { select: { id: true, code: true, symbol: true, decimals: true } },
        _count: { select: { movements: true } },
      },
    });
  }

  async findBankAccountById(user: AuthUser, id: string) {
    const item = await this.db.financial_bank_accounts.findFirst({
      where: { tenant_id: user.tenant_id, id },
      include: {
        currency: { select: { id: true, code: true, symbol: true, decimals: true } },
        movements: {
          take: 20,
          orderBy: [{ movement_date: 'desc' }, { created_at: 'desc' }],
          include: {
            category: { select: { id: true, code: true, name: true } },
            cost_center: { select: { id: true, code: true, name: true } },
          },
        },
        receivable_payments: {
          take: 10,
          orderBy: [{ payment_date: 'desc' }, { created_at: 'desc' }],
          include: {
            receivable: {
              select: {
                id: true,
                title_number: true,
                description: true,
                company: { select: { id: true, company_name: true } },
              },
            },
            bank_movement: true,
          },
        },
        payable_payments: {
          take: 10,
          orderBy: [{ payment_date: 'desc' }, { created_at: 'desc' }],
          include: {
            payable: {
              select: {
                id: true,
                payable_number: true,
                description: true,
                company: { select: { id: true, company_name: true } },
              },
            },
            bank_movement: true,
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Bank account not found');
    return item;
  }

  async createBankAccount(user: AuthUser, dto: CreateFinancialBankAccountDto) {
    const created = await this.db.financial_bank_accounts.create({
      data: {
        tenant_id: user.tenant_id,
        name: dto.name.trim(),
        bank_name: dto.bank_name?.trim() || null,
        agency: dto.agency?.trim() || null,
        account_number: dto.account_number?.trim() || null,
        account_type: dto.account_type ?? 'CHECKING',
        currency_id: dto.currency_id,
        opening_balance: this.decimal(dto.opening_balance, '0'),
        current_balance: this.decimal(dto.opening_balance, '0'),
        allow_negative: dto.allow_negative ?? false,
        is_active: dto.is_active ?? true,
        reconciliation_date: this.toDateOnly(dto.reconciliation_date),
        notes: dto.notes?.trim() || null,
      },
    });
    return this.findBankAccountById(user, created.id);
  }

  async updateBankAccount(user: AuthUser, id: string, dto: UpdateFinancialBankAccountDto) {
    const existing = await this.db.financial_bank_accounts.findFirst({
      where: { tenant_id: user.tenant_id, id },
    });
    if (!existing) throw new NotFoundException('Bank account not found');

    await this.db.financial_bank_accounts.updateMany({
      where: { tenant_id: user.tenant_id, id },
      data: {
        ...(dto.name !== undefined ? { name: dto.name.trim() } : {}),
        ...(dto.bank_name !== undefined ? { bank_name: dto.bank_name?.trim() || null } : {}),
        ...(dto.agency !== undefined ? { agency: dto.agency?.trim() || null } : {}),
        ...(dto.account_number !== undefined ? { account_number: dto.account_number?.trim() || null } : {}),
        ...(dto.account_type !== undefined ? { account_type: dto.account_type } : {}),
        ...(dto.currency_id !== undefined ? { currency_id: dto.currency_id } : {}),
        ...(dto.opening_balance !== undefined ? { opening_balance: this.decimal(dto.opening_balance, '0') } : {}),
        ...(dto.allow_negative !== undefined ? { allow_negative: dto.allow_negative } : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
        ...(dto.reconciliation_date !== undefined ? { reconciliation_date: this.toDateOnly(dto.reconciliation_date) } : {}),
        ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
        updated_at: new Date(),
      },
    });

    await this.prisma.transaction(async (tx) => {
      await this.refreshBankAccountBalance(tx, user.tenant_id, id);
    });

    return this.findBankAccountById(user, id);
  }

  async reconcileBankAccount(user: AuthUser, id: string, dto: ReconcileFinancialBankAccountDto) {
    const existing = await this.db.financial_bank_accounts.findFirst({
      where: { tenant_id: user.tenant_id, id },
    });
    if (!existing) throw new NotFoundException('Bank account not found');

    await this.db.financial_bank_accounts.updateMany({
      where: { tenant_id: user.tenant_id, id },
      data: {
        reconciliation_date: this.toDateOnly(dto.reconciliation_date) ?? new Date(),
        updated_at: new Date(),
      },
    });

    return this.findBankAccountById(user, id);
  }

  async removeBankAccount(user: AuthUser, id: string) {
    const existing = await this.db.financial_bank_accounts.findFirst({
      where: { tenant_id: user.tenant_id, id },
    });
    if (!existing) throw new NotFoundException('Bank account not found');

    const movementCount = await this.db.financial_bank_movements.count({
      where: { tenant_id: user.tenant_id, bank_account_id: id },
    });
    if (movementCount > 0) {
      throw new BadRequestException('Unable to delete bank account with movements');
    }

    await this.db.financial_bank_accounts.deleteMany({
      where: { tenant_id: user.tenant_id, id },
    });

    return existing;
  }

  async listBankMovements(
    user: AuthUser,
    query: {
      bank_account_id?: string;
      category_id?: string;
      from?: string;
      to?: string;
      reconciled?: string;
    },
  ) {
    const reconciled = this.toOptionalBoolean(query.reconciled);
    return this.db.financial_bank_movements.findMany({
      where: {
        tenant_id: user.tenant_id,
        ...(query.bank_account_id ? { bank_account_id: query.bank_account_id } : {}),
        ...(query.category_id ? { category_id: query.category_id } : {}),
        ...(query.from || query.to
          ? {
              movement_date: {
                ...(query.from ? { gte: this.toDate(query.from) ?? undefined } : {}),
                ...(query.to ? { lte: this.toDateEnd(query.to) ?? undefined } : {}),
              },
            }
          : {}),
        ...(reconciled === undefined ? {} : { reconciled }),
      },
      orderBy: [{ movement_date: 'desc' }, { created_at: 'desc' }],
      include: {
        bank_account: { select: { id: true, name: true, bank_name: true, account_number: true } },
        category: { select: { id: true, code: true, name: true } },
        cost_center: { select: { id: true, code: true, name: true } },
      },
    });
  }

  async findBankMovementById(user: AuthUser, id: string) {
    const item = await this.db.financial_bank_movements.findFirst({
      where: { tenant_id: user.tenant_id, id },
      include: {
        bank_account: { select: { id: true, name: true, bank_name: true, account_number: true } },
        category: { select: { id: true, code: true, name: true } },
        cost_center: { select: { id: true, code: true, name: true } },
      },
    });
    if (!item) throw new NotFoundException('Bank movement not found');
    return item;
  }

  async createBankMovement(user: AuthUser, dto: CreateFinancialBankMovementDto) {
    const created = await this.prisma.transaction(async (tx) => {
      const item = await tx.financial_bank_movements.create({
        data: {
          tenant_id: user.tenant_id,
          bank_account_id: dto.bank_account_id,
          movement_date: this.toDate(dto.movement_date) ?? new Date(),
          movement_type: dto.movement_type,
          amount: this.decimal(dto.amount, '0'),
          description: dto.description?.trim() || null,
          category_id: dto.category_id ?? null,
          cost_center_id: dto.cost_center_id ?? null,
          reference_table: dto.reference_table?.trim() || null,
          reference_id: dto.reference_id ?? null,
          reconciled: dto.reconciled ?? false,
          reconciliation_note: dto.reconciliation_note?.trim() || null,
        },
      });
      await this.refreshBankAccountBalance(tx, user.tenant_id, dto.bank_account_id);
      return item;
    });

    return this.findBankMovementById(user, created.id);
  }

  async updateBankMovement(user: AuthUser, id: string, dto: UpdateFinancialBankMovementDto) {
    const existing = await this.db.financial_bank_movements.findFirst({
      where: { tenant_id: user.tenant_id, id },
    });
    if (!existing) throw new NotFoundException('Bank movement not found');

    await this.prisma.transaction(async (tx) => {
      await tx.financial_bank_movements.updateMany({
        where: { tenant_id: user.tenant_id, id },
        data: {
          ...(dto.bank_account_id !== undefined ? { bank_account_id: dto.bank_account_id } : {}),
          ...(dto.movement_date !== undefined ? { movement_date: this.toDate(dto.movement_date) ?? undefined } : {}),
          ...(dto.movement_type !== undefined ? { movement_type: dto.movement_type } : {}),
          ...(dto.amount !== undefined ? { amount: this.decimal(dto.amount, '0') } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
          ...(dto.category_id !== undefined ? { category_id: dto.category_id ?? null } : {}),
          ...(dto.cost_center_id !== undefined ? { cost_center_id: dto.cost_center_id ?? null } : {}),
          ...(dto.reference_table !== undefined ? { reference_table: dto.reference_table?.trim() || null } : {}),
          ...(dto.reference_id !== undefined ? { reference_id: dto.reference_id ?? null } : {}),
          ...(dto.reconciled !== undefined ? { reconciled: dto.reconciled } : {}),
          ...(dto.reconciliation_note !== undefined ? { reconciliation_note: dto.reconciliation_note?.trim() || null } : {}),
          updated_at: new Date(),
        },
      });

      const newAccountId = dto.bank_account_id ?? existing.bank_account_id;
      await this.refreshBankAccountBalance(tx, user.tenant_id, existing.bank_account_id);
      if (newAccountId !== existing.bank_account_id) {
        await this.refreshBankAccountBalance(tx, user.tenant_id, newAccountId);
      }
    });

    return this.findBankMovementById(user, id);
  }

  async reconcileBankMovement(user: AuthUser, id: string, dto: ReconcileFinancialBankMovementDto) {
    const existing = await this.db.financial_bank_movements.findFirst({
      where: { tenant_id: user.tenant_id, id },
    });
    if (!existing) throw new NotFoundException('Bank movement not found');

    await this.db.financial_bank_movements.updateMany({
      where: { tenant_id: user.tenant_id, id },
      data: {
        reconciled: dto.reconciled,
        reconciliation_note: dto.reconciliation_note?.trim() || null,
        updated_at: new Date(),
      },
    });

    return this.findBankMovementById(user, id);
  }

  async removeBankMovement(user: AuthUser, id: string) {
    const existing = await this.db.financial_bank_movements.findFirst({
      where: { tenant_id: user.tenant_id, id },
    });
    if (!existing) throw new NotFoundException('Bank movement not found');

    const linkedReceivable = await this.db.financial_receivable_payments.count({
      where: { tenant_id: user.tenant_id, bank_movement_id: id },
    });
    const linkedPayable = await this.db.financial_payable_payments.count({
      where: { tenant_id: user.tenant_id, bank_movement_id: id },
    });
    if (linkedReceivable > 0 || linkedPayable > 0) {
      throw new BadRequestException('Unable to delete movement linked to payment settlement');
    }

    await this.prisma.transaction(async (tx) => {
      await tx.financial_bank_movements.deleteMany({
        where: { tenant_id: user.tenant_id, id },
      });
      await this.refreshBankAccountBalance(tx, user.tenant_id, existing.bank_account_id);
    });

    return existing;
  }

  async listReceivables(
    user: AuthUser,
    query: { q?: string; status?: string; entry_group?: string; company_id?: string; from_due?: string; to_due?: string },
  ) {
    const q = String(query.q || '').trim();
    const rows = await this.db.financial_receivables.findMany({
      where: {
        tenant_id: user.tenant_id,
        ...(query.status ? { status: query.status as any } : {}),
        ...(query.entry_group ? { entry_group: query.entry_group as any } : {}),
        ...(query.company_id ? { company_id: query.company_id } : {}),
        ...(query.from_due || query.to_due
          ? {
              due_date: {
                ...(query.from_due ? { gte: this.toDateOnly(query.from_due) ?? undefined } : {}),
                ...(query.to_due ? { lte: this.toDateOnly(query.to_due) ?? undefined } : {}),
              },
            }
          : {}),
        ...(q
          ? {
              OR: [
                { title_number: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { company: { company_name: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: [{ due_date: 'asc' }, { title_number: 'asc' }],
      include: {
        company: { select: { id: true, company_name: true, company_number: true } },
        invoice: { select: { id: true, invoice_number: true, total: true, due_at: true } },
        currency: { select: { id: true, code: true, symbol: true, decimals: true } },
        category: { select: { id: true, code: true, name: true } },
        cost_center: { select: { id: true, code: true, name: true } },
        _count: { select: { payments: true } },
      },
    });

    return rows.map((row) => this.decorateEntryState(row));
  }

  async findReceivableById(user: AuthUser, id: string) {
    const item = await this.db.financial_receivables.findFirst({
      where: { tenant_id: user.tenant_id, id },
      include: {
        company: { select: { id: true, company_name: true, company_number: true } },
        invoice: { select: { id: true, invoice_number: true, total: true, due_at: true } },
        document: { select: { id: true, name: true, item_type: true } },
        currency: { select: { id: true, code: true, symbol: true, decimals: true } },
        category: { select: { id: true, code: true, name: true } },
        cost_center: { select: { id: true, code: true, name: true } },
        payments: {
          orderBy: [{ payment_date: 'desc' }, { created_at: 'desc' }],
          include: {
            bank_account: { select: { id: true, name: true, bank_name: true, account_number: true } },
            bank_movement: true,
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Receivable not found');
    return this.decorateEntryState(item);
  }

  async createReceivable(user: AuthUser, dto: CreateFinancialReceivableDto) {
    const createdIds = await this.prisma.transaction(async (tx) => this.createReceivableSeries(tx, user, dto));
    return this.findReceivableById(user, createdIds[0]);
  }

  async generateReceivablesFromInvoice(user: AuthUser, invoiceId: string, dto: GenerateReceivableFromInvoiceDto) {
    const installments = dto.installment_total ?? 1;
    const intervalDays = dto.interval_days ?? 30;
    if (installments < 1) throw new BadRequestException('installment_total must be >= 1');

    const invoice = await this.db.invoices.findFirst({
      where: { tenant_id: user.tenant_id, id: invoiceId },
      select: {
        id: true,
        invoice_number: true,
        company_id: true,
        currency_id: true,
        received_amount_brl: true,
        total: true,
        due_at: true,
        issued_at: true,
        notes: true,
        currencies: {
          select: {
            code: true,
          },
        },
      } as any,
    }) as any;
    if (!invoice) throw new NotFoundException('Invoice not found');

    const useBrlAmount =
      String(invoice?.currencies?.code || '').trim().toUpperCase() !== 'BRL' && invoice.received_amount_brl != null;
    const targetCurrencyId = useBrlAmount
      ? await this.resolveCurrencyIdByCode('BRL')
      : invoice.currency_id;
    const sourceAmount = useBrlAmount ? invoice.received_amount_brl : invoice.total;
    const totalCents = this.toCents(sourceAmount);
    const baseInstallment = Math.floor(totalCents / installments);
    const remainder = totalCents % installments;
    const firstDueDate =
      this.toDateOnly(dto.first_due_date) ??
      this.toDateOnly(invoice.due_at as any) ??
      this.toDateOnly(invoice.issued_at as any) ??
      this.todayDateOnly();

    const createdIds = await this.prisma.transaction(async (tx) => {
      const ids: string[] = [];
      for (let i = 0; i < installments; i++) {
        const cents = baseInstallment + (i < remainder ? 1 : 0);
        const amount = this.decimalFromCents(cents);
        const dueDate = this.addDays(firstDueDate, i * intervalDays);

        let titleNumber = `${invoice.invoice_number}-${String(i + 1).padStart(2, '0')}`;
        let suffix = 0;
        while (
          await tx.financial_receivables.findFirst({
            where: { tenant_id: user.tenant_id, title_number: titleNumber },
            select: { id: true },
          })
        ) {
          suffix += 1;
          titleNumber = `${invoice.invoice_number}-${String(i + 1).padStart(2, '0')}-${suffix}`;
        }

        const computed = this.computeEntryState(amount, this.decimal('0'), dueDate);
        const item = await tx.financial_receivables.create({
          data: {
            tenant_id: user.tenant_id,
            title_number: titleNumber,
            description: dto.notes?.trim() || invoice.notes || `Generated from invoice ${invoice.invoice_number}`,
            company_id: invoice.company_id,
            invoice_id: invoice.id,
            currency_id: targetCurrencyId,
            category_id: dto.category_id ?? null,
            cost_center_id: dto.cost_center_id ?? null,
            issue_date: this.toDateOnly(invoice.issued_at as any) ?? this.todayDateOnly(),
            due_date: dueDate,
            original_amount: amount,
            paid_amount: computed.paidAmount,
            outstanding_amount: computed.outstandingAmount,
            installment_number: i + 1,
            installment_total: installments,
            status: computed.status,
            is_delinquent: computed.isDelinquent,
            delinquent_days: computed.delinquentDays,
          },
        });
        ids.push(item.id);

        await this.createFinanceEvent(tx, {
          tenantId: user.tenant_id,
          relatedTable: 'financial_receivables',
          relatedId: item.id,
          title: `Receivable generated from invoice ${invoice.invoice_number}`,
          description: `Installment ${i + 1}/${installments}`,
        });
      }
      return ids;
    });

    return this.db.financial_receivables.findMany({
      where: { tenant_id: user.tenant_id, id: { in: createdIds } },
      include: {
        company: { select: { id: true, company_name: true } },
        invoice: { select: { id: true, invoice_number: true } },
        currency: { select: { id: true, code: true, symbol: true } },
      },
      orderBy: [{ installment_number: 'asc' }],
    });
  }

  private async createReceivableSeries(tx: PrismaClient, user: AuthUser, dto: CreateFinancialReceivableDto) {
    const baseDueDate = this.toDateOnly(dto.due_date) ?? this.todayDateOnly();
    const baseIssueDate = this.toDateOnly(dto.issue_date);
    const recurrenceDates = this.buildRecurrenceDates(
      baseDueDate,
      dto.recurrence_enabled,
      dto.recurrence_frequency,
      dto.recurrence_interval,
      dto.recurrence_occurrences,
      dto.recurrence_end_date,
      dto.recurrence_day_of_month,
    );
    const baseTitleNumber = dto.title_number.trim();
    const original = this.decimal(dto.original_amount, '0');
    const createdIds: string[] = [];
    let rootId: string | null = null;

    for (let index = 0; index < recurrenceDates.length; index += 1) {
      const dueDate = recurrenceDates[index];
      const issueDate = baseIssueDate
        ? this.shiftRecurrenceDate(
            baseIssueDate,
            dto.recurrence_frequency ?? FinancialRecurrenceFrequency.MONTHLY,
            dto.recurrence_interval ?? 1,
            index,
            dto.recurrence_day_of_month,
          )
        : null;
      const computed = this.computeEntryState(original, this.decimal('0'), dueDate);
      const titleNumber = await this.ensureUniqueEntryNumber(
        tx,
        'financial_receivables',
        'title_number',
        user.tenant_id,
        index === 0 ? baseTitleNumber : this.buildGeneratedEntryNumber(baseTitleNumber, index + 1),
      );

      const item = await tx.financial_receivables.create({
        data: {
          tenant_id: user.tenant_id,
          title_number: titleNumber,
          description: dto.description?.trim() || null,
          company_id: dto.company_id,
          invoice_id: dto.invoice_id ?? null,
          document_id: dto.document_id ?? null,
          currency_id: dto.currency_id,
          category_id: dto.category_id ?? null,
          cost_center_id: dto.cost_center_id ?? null,
          issue_date: issueDate,
          due_date: dueDate,
          original_amount: original,
          paid_amount: computed.paidAmount,
          outstanding_amount: computed.outstandingAmount,
          entry_group: dto.entry_group ?? FinancialEntryGroup.VARIABLE,
          installment_number: dto.installment_number ?? 1,
          installment_total: dto.installment_total ?? 1,
          recurrence_enabled: dto.recurrence_enabled ?? false,
          recurrence_frequency: dto.recurrence_enabled ? dto.recurrence_frequency ?? FinancialRecurrenceFrequency.MONTHLY : null,
          recurrence_interval: dto.recurrence_interval ?? 1,
          recurrence_day_of_month: dto.recurrence_day_of_month ?? null,
          recurrence_occurrences: dto.recurrence_occurrences ?? null,
          recurrence_end_date: this.toDateOnly(dto.recurrence_end_date),
          recurrence_auto_create: dto.recurrence_auto_create ?? false,
          recurrence_series_id: rootId,
          recurrence_parent_id: rootId,
          status: dto.status ?? computed.status,
          is_delinquent: computed.isDelinquent,
          delinquent_days: computed.delinquentDays,
          notes: dto.notes?.trim() || null,
        },
      });

      if (!rootId) {
        rootId = item.id;
        if (recurrenceDates.length > 1 || dto.recurrence_enabled) {
          await tx.financial_receivables.updateMany({
            where: { tenant_id: user.tenant_id, id: item.id },
            data: {
              recurrence_series_id: item.id,
              recurrence_parent_id: item.id,
              updated_at: new Date(),
            },
          });
        }
      }

      createdIds.push(item.id);
      await this.createFinanceEvent(tx, {
        tenantId: user.tenant_id,
        relatedTable: 'financial_receivables',
        relatedId: item.id,
        title: index === 0 ? `Receivable created: ${item.title_number}` : `Receivable recurrence created: ${item.title_number}`,
        description:
          recurrenceDates.length > 1
            ? `Occurrence ${index + 1}/${recurrenceDates.length}`
            : item.description || 'Receivable title created',
      });
    }

    return createdIds;
  }

  private async createPayableSeries(tx: PrismaClient, user: AuthUser, dto: CreateFinancialPayableDto) {
    const baseDueDate = this.toDateOnly(dto.due_date) ?? this.todayDateOnly();
    const baseIssueDate = this.toDateOnly(dto.issue_date);
    const recurrenceDates = this.buildRecurrenceDates(
      baseDueDate,
      dto.recurrence_enabled,
      dto.recurrence_frequency,
      dto.recurrence_interval,
      dto.recurrence_occurrences,
      dto.recurrence_end_date,
      dto.recurrence_day_of_month,
    );
    const basePayableNumber = dto.payable_number.trim();
    const original = this.decimal(dto.original_amount, '0');
    const createdIds: string[] = [];
    let rootId: string | null = null;

    for (let index = 0; index < recurrenceDates.length; index += 1) {
      const dueDate = recurrenceDates[index];
      const issueDate = baseIssueDate
        ? this.shiftRecurrenceDate(
            baseIssueDate,
            dto.recurrence_frequency ?? FinancialRecurrenceFrequency.MONTHLY,
            dto.recurrence_interval ?? 1,
            index,
            dto.recurrence_day_of_month,
          )
        : null;
      const computed = this.computeEntryState(original, this.decimal('0'), dueDate);
      const payableNumber = await this.ensureUniqueEntryNumber(
        tx,
        'financial_payables',
        'payable_number',
        user.tenant_id,
        index === 0 ? basePayableNumber : this.buildGeneratedEntryNumber(basePayableNumber, index + 1),
      );

      const item = await tx.financial_payables.create({
        data: {
          tenant_id: user.tenant_id,
          payable_number: payableNumber,
          description: dto.description?.trim() || null,
          company_id: dto.company_id ?? null,
          document_id: dto.document_id ?? null,
          currency_id: dto.currency_id,
          category_id: dto.category_id ?? null,
          cost_center_id: dto.cost_center_id ?? null,
          issue_date: issueDate,
          due_date: dueDate,
          original_amount: original,
          paid_amount: computed.paidAmount,
          outstanding_amount: computed.outstandingAmount,
          entry_group: dto.entry_group ?? FinancialEntryGroup.VARIABLE,
          installment_number: dto.installment_number ?? 1,
          installment_total: dto.installment_total ?? 1,
          recurrence_enabled: dto.recurrence_enabled ?? false,
          recurrence_frequency: dto.recurrence_enabled ? dto.recurrence_frequency ?? FinancialRecurrenceFrequency.MONTHLY : null,
          recurrence_interval: dto.recurrence_interval ?? 1,
          recurrence_day_of_month: dto.recurrence_day_of_month ?? null,
          recurrence_occurrences: dto.recurrence_occurrences ?? null,
          recurrence_end_date: this.toDateOnly(dto.recurrence_end_date),
          recurrence_auto_create: dto.recurrence_auto_create ?? false,
          recurrence_series_id: rootId,
          recurrence_parent_id: rootId,
          status: dto.status ?? computed.status,
          is_delinquent: computed.isDelinquent,
          delinquent_days: computed.delinquentDays,
          notes: dto.notes?.trim() || null,
        },
      });

      if (!rootId) {
        rootId = item.id;
        if (recurrenceDates.length > 1 || dto.recurrence_enabled) {
          await tx.financial_payables.updateMany({
            where: { tenant_id: user.tenant_id, id: item.id },
            data: {
              recurrence_series_id: item.id,
              recurrence_parent_id: item.id,
              updated_at: new Date(),
            },
          });
        }
      }

      createdIds.push(item.id);
      await this.createFinanceEvent(tx, {
        tenantId: user.tenant_id,
        relatedTable: 'financial_payables',
        relatedId: item.id,
        title: index === 0 ? `Payable created: ${item.payable_number}` : `Payable recurrence created: ${item.payable_number}`,
        description:
          recurrenceDates.length > 1
            ? `Occurrence ${index + 1}/${recurrenceDates.length}`
            : item.description || 'Payable title created',
      });
    }

    return createdIds;
  }

  async updateReceivable(user: AuthUser, id: string, dto: UpdateFinancialReceivableDto) {
    const existing = await this.db.financial_receivables.findFirst({
      where: { tenant_id: user.tenant_id, id },
    });
    if (!existing) throw new NotFoundException('Receivable not found');

    await this.prisma.transaction(async (tx) => {
      await tx.financial_receivables.updateMany({
        where: { tenant_id: user.tenant_id, id },
        data: {
          ...(dto.title_number !== undefined ? { title_number: dto.title_number.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
          ...(dto.company_id !== undefined ? { company_id: dto.company_id } : {}),
          ...(dto.invoice_id !== undefined ? { invoice_id: dto.invoice_id ?? null } : {}),
          ...(dto.document_id !== undefined ? { document_id: dto.document_id ?? null } : {}),
          ...(dto.currency_id !== undefined ? { currency_id: dto.currency_id } : {}),
          ...(dto.category_id !== undefined ? { category_id: dto.category_id ?? null } : {}),
          ...(dto.cost_center_id !== undefined ? { cost_center_id: dto.cost_center_id ?? null } : {}),
          ...(dto.issue_date !== undefined ? { issue_date: this.toDateOnly(dto.issue_date) } : {}),
          ...(dto.due_date !== undefined ? { due_date: this.toDateOnly(dto.due_date) ?? undefined } : {}),
          ...(dto.original_amount !== undefined ? { original_amount: this.decimal(dto.original_amount, '0') } : {}),
          ...(dto.entry_group !== undefined ? { entry_group: dto.entry_group } : {}),
          ...(dto.installment_number !== undefined ? { installment_number: dto.installment_number } : {}),
          ...(dto.installment_total !== undefined ? { installment_total: dto.installment_total } : {}),
          ...(dto.recurrence_enabled !== undefined ? { recurrence_enabled: dto.recurrence_enabled } : {}),
          ...(dto.recurrence_frequency !== undefined ? { recurrence_frequency: dto.recurrence_frequency ?? null } : {}),
          ...(dto.recurrence_interval !== undefined ? { recurrence_interval: dto.recurrence_interval ?? 1 } : {}),
          ...(dto.recurrence_day_of_month !== undefined ? { recurrence_day_of_month: dto.recurrence_day_of_month ?? null } : {}),
          ...(dto.recurrence_occurrences !== undefined ? { recurrence_occurrences: dto.recurrence_occurrences ?? null } : {}),
          ...(dto.recurrence_end_date !== undefined ? { recurrence_end_date: this.toDateOnly(dto.recurrence_end_date) } : {}),
          ...(dto.recurrence_auto_create !== undefined ? { recurrence_auto_create: dto.recurrence_auto_create } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
          updated_at: new Date(),
        },
      });
      await this.syncReceivableState(tx, user.tenant_id, id);
    });

    return this.findReceivableById(user, id);
  }

  async removeReceivable(user: AuthUser, id: string) {
    const existing = await this.db.financial_receivables.findFirst({
      where: { tenant_id: user.tenant_id, id },
      include: {
        payments: {
          select: { id: true, bank_account_id: true, bank_movement_id: true },
        },
      },
    });
    if (!existing) throw new NotFoundException('Receivable not found');

    await this.prisma.transaction(async (tx) => {
      const accountIds = new Set<string>();
      for (const payment of existing.payments) {
        if (payment.bank_account_id) accountIds.add(payment.bank_account_id);
        if (payment.bank_movement_id) {
          await tx.financial_bank_movements.deleteMany({
            where: { tenant_id: user.tenant_id, id: payment.bank_movement_id },
          });
        }
      }

      await tx.financial_receivable_payments.deleteMany({
        where: { tenant_id: user.tenant_id, receivable_id: id },
      });

      await tx.financial_receivables.deleteMany({
        where: { tenant_id: user.tenant_id, id },
      });

      for (const accountId of Array.from(accountIds)) {
        await this.refreshBankAccountBalance(tx, user.tenant_id, accountId);
      }
    });

    return existing;
  }

  async createReceivablePayment(user: AuthUser, receivableId: string, dto: CreateFinancialReceivablePaymentDto) {
    const receivable = await this.db.financial_receivables.findFirst({
      where: { tenant_id: user.tenant_id, id: receivableId },
    });
    if (!receivable) throw new NotFoundException('Receivable not found');

    await this.prisma.transaction(async (tx) => {
      const payment = await tx.financial_receivable_payments.create({
        data: {
          tenant_id: user.tenant_id,
          receivable_id: receivableId,
          bank_account_id: dto.bank_account_id ?? null,
          payment_date: this.toDate(dto.payment_date) ?? new Date(),
          amount: this.decimal(dto.amount, '0'),
          fee_amount: this.decimal(dto.fee_amount, '0'),
          interest_amount: this.decimal(dto.interest_amount, '0'),
          discount_amount: this.decimal(dto.discount_amount, '0'),
          payment_method: dto.payment_method ?? FinancialPaymentMethod.OTHER,
          reference: dto.reference?.trim() || null,
          notes: dto.notes?.trim() || null,
        },
      });

      if (payment.bank_account_id) {
        const movementAmount = this.getReceivableBankMovementAmount(payment);
        if (movementAmount.greaterThan(0)) {
          const movement = await tx.financial_bank_movements.create({
            data: {
              tenant_id: user.tenant_id,
              bank_account_id: payment.bank_account_id,
              movement_date: payment.payment_date,
              movement_type: FinancialMovementType.CREDIT,
              amount: movementAmount,
              description: `Receivable settlement ${receivable.title_number}`,
              category_id: receivable.category_id ?? null,
              cost_center_id: receivable.cost_center_id ?? null,
              reference_table: 'financial_receivables',
              reference_id: receivable.id,
              reconciled: false,
            },
          });
          await tx.financial_receivable_payments.updateMany({
            where: { tenant_id: user.tenant_id, id: payment.id },
            data: { bank_movement_id: movement.id, updated_at: new Date() },
          });
        }
      }

      await this.syncReceivableState(tx, user.tenant_id, receivableId);
      if (payment.bank_account_id) {
        await this.refreshBankAccountBalance(tx, user.tenant_id, payment.bank_account_id);
      }

      await this.createFinanceEvent(tx, {
        tenantId: user.tenant_id,
        relatedTable: 'financial_receivables',
        relatedId: receivableId,
        title: `Receivable settlement: ${receivable.title_number}`,
        description: `Amount settled ${dto.amount}`,
      });
    });

    return this.findReceivableById(user, receivableId);
  }

  async updateReceivablePayment(
    user: AuthUser,
    receivableId: string,
    paymentId: string,
    dto: UpdateFinancialReceivablePaymentDto,
  ) {
    const existing = await this.db.financial_receivable_payments.findFirst({
      where: { tenant_id: user.tenant_id, id: paymentId, receivable_id: receivableId },
    });
    if (!existing) throw new NotFoundException('Receivable payment not found');

    const receivable = await this.db.financial_receivables.findFirst({
      where: { tenant_id: user.tenant_id, id: receivableId },
    });
    if (!receivable) throw new NotFoundException('Receivable not found');

    await this.prisma.transaction(async (tx) => {
      await tx.financial_receivable_payments.updateMany({
        where: { tenant_id: user.tenant_id, id: paymentId, receivable_id: receivableId },
        data: {
          ...(dto.bank_account_id !== undefined ? { bank_account_id: dto.bank_account_id ?? null } : {}),
          ...(dto.payment_date !== undefined ? { payment_date: this.toDate(dto.payment_date) ?? undefined } : {}),
          ...(dto.amount !== undefined ? { amount: this.decimal(dto.amount, '0') } : {}),
          ...(dto.fee_amount !== undefined ? { fee_amount: this.decimal(dto.fee_amount, '0') } : {}),
          ...(dto.interest_amount !== undefined ? { interest_amount: this.decimal(dto.interest_amount, '0') } : {}),
          ...(dto.discount_amount !== undefined ? { discount_amount: this.decimal(dto.discount_amount, '0') } : {}),
          ...(dto.payment_method !== undefined ? { payment_method: dto.payment_method } : {}),
          ...(dto.reference !== undefined ? { reference: dto.reference?.trim() || null } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
          updated_at: new Date(),
        },
      });

      const updated = await tx.financial_receivable_payments.findFirst({
        where: { tenant_id: user.tenant_id, id: paymentId, receivable_id: receivableId },
      });
      if (!updated) throw new NotFoundException('Receivable payment not found');

      const oldAccountId = existing.bank_account_id || null;
      const newAccountId = updated.bank_account_id || null;
      const shouldHaveMovement = !!newAccountId;

      if (existing.bank_movement_id && !shouldHaveMovement) {
        await tx.financial_bank_movements.deleteMany({
          where: { tenant_id: user.tenant_id, id: existing.bank_movement_id },
        });
        await tx.financial_receivable_payments.updateMany({
          where: { tenant_id: user.tenant_id, id: paymentId },
          data: { bank_movement_id: null, updated_at: new Date() },
        });
      }

      if (shouldHaveMovement) {
        const movementAmount = this.getReceivableBankMovementAmount(updated);
        if (existing.bank_movement_id) {
          if (movementAmount.greaterThan(0)) {
            await tx.financial_bank_movements.updateMany({
              where: { tenant_id: user.tenant_id, id: existing.bank_movement_id },
              data: {
                bank_account_id: newAccountId as string,
                movement_date: updated.payment_date,
                movement_type: FinancialMovementType.CREDIT,
                amount: movementAmount,
                description: `Receivable settlement ${receivable.title_number}`,
                category_id: receivable.category_id ?? null,
                cost_center_id: receivable.cost_center_id ?? null,
                reference_table: 'financial_receivables',
                reference_id: receivable.id,
                updated_at: new Date(),
              },
            });
          } else {
            await tx.financial_bank_movements.deleteMany({
              where: { tenant_id: user.tenant_id, id: existing.bank_movement_id },
            });
            await tx.financial_receivable_payments.updateMany({
              where: { tenant_id: user.tenant_id, id: paymentId },
              data: { bank_movement_id: null, updated_at: new Date() },
            });
          }
        } else if (movementAmount.greaterThan(0)) {
          const movement = await tx.financial_bank_movements.create({
            data: {
              tenant_id: user.tenant_id,
              bank_account_id: newAccountId as string,
              movement_date: updated.payment_date,
              movement_type: FinancialMovementType.CREDIT,
              amount: movementAmount,
              description: `Receivable settlement ${receivable.title_number}`,
              category_id: receivable.category_id ?? null,
              cost_center_id: receivable.cost_center_id ?? null,
              reference_table: 'financial_receivables',
              reference_id: receivable.id,
              reconciled: false,
            },
          });
          await tx.financial_receivable_payments.updateMany({
            where: { tenant_id: user.tenant_id, id: paymentId },
            data: { bank_movement_id: movement.id, updated_at: new Date() },
          });
        }
      }

      await this.syncReceivableState(tx, user.tenant_id, receivableId);
      if (oldAccountId) await this.refreshBankAccountBalance(tx, user.tenant_id, oldAccountId);
      if (newAccountId && newAccountId !== oldAccountId) await this.refreshBankAccountBalance(tx, user.tenant_id, newAccountId);
      if (newAccountId && newAccountId === oldAccountId) await this.refreshBankAccountBalance(tx, user.tenant_id, newAccountId);
    });

    return this.findReceivableById(user, receivableId);
  }

  async removeReceivablePayment(user: AuthUser, receivableId: string, paymentId: string) {
    const existing = await this.db.financial_receivable_payments.findFirst({
      where: { tenant_id: user.tenant_id, id: paymentId, receivable_id: receivableId },
    });
    if (!existing) throw new NotFoundException('Receivable payment not found');

    await this.prisma.transaction(async (tx) => {
      if (existing.bank_movement_id) {
        await tx.financial_bank_movements.deleteMany({
          where: { tenant_id: user.tenant_id, id: existing.bank_movement_id },
        });
      }

      await tx.financial_receivable_payments.deleteMany({
        where: { tenant_id: user.tenant_id, id: paymentId, receivable_id: receivableId },
      });

      await this.syncReceivableState(tx, user.tenant_id, receivableId);
      if (existing.bank_account_id) {
        await this.refreshBankAccountBalance(tx, user.tenant_id, existing.bank_account_id);
      }
    });

    return this.findReceivableById(user, receivableId);
  }

  async listPayables(
    user: AuthUser,
    query: { q?: string; status?: string; entry_group?: string; company_id?: string; from_due?: string; to_due?: string },
  ) {
    const q = String(query.q || '').trim();
    const rows = await this.db.financial_payables.findMany({
      where: {
        tenant_id: user.tenant_id,
        ...(query.status ? { status: query.status as any } : {}),
        ...(query.entry_group ? { entry_group: query.entry_group as any } : {}),
        ...(query.company_id ? { company_id: query.company_id } : {}),
        ...(query.from_due || query.to_due
          ? {
              due_date: {
                ...(query.from_due ? { gte: this.toDateOnly(query.from_due) ?? undefined } : {}),
                ...(query.to_due ? { lte: this.toDateOnly(query.to_due) ?? undefined } : {}),
              },
            }
          : {}),
        ...(q
          ? {
              OR: [
                { payable_number: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
                { company: { company_name: { contains: q, mode: 'insensitive' } } },
              ],
            }
          : {}),
      },
      orderBy: [{ due_date: 'asc' }, { payable_number: 'asc' }],
      include: {
        company: { select: { id: true, company_name: true, company_number: true } },
        document: { select: { id: true, name: true, item_type: true } },
        currency: { select: { id: true, code: true, symbol: true, decimals: true } },
        category: { select: { id: true, code: true, name: true } },
        cost_center: { select: { id: true, code: true, name: true } },
        _count: { select: { payments: true } },
      },
    });

    return rows.map((row) => this.decorateEntryState(row));
  }

  async findPayableById(user: AuthUser, id: string) {
    const item = await this.db.financial_payables.findFirst({
      where: { tenant_id: user.tenant_id, id },
      include: {
        company: { select: { id: true, company_name: true, company_number: true } },
        document: { select: { id: true, name: true, item_type: true } },
        currency: { select: { id: true, code: true, symbol: true, decimals: true } },
        category: { select: { id: true, code: true, name: true } },
        cost_center: { select: { id: true, code: true, name: true } },
        payments: {
          orderBy: [{ payment_date: 'desc' }, { created_at: 'desc' }],
          include: {
            bank_account: { select: { id: true, name: true, bank_name: true, account_number: true } },
            bank_movement: true,
          },
        },
      },
    });
    if (!item) throw new NotFoundException('Payable not found');
    return this.decorateEntryState(item);
  }

  async createPayable(user: AuthUser, dto: CreateFinancialPayableDto) {
    const createdIds = await this.prisma.transaction(async (tx) => this.createPayableSeries(tx, user, dto));
    return this.findPayableById(user, createdIds[0]);
  }

  async updatePayable(user: AuthUser, id: string, dto: UpdateFinancialPayableDto) {
    const existing = await this.db.financial_payables.findFirst({
      where: { tenant_id: user.tenant_id, id },
    });
    if (!existing) throw new NotFoundException('Payable not found');

    await this.prisma.transaction(async (tx) => {
      await tx.financial_payables.updateMany({
        where: { tenant_id: user.tenant_id, id },
        data: {
          ...(dto.payable_number !== undefined ? { payable_number: dto.payable_number.trim() } : {}),
          ...(dto.description !== undefined ? { description: dto.description?.trim() || null } : {}),
          ...(dto.company_id !== undefined ? { company_id: dto.company_id ?? null } : {}),
          ...(dto.document_id !== undefined ? { document_id: dto.document_id ?? null } : {}),
          ...(dto.currency_id !== undefined ? { currency_id: dto.currency_id } : {}),
          ...(dto.category_id !== undefined ? { category_id: dto.category_id ?? null } : {}),
          ...(dto.cost_center_id !== undefined ? { cost_center_id: dto.cost_center_id ?? null } : {}),
          ...(dto.issue_date !== undefined ? { issue_date: this.toDateOnly(dto.issue_date) } : {}),
          ...(dto.due_date !== undefined ? { due_date: this.toDateOnly(dto.due_date) ?? undefined } : {}),
          ...(dto.original_amount !== undefined ? { original_amount: this.decimal(dto.original_amount, '0') } : {}),
          ...(dto.entry_group !== undefined ? { entry_group: dto.entry_group } : {}),
          ...(dto.installment_number !== undefined ? { installment_number: dto.installment_number } : {}),
          ...(dto.installment_total !== undefined ? { installment_total: dto.installment_total } : {}),
          ...(dto.recurrence_enabled !== undefined ? { recurrence_enabled: dto.recurrence_enabled } : {}),
          ...(dto.recurrence_frequency !== undefined ? { recurrence_frequency: dto.recurrence_frequency ?? null } : {}),
          ...(dto.recurrence_interval !== undefined ? { recurrence_interval: dto.recurrence_interval ?? 1 } : {}),
          ...(dto.recurrence_day_of_month !== undefined ? { recurrence_day_of_month: dto.recurrence_day_of_month ?? null } : {}),
          ...(dto.recurrence_occurrences !== undefined ? { recurrence_occurrences: dto.recurrence_occurrences ?? null } : {}),
          ...(dto.recurrence_end_date !== undefined ? { recurrence_end_date: this.toDateOnly(dto.recurrence_end_date) } : {}),
          ...(dto.recurrence_auto_create !== undefined ? { recurrence_auto_create: dto.recurrence_auto_create } : {}),
          ...(dto.status !== undefined ? { status: dto.status } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
          updated_at: new Date(),
        },
      });
      await this.syncPayableState(tx, user.tenant_id, id);
    });

    return this.findPayableById(user, id);
  }

  async removePayable(user: AuthUser, id: string) {
    const existing = await this.db.financial_payables.findFirst({
      where: { tenant_id: user.tenant_id, id },
      include: {
        payments: {
          select: { bank_account_id: true, bank_movement_id: true },
        },
      },
    });
    if (!existing) throw new NotFoundException('Payable not found');

    await this.prisma.transaction(async (tx) => {
      const accountIds = new Set<string>();
      for (const payment of existing.payments) {
        if (payment.bank_account_id) accountIds.add(payment.bank_account_id);
        if (payment.bank_movement_id) {
          await tx.financial_bank_movements.deleteMany({
            where: { tenant_id: user.tenant_id, id: payment.bank_movement_id },
          });
        }
      }

      await tx.financial_payable_payments.deleteMany({
        where: { tenant_id: user.tenant_id, payable_id: id },
      });

      await tx.financial_payables.deleteMany({
        where: { tenant_id: user.tenant_id, id },
      });

      for (const accountId of Array.from(accountIds)) {
        await this.refreshBankAccountBalance(tx, user.tenant_id, accountId);
      }
    });

    return existing;
  }

  async createPayablePayment(user: AuthUser, payableId: string, dto: CreateFinancialPayablePaymentDto) {
    const payable = await this.db.financial_payables.findFirst({
      where: { tenant_id: user.tenant_id, id: payableId },
    });
    if (!payable) throw new NotFoundException('Payable not found');

    await this.prisma.transaction(async (tx) => {
      const payment = await tx.financial_payable_payments.create({
        data: {
          tenant_id: user.tenant_id,
          payable_id: payableId,
          bank_account_id: dto.bank_account_id ?? null,
          payment_date: this.toDate(dto.payment_date) ?? new Date(),
          amount: this.decimal(dto.amount, '0'),
          fee_amount: this.decimal(dto.fee_amount, '0'),
          interest_amount: this.decimal(dto.interest_amount, '0'),
          discount_amount: this.decimal(dto.discount_amount, '0'),
          payment_method: dto.payment_method ?? FinancialPaymentMethod.OTHER,
          reference: dto.reference?.trim() || null,
          notes: dto.notes?.trim() || null,
        },
      });

      if (payment.bank_account_id) {
        const movementAmount = this.getPayableBankMovementAmount(payment);
        if (movementAmount.greaterThan(0)) {
          const movement = await tx.financial_bank_movements.create({
            data: {
              tenant_id: user.tenant_id,
              bank_account_id: payment.bank_account_id,
              movement_date: payment.payment_date,
              movement_type: FinancialMovementType.DEBIT,
              amount: movementAmount,
              description: `Payable settlement ${payable.payable_number}`,
              category_id: payable.category_id ?? null,
              cost_center_id: payable.cost_center_id ?? null,
              reference_table: 'financial_payables',
              reference_id: payable.id,
              reconciled: false,
            },
          });
          await tx.financial_payable_payments.updateMany({
            where: { tenant_id: user.tenant_id, id: payment.id },
            data: { bank_movement_id: movement.id, updated_at: new Date() },
          });
        }
      }

      await this.syncPayableState(tx, user.tenant_id, payableId);
      if (payment.bank_account_id) await this.refreshBankAccountBalance(tx, user.tenant_id, payment.bank_account_id);
    });

    return this.findPayableById(user, payableId);
  }

  async updatePayablePayment(
    user: AuthUser,
    payableId: string,
    paymentId: string,
    dto: UpdateFinancialPayablePaymentDto,
  ) {
    const existing = await this.db.financial_payable_payments.findFirst({
      where: { tenant_id: user.tenant_id, id: paymentId, payable_id: payableId },
    });
    if (!existing) throw new NotFoundException('Payable payment not found');

    const payable = await this.db.financial_payables.findFirst({
      where: { tenant_id: user.tenant_id, id: payableId },
    });
    if (!payable) throw new NotFoundException('Payable not found');

    await this.prisma.transaction(async (tx) => {
      await tx.financial_payable_payments.updateMany({
        where: { tenant_id: user.tenant_id, id: paymentId, payable_id: payableId },
        data: {
          ...(dto.bank_account_id !== undefined ? { bank_account_id: dto.bank_account_id ?? null } : {}),
          ...(dto.payment_date !== undefined ? { payment_date: this.toDate(dto.payment_date) ?? undefined } : {}),
          ...(dto.amount !== undefined ? { amount: this.decimal(dto.amount, '0') } : {}),
          ...(dto.fee_amount !== undefined ? { fee_amount: this.decimal(dto.fee_amount, '0') } : {}),
          ...(dto.interest_amount !== undefined ? { interest_amount: this.decimal(dto.interest_amount, '0') } : {}),
          ...(dto.discount_amount !== undefined ? { discount_amount: this.decimal(dto.discount_amount, '0') } : {}),
          ...(dto.payment_method !== undefined ? { payment_method: dto.payment_method } : {}),
          ...(dto.reference !== undefined ? { reference: dto.reference?.trim() || null } : {}),
          ...(dto.notes !== undefined ? { notes: dto.notes?.trim() || null } : {}),
          updated_at: new Date(),
        },
      });

      const updated = await tx.financial_payable_payments.findFirst({
        where: { tenant_id: user.tenant_id, id: paymentId, payable_id: payableId },
      });
      if (!updated) throw new NotFoundException('Payable payment not found');

      const oldAccountId = existing.bank_account_id || null;
      const newAccountId = updated.bank_account_id || null;
      const shouldHaveMovement = !!newAccountId;

      if (existing.bank_movement_id && !shouldHaveMovement) {
        await tx.financial_bank_movements.deleteMany({
          where: { tenant_id: user.tenant_id, id: existing.bank_movement_id },
        });
        await tx.financial_payable_payments.updateMany({
          where: { tenant_id: user.tenant_id, id: paymentId },
          data: { bank_movement_id: null, updated_at: new Date() },
        });
      }

      if (shouldHaveMovement) {
        const movementAmount = this.getPayableBankMovementAmount(updated);
        if (existing.bank_movement_id) {
          if (movementAmount.greaterThan(0)) {
            await tx.financial_bank_movements.updateMany({
              where: { tenant_id: user.tenant_id, id: existing.bank_movement_id },
              data: {
                bank_account_id: newAccountId as string,
                movement_date: updated.payment_date,
                movement_type: FinancialMovementType.DEBIT,
                amount: movementAmount,
                description: `Payable settlement ${payable.payable_number}`,
                category_id: payable.category_id ?? null,
                cost_center_id: payable.cost_center_id ?? null,
                reference_table: 'financial_payables',
                reference_id: payable.id,
                updated_at: new Date(),
              },
            });
          } else {
            await tx.financial_bank_movements.deleteMany({
              where: { tenant_id: user.tenant_id, id: existing.bank_movement_id },
            });
            await tx.financial_payable_payments.updateMany({
              where: { tenant_id: user.tenant_id, id: paymentId },
              data: { bank_movement_id: null, updated_at: new Date() },
            });
          }
        } else if (movementAmount.greaterThan(0)) {
          const movement = await tx.financial_bank_movements.create({
            data: {
              tenant_id: user.tenant_id,
              bank_account_id: newAccountId as string,
              movement_date: updated.payment_date,
              movement_type: FinancialMovementType.DEBIT,
              amount: movementAmount,
              description: `Payable settlement ${payable.payable_number}`,
              category_id: payable.category_id ?? null,
              cost_center_id: payable.cost_center_id ?? null,
              reference_table: 'financial_payables',
              reference_id: payable.id,
              reconciled: false,
            },
          });
          await tx.financial_payable_payments.updateMany({
            where: { tenant_id: user.tenant_id, id: paymentId },
            data: { bank_movement_id: movement.id, updated_at: new Date() },
          });
        }
      }

      await this.syncPayableState(tx, user.tenant_id, payableId);
      if (oldAccountId) await this.refreshBankAccountBalance(tx, user.tenant_id, oldAccountId);
      if (newAccountId && newAccountId !== oldAccountId) await this.refreshBankAccountBalance(tx, user.tenant_id, newAccountId);
      if (newAccountId && newAccountId === oldAccountId) await this.refreshBankAccountBalance(tx, user.tenant_id, newAccountId);
    });

    return this.findPayableById(user, payableId);
  }

  async removePayablePayment(user: AuthUser, payableId: string, paymentId: string) {
    const existing = await this.db.financial_payable_payments.findFirst({
      where: { tenant_id: user.tenant_id, id: paymentId, payable_id: payableId },
    });
    if (!existing) throw new NotFoundException('Payable payment not found');

    await this.prisma.transaction(async (tx) => {
      if (existing.bank_movement_id) {
        await tx.financial_bank_movements.deleteMany({
          where: { tenant_id: user.tenant_id, id: existing.bank_movement_id },
        });
      }

      await tx.financial_payable_payments.deleteMany({
        where: { tenant_id: user.tenant_id, id: paymentId, payable_id: payableId },
      });

      await this.syncPayableState(tx, user.tenant_id, payableId);
      if (existing.bank_account_id) await this.refreshBankAccountBalance(tx, user.tenant_id, existing.bank_account_id);
    });

    return this.findPayableById(user, payableId);
  }

  async getCashFlowProjection(user: AuthUser, from?: string, to?: string) {
    const fromDate = this.toDateOnly(from) ?? this.todayDateOnly();
    const toDate = this.toDateOnly(to) ?? this.addDays(fromDate, 60);
    if (toDate < fromDate) throw new BadRequestException('Invalid period: to must be >= from');

    const rangeStart = new Date(fromDate);
    const rangeEnd = this.toDateEnd(this.dateKey(toDate)) ?? new Date(toDate);

    const [receivables, payables, accounts] = await Promise.all([
      this.db.financial_receivables.findMany({
        where: {
          tenant_id: user.tenant_id,
          status: { not: 'CANCELED' },
          due_date: { gte: fromDate, lte: toDate },
          outstanding_amount: { gt: this.decimal('0') },
        },
        select: { due_date: true, outstanding_amount: true },
      }),
      this.db.financial_payables.findMany({
        where: {
          tenant_id: user.tenant_id,
          status: { not: 'CANCELED' },
          due_date: { gte: fromDate, lte: toDate },
          outstanding_amount: { gt: this.decimal('0') },
        },
        select: { due_date: true, outstanding_amount: true },
      }),
      this.db.financial_bank_accounts.findMany({
        where: { tenant_id: user.tenant_id, is_active: true },
        select: { id: true, opening_balance: true },
      }),
    ]);

    const activeAccountIds = accounts
      .map((item) => String(item.id || '').trim())
      .filter(Boolean);

    const bankMovements = activeAccountIds.length
      ? await this.db.financial_bank_movements.findMany({
          where: {
            tenant_id: user.tenant_id,
            bank_account_id: { in: activeAccountIds },
            movement_date: { lte: rangeEnd },
          },
          select: {
            movement_date: true,
            movement_type: true,
            amount: true,
          },
        })
      : [];

    const incomingMap = new Map<string, number>();
    const outgoingMap = new Map<string, number>();
    for (const row of receivables) {
      const key = this.dateKey(row.due_date);
      incomingMap.set(key, this.roundMoney((incomingMap.get(key) ?? 0) + Number(row.outstanding_amount || 0)));
    }
    for (const row of payables) {
      const key = this.dateKey(row.due_date);
      outgoingMap.set(key, this.roundMoney((outgoingMap.get(key) ?? 0) + Number(row.outstanding_amount || 0)));
    }

    let openingBalance = accounts.reduce((acc, item) => acc + Number(item.opening_balance || 0), 0);
    for (const movement of bankMovements) {
      const movementDate = new Date(movement.movement_date as any);
      if (Number.isNaN(movementDate.getTime())) continue;

      const amount = this.roundMoney(Number(movement.amount || 0));
      const isCredit = movement.movement_type === FinancialMovementType.CREDIT;

      if (movementDate < rangeStart) {
        openingBalance = this.roundMoney(openingBalance + (isCredit ? amount : -amount));
        continue;
      }

      const key = this.dateKey(movementDate);
      if (isCredit) {
        incomingMap.set(key, this.roundMoney((incomingMap.get(key) ?? 0) + amount));
      } else {
        outgoingMap.set(key, this.roundMoney((outgoingMap.get(key) ?? 0) + amount));
      }
    }

    const days: Array<{ date: string; incoming: number; outgoing: number; net: number; projected_balance: number }> = [];
    let cursor = fromDate;
    let runningBalance = this.roundMoney(openingBalance);

    while (cursor <= toDate) {
      const key = this.dateKey(cursor);
      const incoming = this.roundMoney(incomingMap.get(key) ?? 0);
      const outgoing = this.roundMoney(outgoingMap.get(key) ?? 0);
      const net = this.roundMoney(incoming - outgoing);
      runningBalance = this.roundMoney(runningBalance + net);
      days.push({ date: key, incoming, outgoing, net, projected_balance: runningBalance });
      cursor = this.addDays(cursor, 1);
    }

    const totalIncoming = this.roundMoney(days.reduce((acc, day) => acc + day.incoming, 0));
    const totalOutgoing = this.roundMoney(days.reduce((acc, day) => acc + day.outgoing, 0));
    return {
      from: this.dateKey(fromDate),
      to: this.dateKey(toDate),
      opening_balance: this.roundMoney(openingBalance),
      closing_balance: runningBalance,
      total_incoming: totalIncoming,
      total_outgoing: totalOutgoing,
      net_total: this.roundMoney(totalIncoming - totalOutgoing),
      days,
    };
  }

  async listImportJobs(user: AuthUser, query: { status?: string; bank_account_id?: string }) {
    const rows = await this.db.financial_import_jobs.findMany({
      where: {
        tenant_id: user.tenant_id,
        ...(query.status ? { status: query.status as any } : {}),
        ...(query.bank_account_id ? { bank_account_id: query.bank_account_id } : {}),
      },
      include: {
        bank_account: {
          select: { id: true, name: true, bank_name: true, account_number: true },
        },
      },
      orderBy: [{ uploaded_at: 'desc' }, { created_at: 'desc' }],
      take: 40,
    });
    return rows;
  }

  async findImportJobById(user: AuthUser, id: string) {
    const job = await this.db.financial_import_jobs.findFirst({
      where: { tenant_id: user.tenant_id, id },
      include: {
        bank_account: {
          select: { id: true, name: true, bank_name: true, account_number: true },
        },
        lines: {
          orderBy: [{ line_number: 'asc' }],
          include: {
            category: { select: { id: true, code: true, name: true } },
            cost_center: { select: { id: true, code: true, name: true } },
            company: { select: { id: true, company_name: true, company_number: true } },
          },
        },
      },
    });
    if (!job) throw new NotFoundException('Financial import not found');

    const lines = await this.hydrateImportLines(user, job.lines as any[]);
    return {
      ...job,
      lines,
      metrics: this.computeImportJobMetrics(lines),
    };
  }

  async uploadImportJob(user: AuthUser, dto: UploadFinancialImportDto, file?: any) {
    if (!file?.buffer?.length) {
      throw new BadRequestException('Import file is required');
    }
    if (!dto.bank_account_id) {
      throw new BadRequestException('bank_account_id is required for bank statement import');
    }

    const bankAccount = await this.db.financial_bank_accounts.findFirst({
      where: { tenant_id: user.tenant_id, id: dto.bank_account_id },
      select: {
        id: true,
        name: true,
        currency_id: true,
        currency: { select: { code: true } },
      },
    });
    if (!bankAccount) throw new NotFoundException('Bank account not found');

    const sourceType = this.detectImportSourceType(dto.source_type, file.originalname, file.mimetype);
    const parsed = await this.parseImportFile(sourceType, file);
    if (!parsed.lines.length) {
      throw new BadRequestException('No transactions were extracted from the imported file');
    }

    const suggestions = await this.suggestImportLines(user, bankAccount as any, parsed.lines);
    const now = new Date();

    const created = await this.prisma.transaction(async (tx) => {
      const job = await tx.financial_import_jobs.create({
        data: {
          tenant_id: user.tenant_id,
          bank_account_id: dto.bank_account_id,
          source_type: sourceType,
          source_name: file.originalname || `import.${sourceType.toLowerCase()}`,
          mime_type: file.mimetype || null,
          file_size: file.size || file.buffer.length,
          status: FinancialImportJobStatus.REVIEW,
          parsed_summary: parsed.summary as any,
          parser_warnings: parsed.warnings as any,
          ai_summary: this.buildAiSummary(suggestions) as any,
          lines_total: parsed.lines.length,
          lines_reviewed: suggestions.filter((item) => item.suggestion_status !== FinancialImportSuggestionStatus.SUGGESTED).length,
          lines_applied: 0,
          lines_ignored: suggestions.filter((item) => item.suggestion_kind === FinancialImportSuggestionKind.IGNORE).length,
          uploaded_by: user.id,
          uploaded_at: now,
          analyzed_at: now,
        },
      });

      for (let index = 0; index < parsed.lines.length; index += 1) {
        const line = parsed.lines[index];
        const suggestion = suggestions[index];
        await tx.financial_import_lines.create({
          data: {
            tenant_id: user.tenant_id,
            import_job_id: job.id,
            line_number: line.line_number,
            external_id: line.external_id || null,
            transaction_date: line.transaction_date || null,
            movement_type: line.movement_type || null,
            amount: this.decimal(line.amount, '0'),
            balance_after: line.balance_after != null ? this.decimal(line.balance_after, '0') : null,
            currency_code: line.currency_code || null,
            description: line.description || null,
            counterparty_name: line.counterparty_name || null,
            document_number: line.document_number || null,
            source_payload: (line.source_payload || null) as any,
            raw_text: line.raw_text || null,
            normalized_text: this.normalizeSearchText(
              [line.description, line.counterparty_name, line.document_number].filter(Boolean).join(' '),
            ),
            suggestion_kind: suggestion.suggestion_kind,
            suggestion_status: suggestion.suggestion_status,
            confidence_score: this.decimal(suggestion.confidence_score, '0'),
            rule_code: suggestion.rule_code || null,
            ai_reasoning: suggestion.ai_reasoning || null,
            approved_action: (suggestion.approved_action || null) as any,
            suggested_category_id: suggestion.suggested_category_id || null,
            suggested_cost_center_id: suggestion.suggested_cost_center_id || null,
            suggested_company_id: suggestion.suggested_company_id || null,
            matched_receivable_id: suggestion.matched_receivable_id || null,
            matched_payable_id: suggestion.matched_payable_id || null,
          },
        });
      }

      return job;
    });

    return this.findImportJobById(user, created.id);
  }

  async reanalyzeImportJob(user: AuthUser, id: string) {
    const job = await this.db.financial_import_jobs.findFirst({
      where: { tenant_id: user.tenant_id, id },
      include: {
        bank_account: {
          select: { id: true, name: true, currency_id: true, currency: { select: { code: true } } },
        },
        lines: { orderBy: [{ line_number: 'asc' }] },
      },
    });
    if (!job) throw new NotFoundException('Financial import not found');
    if (!job.bank_account) {
      throw new BadRequestException('Bank account not linked to this import');
    }

    const parsedLines: FinanceImportParseLine[] = (job.lines || []).map((line: any) => ({
      line_number: Number(line.line_number || 0),
      external_id: line.external_id || null,
      transaction_date: this.toDateOnly(line.transaction_date) ?? null,
      movement_type: line.movement_type || null,
      amount: String(line.amount || '0'),
      balance_after: line.balance_after != null ? String(line.balance_after) : null,
      currency_code: line.currency_code || null,
      description: line.description || null,
      counterparty_name: line.counterparty_name || null,
      document_number: line.document_number || null,
      raw_text: line.raw_text || null,
      source_payload: (line.source_payload || null) as any,
    }));

    const suggestions = await this.suggestImportLines(user, job.bank_account as any, parsedLines);
    await this.prisma.transaction(async (tx) => {
      for (let index = 0; index < job.lines.length; index += 1) {
        const line = job.lines[index] as any;
        const suggestion = suggestions[index];
        await tx.financial_import_lines.updateMany({
          where: { tenant_id: user.tenant_id, id: line.id, import_job_id: id, applied_at: null },
          data: {
            suggestion_kind: suggestion.suggestion_kind,
            suggestion_status: suggestion.suggestion_status,
            confidence_score: this.decimal(suggestion.confidence_score, '0'),
            rule_code: suggestion.rule_code || null,
            ai_reasoning: suggestion.ai_reasoning || null,
            approved_action: (suggestion.approved_action || null) as any,
            suggested_category_id: suggestion.suggested_category_id || null,
            suggested_cost_center_id: suggestion.suggested_cost_center_id || null,
            suggested_company_id: suggestion.suggested_company_id || null,
            matched_receivable_id: suggestion.matched_receivable_id || null,
            matched_payable_id: suggestion.matched_payable_id || null,
            updated_at: new Date(),
          },
        });
      }

      await tx.financial_import_jobs.updateMany({
        where: { tenant_id: user.tenant_id, id },
        data: {
          ai_summary: this.buildAiSummary(suggestions) as any,
          lines_reviewed: suggestions.filter((item) => item.suggestion_status !== FinancialImportSuggestionStatus.SUGGESTED).length,
          lines_ignored: suggestions.filter((item) => item.suggestion_kind === FinancialImportSuggestionKind.IGNORE).length,
          analyzed_at: new Date(),
          updated_at: new Date(),
        },
      });
    });

    return this.findImportJobById(user, id);
  }

  async reviewImportLine(user: AuthUser, importJobId: string, lineId: string, dto: ReviewFinancialImportLineDto) {
    const line = await this.db.financial_import_lines.findFirst({
      where: { tenant_id: user.tenant_id, import_job_id: importJobId, id: lineId },
    });
    if (!line) throw new NotFoundException('Financial import line not found');

    await this.db.financial_import_lines.updateMany({
      where: { tenant_id: user.tenant_id, import_job_id: importJobId, id: lineId },
      data: {
        ...(dto.suggestion_kind !== undefined ? { suggestion_kind: dto.suggestion_kind } : {}),
        ...(dto.suggestion_status !== undefined ? { suggestion_status: dto.suggestion_status } : {}),
        ...(dto.suggested_category_id !== undefined ? { suggested_category_id: dto.suggested_category_id ?? null } : {}),
        ...(dto.suggested_cost_center_id !== undefined ? { suggested_cost_center_id: dto.suggested_cost_center_id ?? null } : {}),
        ...(dto.suggested_company_id !== undefined ? { suggested_company_id: dto.suggested_company_id ?? null } : {}),
        ...(dto.matched_receivable_id !== undefined ? { matched_receivable_id: dto.matched_receivable_id ?? null } : {}),
        ...(dto.matched_payable_id !== undefined ? { matched_payable_id: dto.matched_payable_id ?? null } : {}),
        ...(dto.review_note !== undefined ? { review_note: dto.review_note?.trim() || null } : {}),
        updated_at: new Date(),
      },
    });

    const updated = await this.db.financial_import_lines.findFirst({
      where: { tenant_id: user.tenant_id, import_job_id: importJobId, id: lineId },
    });
    if (!updated) throw new NotFoundException('Financial import line not found');

    const job = await this.db.financial_import_jobs.findFirst({
      where: { tenant_id: user.tenant_id, id: importJobId },
      include: {
        bank_account: {
          select: { id: true, name: true, currency_id: true, currency: { select: { code: true } } },
        },
      },
    });
    if (!job?.bank_account) throw new BadRequestException('Bank account not linked to this import');

    const approvedAction = this.buildApprovedAction(job.bank_account as any, updated as any);
    await this.db.financial_import_lines.updateMany({
      where: { tenant_id: user.tenant_id, import_job_id: importJobId, id: lineId },
      data: {
        approved_action: approvedAction as any,
        updated_at: new Date(),
      },
    });

    await this.recalculateImportJobCounters(user.tenant_id, importJobId);
    return this.findImportJobById(user, importJobId);
  }

  async applyImportJob(user: AuthUser, id: string, dto: ApplyFinancialImportDto) {
    const job = await this.db.financial_import_jobs.findFirst({
      where: { tenant_id: user.tenant_id, id },
      include: {
        bank_account: {
          select: { id: true, name: true, currency_id: true, currency: { select: { code: true } } },
        },
        lines: {
          where: {
            ...(Array.isArray(dto.line_ids) && dto.line_ids.length ? { id: { in: dto.line_ids } } : {}),
            ...(dto.apply_approved_only ?? true
              ? { suggestion_status: { in: [FinancialImportSuggestionStatus.APPROVED] } }
              : { suggestion_status: { in: [FinancialImportSuggestionStatus.APPROVED, FinancialImportSuggestionStatus.SUGGESTED] } }),
          },
          orderBy: [{ line_number: 'asc' }],
        },
      },
    });
    if (!job) throw new NotFoundException('Financial import not found');
    if (!job.bank_account) throw new BadRequestException('Bank account not linked to this import');
    if (!job.lines.length) throw new BadRequestException('No eligible import lines to apply');

    const result = await this.prisma.transaction(async (tx) => {
      const applied: any[] = [];
      const errors: Array<{ line_id: string; message: string }> = [];
      const touchedAccounts = new Set<string>();

      for (const line of job.lines as any[]) {
        try {
          const action = (line.approved_action || this.buildApprovedAction(job.bank_account as any, line)) as any;
          const outcome: any = await this.applyImportLineAction(tx, user, job.bank_account as any, line, action);
          await tx.financial_import_lines.updateMany({
            where: { tenant_id: user.tenant_id, id: line.id, import_job_id: id },
            data: {
              suggestion_status:
                line.suggestion_kind === FinancialImportSuggestionKind.IGNORE
                  ? FinancialImportSuggestionStatus.IGNORED
                  : FinancialImportSuggestionStatus.APPLIED,
              generated_bank_movement_id: outcome.generated_bank_movement_id || null,
              generated_receivable_id: outcome.generated_receivable_id || null,
              generated_payable_id: outcome.generated_payable_id || null,
              generated_receivable_payment_id: outcome.generated_receivable_payment_id || null,
              generated_payable_payment_id: outcome.generated_payable_payment_id || null,
              applied_at: new Date(),
              updated_at: new Date(),
              approved_action: action as any,
            },
          });
          if (outcome.touched_bank_account_id) touchedAccounts.add(String(outcome.touched_bank_account_id));
          applied.push({ line_id: line.id, ...outcome });
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Failed to apply imported line';
          errors.push({ line_id: line.id, message });
          await tx.financial_import_lines.updateMany({
            where: { tenant_id: user.tenant_id, id: line.id, import_job_id: id },
            data: {
              suggestion_status: FinancialImportSuggestionStatus.ERROR,
              review_note: message,
              updated_at: new Date(),
            },
          });
        }
      }

      for (const accountId of touchedAccounts) {
        await this.refreshBankAccountBalance(tx, user.tenant_id, accountId);
      }

      const counters = await this.collectImportJobCountersTx(tx, user.tenant_id, id);
      await tx.financial_import_jobs.updateMany({
        where: { tenant_id: user.tenant_id, id },
        data: {
          lines_reviewed: counters.lines_reviewed,
          lines_applied: counters.lines_applied,
          lines_ignored: counters.lines_ignored,
          applied_by: user.id,
          applied_at: applied.length ? new Date() : null,
          status:
            counters.pending > 0 || errors.length > 0
              ? FinancialImportJobStatus.REVIEW
              : FinancialImportJobStatus.APPLIED,
          updated_at: new Date(),
        },
      });

      return {
        applied,
        errors,
      };
    });

    const refreshed = await this.findImportJobById(user, id);
    return { ...result, job: refreshed };
  }

  private async hydrateImportLines(user: AuthUser, lines: any[]) {
    const receivableIds = new Set<string>();
    const payableIds = new Set<string>();
    const movementIds = new Set<string>();

    lines.forEach((line) => {
      if (line.matched_receivable_id) receivableIds.add(String(line.matched_receivable_id));
      if (line.generated_receivable_id) receivableIds.add(String(line.generated_receivable_id));
      if (line.matched_payable_id) payableIds.add(String(line.matched_payable_id));
      if (line.generated_payable_id) payableIds.add(String(line.generated_payable_id));
      if (line.generated_bank_movement_id) movementIds.add(String(line.generated_bank_movement_id));
    });

    const [receivables, payables, movements] = await Promise.all([
      receivableIds.size
        ? this.db.financial_receivables.findMany({
            where: { tenant_id: user.tenant_id, id: { in: Array.from(receivableIds) } },
            select: {
              id: true,
              title_number: true,
              due_date: true,
              outstanding_amount: true,
              company: { select: { id: true, company_name: true } },
            },
          })
        : Promise.resolve([]),
      payableIds.size
        ? this.db.financial_payables.findMany({
            where: { tenant_id: user.tenant_id, id: { in: Array.from(payableIds) } },
            select: {
              id: true,
              payable_number: true,
              due_date: true,
              outstanding_amount: true,
              company: { select: { id: true, company_name: true } },
            },
          })
        : Promise.resolve([]),
      movementIds.size
        ? this.db.financial_bank_movements.findMany({
            where: { tenant_id: user.tenant_id, id: { in: Array.from(movementIds) } },
            select: {
              id: true,
              movement_date: true,
              movement_type: true,
              amount: true,
              description: true,
            },
          })
        : Promise.resolve([]),
    ]);

    const receivableMap = new Map<string, any>(receivables.map((item) => [String(item.id), item] as [string, any]));
    const payableMap = new Map<string, any>(payables.map((item) => [String(item.id), item] as [string, any]));
    const movementMap = new Map<string, any>(movements.map((item) => [String(item.id), item] as [string, any]));

    return lines.map((line) => ({
      ...line,
      matched_receivable: line.matched_receivable_id ? receivableMap.get(String(line.matched_receivable_id)) || null : null,
      generated_receivable: line.generated_receivable_id ? receivableMap.get(String(line.generated_receivable_id)) || null : null,
      matched_payable: line.matched_payable_id ? payableMap.get(String(line.matched_payable_id)) || null : null,
      generated_payable: line.generated_payable_id ? payableMap.get(String(line.generated_payable_id)) || null : null,
      generated_bank_movement: line.generated_bank_movement_id
        ? movementMap.get(String(line.generated_bank_movement_id)) || null
        : null,
    }));
  }

  private computeImportJobMetrics(lines: any[]) {
    const metrics = {
      total: lines.length,
      credits: 0,
      debits: 0,
      credit_amount: 0,
      debit_amount: 0,
      approved: 0,
      suggested: 0,
      applied: 0,
      ignored: 0,
      errors: 0,
    };
    lines.forEach((line) => {
      const amount = Number(line.amount || 0);
      if (line.movement_type === FinancialMovementType.CREDIT) {
        metrics.credits += 1;
        metrics.credit_amount = this.roundMoney(metrics.credit_amount + amount);
      } else {
        metrics.debits += 1;
        metrics.debit_amount = this.roundMoney(metrics.debit_amount + amount);
      }

      if (line.suggestion_status === FinancialImportSuggestionStatus.APPROVED) metrics.approved += 1;
      else if (line.suggestion_status === FinancialImportSuggestionStatus.APPLIED) metrics.applied += 1;
      else if (line.suggestion_status === FinancialImportSuggestionStatus.IGNORED) metrics.ignored += 1;
      else if (line.suggestion_status === FinancialImportSuggestionStatus.ERROR) metrics.errors += 1;
      else metrics.suggested += 1;
    });
    return metrics;
  }

  private detectImportSourceType(
    explicitType: FinancialImportSourceType | undefined,
    fileName: string | undefined,
    mimeType: string | undefined,
  ) {
    if (explicitType) return explicitType;
    const normalizedName = String(fileName || '').trim().toLowerCase();
    const normalizedMime = String(mimeType || '').trim().toLowerCase();
    if (normalizedName.endsWith('.ofx') || normalizedMime.includes('ofx')) return FinancialImportSourceType.OFX;
    if (normalizedName.endsWith('.csv') || normalizedMime.includes('csv') || normalizedMime.includes('excel')) {
      return FinancialImportSourceType.CSV;
    }
    if (normalizedName.endsWith('.pdf') || normalizedMime.includes('pdf')) return FinancialImportSourceType.PDF;
    throw new BadRequestException('Unsupported import file type. Use OFX, CSV or PDF');
  }

  private async parseImportFile(sourceType: FinancialImportSourceType, file: any) {
    if (sourceType === FinancialImportSourceType.OFX) return this.parseOfxFile(file.buffer);
    if (sourceType === FinancialImportSourceType.CSV) return this.parseCsvFile(file.buffer);
    return this.parsePdfFile(file.buffer, file.originalname || 'statement.pdf', file.mimetype || 'application/pdf');
  }

  private async parsePdfFile(buffer: Buffer, fileName: string, mimeType: string) {
    if (!this.openAiClient) {
      throw new BadRequestException('PDF import requires OPENAI_API_KEY configured in the backend');
    }

    const prompt = [
      'Extraia as transacoes bancarias do PDF e devolva somente JSON puro.',
      'Formato esperado:',
      '{"summary":{"account_holder":null,"period_start":null,"period_end":null},"warnings":[],"lines":[{"line_number":1,"transaction_date":"YYYY-MM-DD","movement_type":"CREDIT|DEBIT","amount":"0.00","balance_after":"0.00","description":"...","counterparty_name":null,"document_number":null,"raw_text":"trecho original"}]}',
      'Regras:',
      '- amount deve ser positivo.',
      '- movement_type indica se foi entrada ou saida.',
      '- Se nao houver valor de saldo, use null em balance_after.',
      '- Se nao tiver certeza absoluta, inclua o ponto em warnings.',
      '- Nunca retorne markdown.',
    ].join('\n');

    const response = await this.openAiClient.responses.create({
      model: this.openAiModel,
      input: [
        {
          role: 'system',
          content: prompt,
        },
        {
          role: 'user',
          content: [
            { type: 'input_text', text: 'Leia este extrato bancario PDF e normalize as linhas.' },
            {
              type: 'input_file',
              filename: fileName,
              file_data: `data:${mimeType};base64,${buffer.toString('base64')}`,
            },
          ],
        },
      ],
    } as any);

    const text = this.extractAiText(response);
    const parsed = this.extractJsonPayload(text);
    const rawLines = Array.isArray(parsed?.lines) ? parsed.lines : [];
    const lines = rawLines
      .map((item: any, idx: number) => this.normalizeImportedLine(item, idx + 1))
      .filter(Boolean) as FinanceImportParseLine[];

    return {
      summary: parsed?.summary || this.buildParsedSummary(lines),
      warnings: Array.isArray(parsed?.warnings) ? parsed.warnings.map((item: any) => String(item || '').trim()).filter(Boolean) : [],
      lines,
    };
  }

  private parseOfxFile(buffer: Buffer) {
    const raw = this.decodeImportBuffer(buffer);
    const lines: FinanceImportParseLine[] = [];
    const blocks = raw.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/gi) || [];

    blocks.forEach((block, index) => {
      const amountRaw = this.extractOfxTag(block, 'TRNAMT');
      const amountValue = this.parseFlexibleNumber(amountRaw);
      if (amountValue == null || Math.abs(amountValue) < 0.00001) return;

      const movement_type =
        amountValue >= 0 ? FinancialMovementType.CREDIT : FinancialMovementType.DEBIT;
      const description = [this.extractOfxTag(block, 'NAME'), this.extractOfxTag(block, 'MEMO')]
        .filter(Boolean)
        .join(' - ')
        .trim();

      lines.push({
        line_number: index + 1,
        external_id: this.extractOfxTag(block, 'FITID') || null,
        transaction_date: this.parseOfxDate(this.extractOfxTag(block, 'DTPOSTED')),
        movement_type,
        amount: Math.abs(amountValue).toFixed(2),
        description: description || this.extractOfxTag(block, 'TRNTYPE') || null,
        counterparty_name: this.extractOfxTag(block, 'NAME') || null,
        document_number: this.extractOfxTag(block, 'CHECKNUM') || null,
        raw_text: block,
        source_payload: {
          trntype: this.extractOfxTag(block, 'TRNTYPE'),
          memo: this.extractOfxTag(block, 'MEMO'),
        },
      });
    });

    return {
      summary: this.buildParsedSummary(lines),
      warnings: [],
      lines,
    };
  }

  private parseCsvFile(buffer: Buffer) {
    const raw = this.decodeImportBuffer(buffer);
    const rows = raw
      .split(/\r?\n/)
      .map((line) => String(line || '').trim())
      .filter(Boolean);
    if (!rows.length) {
      return { summary: this.buildParsedSummary([]), warnings: ['Arquivo CSV vazio.'], lines: [] };
    }

    const delimiter = this.detectCsvDelimiter(rows.slice(0, 5));
    const header = this.parseCsvRow(rows[0], delimiter);
    const headerMap = header.map((item) => this.normalizeSearchText(item));

    const dateIdx = this.findHeaderIndex(headerMap, ['data', 'date', 'posted', 'transactiondate']);
    const descIdx = this.findHeaderIndex(headerMap, ['descricao', 'description', 'historico', 'memo', 'details']);
    const amountIdx = this.findHeaderIndex(headerMap, ['valor', 'amount', 'importe', 'valororiginal']);
    const creditIdx = this.findHeaderIndex(headerMap, ['credito', 'credit', 'entrada', 'deposito']);
    const debitIdx = this.findHeaderIndex(headerMap, ['debito', 'debit', 'saida', 'withdrawal']);
    const balanceIdx = this.findHeaderIndex(headerMap, ['saldo', 'balance']);
    const counterpartyIdx = this.findHeaderIndex(headerMap, ['empresa', 'cliente', 'favorecido', 'fornecedor', 'counterparty']);
    const docIdx = this.findHeaderIndex(headerMap, ['documento', 'document', 'numero', 'reference', 'referencia']);

    const lines: FinanceImportParseLine[] = [];
    rows.slice(1).forEach((row, index) => {
      const cols = this.parseCsvRow(row, delimiter);
      if (!cols.some((item) => String(item || '').trim())) return;

      const credit = creditIdx >= 0 ? this.parseFlexibleNumber(cols[creditIdx]) : null;
      const debit = debitIdx >= 0 ? this.parseFlexibleNumber(cols[debitIdx]) : null;
      const amountValue = amountIdx >= 0 ? this.parseFlexibleNumber(cols[amountIdx]) : null;

      let movement_type: FinancialMovementType | null = null;
      let amount = 0;
      if (credit != null && Math.abs(credit) > 0.00001) {
        movement_type = FinancialMovementType.CREDIT;
        amount = Math.abs(credit);
      } else if (debit != null && Math.abs(debit) > 0.00001) {
        movement_type = FinancialMovementType.DEBIT;
        amount = Math.abs(debit);
      } else if (amountValue != null && Math.abs(amountValue) > 0.00001) {
        movement_type = amountValue >= 0 ? FinancialMovementType.CREDIT : FinancialMovementType.DEBIT;
        amount = Math.abs(amountValue);
      }
      if (!movement_type || amount <= 0) return;

      lines.push({
        line_number: index + 1,
        transaction_date: this.parseImportedDate(dateIdx >= 0 ? cols[dateIdx] : ''),
        movement_type,
        amount: amount.toFixed(2),
        balance_after:
          balanceIdx >= 0 && this.parseFlexibleNumber(cols[balanceIdx]) != null
            ? Number(this.parseFlexibleNumber(cols[balanceIdx])).toFixed(2)
            : null,
        description: descIdx >= 0 ? String(cols[descIdx] || '').trim() || null : null,
        counterparty_name: counterpartyIdx >= 0 ? String(cols[counterpartyIdx] || '').trim() || null : null,
        document_number: docIdx >= 0 ? String(cols[docIdx] || '').trim() || null : null,
        raw_text: row,
        source_payload: Object.fromEntries(header.map((key, idxCol) => [key, cols[idxCol] ?? null])),
      });
    });

    return {
      summary: this.buildParsedSummary(lines),
      warnings: [],
      lines,
    };
  }

  private async suggestImportLines(user: AuthUser, bankAccount: any, lines: FinanceImportParseLine[]) {
    const context = await this.loadImportSuggestionContext(user, lines);
    const drafts = lines.map((line) => this.buildHeuristicImportSuggestion(context, line));
    const aiHints = await this.requestAiImportHints(context, lines, drafts).catch((error) => {
      this.logger.warn(`Finance import AI hints failed: ${error instanceof Error ? error.message : 'unknown error'}`);
      return new Map<number, any>();
    });

    return drafts.map((draft, index) => {
      const line = lines[index];
      const hint = aiHints.get(line.line_number);
      const merged = this.mergeImportSuggestionDraft(context, line, draft, hint);
      const confidence = this.roundMoney(Number(merged.confidence_score || 0));
      const status =
        merged.suggestion_kind === FinancialImportSuggestionKind.IGNORE
          ? FinancialImportSuggestionStatus.APPROVED
          : confidence >= 90 ||
            merged.suggestion_kind === FinancialImportSuggestionKind.MATCH_RECEIVABLE_PAYMENT ||
            merged.suggestion_kind === FinancialImportSuggestionKind.MATCH_PAYABLE_PAYMENT
          ? FinancialImportSuggestionStatus.APPROVED
          : FinancialImportSuggestionStatus.SUGGESTED;

      return {
        ...merged,
        suggestion_status: status,
        approved_action: this.buildApprovedAction(bankAccount, {
          ...line,
          ...merged,
          suggestion_status: status,
        }),
      };
    });
  }

  private async loadImportSuggestionContext(user: AuthUser, lines: FinanceImportParseLine[]) {
    const amounts = lines.map((line) => Math.abs(Number(line.amount || 0))).filter((value) => value > 0);
    const minAmount = amounts.length ? Math.max(0, Math.min(...amounts) - 5) : 0;
    const maxAmount = amounts.length ? Math.max(...amounts) + 5 : 999999999;
    const dateValues = lines
      .map((line) => this.toDateOnly(line.transaction_date))
      .filter(Boolean) as Date[];
    const sorted = dateValues.slice().sort((a, b) => a.getTime() - b.getTime());
    const fromDate = sorted[0] ? this.addDays(sorted[0], -120) : this.addDays(this.todayDateOnly(), -120);
    const toDate = sorted[sorted.length - 1]
      ? this.addDays(sorted[sorted.length - 1], 120)
      : this.addDays(this.todayDateOnly(), 120);

    const [categories, costCenters, companies, receivables, payables] = await Promise.all([
      this.db.financial_categories.findMany({
        where: { tenant_id: user.tenant_id, is_active: true },
        select: { id: true, code: true, name: true, kind: true, cost_center_id: true },
        orderBy: [{ code: 'asc' }],
      }),
      this.db.financial_cost_centers.findMany({
        where: { tenant_id: user.tenant_id, is_active: true },
        select: { id: true, code: true, name: true },
        orderBy: [{ code: 'asc' }],
      }),
      this.db.companies.findMany({
        where: { tenant_id: user.tenant_id },
        select: { id: true, company_name: true, company_number: true },
        orderBy: [{ company_name: 'asc' }],
        take: 400,
      }),
      this.db.financial_receivables.findMany({
        where: {
          tenant_id: user.tenant_id,
          status: { not: FinancialEntryStatus.CANCELED },
          outstanding_amount: {
            gt: this.decimal('0'),
            gte: this.decimal(String(minAmount || 0), '0'),
            lte: this.decimal(String(maxAmount || 0), '0'),
          },
          due_date: { gte: fromDate, lte: toDate },
        },
        select: {
          id: true,
          title_number: true,
          description: true,
          due_date: true,
          outstanding_amount: true,
          company_id: true,
          category_id: true,
          cost_center_id: true,
          company: { select: { id: true, company_name: true, company_number: true } },
        },
        take: 500,
      }),
      this.db.financial_payables.findMany({
        where: {
          tenant_id: user.tenant_id,
          status: { not: FinancialEntryStatus.CANCELED },
          outstanding_amount: {
            gt: this.decimal('0'),
            gte: this.decimal(String(minAmount || 0), '0'),
            lte: this.decimal(String(maxAmount || 0), '0'),
          },
          due_date: { gte: fromDate, lte: toDate },
        },
        select: {
          id: true,
          payable_number: true,
          description: true,
          due_date: true,
          outstanding_amount: true,
          company_id: true,
          category_id: true,
          cost_center_id: true,
          company: { select: { id: true, company_name: true, company_number: true } },
        },
        take: 500,
      }),
    ]);

    return { categories, costCenters, companies, receivables, payables };
  }

  private buildHeuristicImportSuggestion(context: any, line: FinanceImportParseLine): FinanceImportSuggestionDraft {
    const normalizedText = this.normalizeSearchText(
      [line.description, line.counterparty_name, line.document_number].filter(Boolean).join(' '),
    );
    const amount = Math.abs(Number(line.amount || 0));
    const company = this.findBestCompanyMatch(context.companies, normalizedText);
    const category = this.findBestCategoryMatch(context.categories, normalizedText, line.movement_type);
    const costCenterId = category?.cost_center_id || null;

    if (amount <= 0.00001 || !line.movement_type) {
      return {
        suggestion_kind: FinancialImportSuggestionKind.IGNORE,
        suggestion_status: FinancialImportSuggestionStatus.APPROVED,
        confidence_score: '99',
        rule_code: 'EMPTY_LINE',
        ai_reasoning: 'Linha sem valor financeiro relevante.',
      };
    }

    if (this.looksLikeTransferText(normalizedText)) {
      return {
        suggestion_kind: FinancialImportSuggestionKind.TRANSFER,
        suggestion_status: FinancialImportSuggestionStatus.APPROVED,
        confidence_score: '93',
        rule_code: 'TRANSFER_KEYWORD',
        ai_reasoning: 'Descricao com padrao forte de transferencia entre contas.',
        suggested_category_id: category?.id || null,
        suggested_cost_center_id: costCenterId,
        suggested_company_id: company?.id || null,
      };
    }

    if (line.movement_type === FinancialMovementType.CREDIT) {
      const receivableMatch = this.findBestReceivableMatch(context.receivables, normalizedText, amount);
      if (receivableMatch && receivableMatch.score >= 86) {
        return {
          suggestion_kind: FinancialImportSuggestionKind.MATCH_RECEIVABLE_PAYMENT,
          suggestion_status: FinancialImportSuggestionStatus.APPROVED,
          confidence_score: String(receivableMatch.score),
          rule_code: 'RECEIVABLE_MATCH',
          ai_reasoning: `Titulo em aberto compativel por valor e descricao: ${receivableMatch.item.title_number}.`,
          suggested_category_id: receivableMatch.item.category_id || category?.id || null,
          suggested_cost_center_id: receivableMatch.item.cost_center_id || costCenterId,
          suggested_company_id: receivableMatch.item.company_id || company?.id || null,
          matched_receivable_id: receivableMatch.item.id,
        };
      }

      if (company) {
        return {
          suggestion_kind: FinancialImportSuggestionKind.CREATE_RECEIVABLE,
          suggestion_status: FinancialImportSuggestionStatus.SUGGESTED,
          confidence_score: this.looksLikeInvoiceText(normalizedText) ? '84' : '74',
          rule_code: this.looksLikeInvoiceText(normalizedText) ? 'RECEIVABLE_PATTERN' : 'KNOWN_COMPANY_CREDIT',
          ai_reasoning: `Entrada vinculada a empresa conhecida: ${company.company_name}.`,
          suggested_category_id: category?.id || null,
          suggested_cost_center_id: costCenterId,
          suggested_company_id: company.id,
        };
      }

      return {
        suggestion_kind: FinancialImportSuggestionKind.CREATE_MOVEMENT,
        suggestion_status: FinancialImportSuggestionStatus.SUGGESTED,
        confidence_score: category ? '76' : '64',
        rule_code: 'BANK_CREDIT_FALLBACK',
        ai_reasoning: 'Entrada sem titulo aberto identificado. Melhor iniciar como movimento bancario.',
        suggested_category_id: category?.id || null,
        suggested_cost_center_id: costCenterId,
      };
    }

    const payableMatch = this.findBestPayableMatch(context.payables, normalizedText, amount);
    if (payableMatch && payableMatch.score >= 86) {
      return {
        suggestion_kind: FinancialImportSuggestionKind.MATCH_PAYABLE_PAYMENT,
        suggestion_status: FinancialImportSuggestionStatus.APPROVED,
        confidence_score: String(payableMatch.score),
        rule_code: 'PAYABLE_MATCH',
        ai_reasoning: `Conta a pagar em aberto compativel por valor e descricao: ${payableMatch.item.payable_number}.`,
        suggested_category_id: payableMatch.item.category_id || category?.id || null,
        suggested_cost_center_id: payableMatch.item.cost_center_id || costCenterId,
        suggested_company_id: payableMatch.item.company_id || company?.id || null,
        matched_payable_id: payableMatch.item.id,
      };
    }

    if (this.looksLikeTaxText(normalizedText) || this.looksLikeRecurringExpenseText(normalizedText)) {
      return {
        suggestion_kind: FinancialImportSuggestionKind.CREATE_PAYABLE,
        suggestion_status: FinancialImportSuggestionStatus.SUGGESTED,
        confidence_score: this.looksLikeTaxText(normalizedText) ? '89' : '81',
        rule_code: this.looksLikeTaxText(normalizedText) ? 'TAX_PATTERN' : 'RECURRING_EXPENSE_PATTERN',
        ai_reasoning: 'Saida com padrao de despesa operacional ou tributo.',
        suggested_category_id: category?.id || null,
        suggested_cost_center_id: costCenterId,
        suggested_company_id: company?.id || null,
      };
    }

    return {
      suggestion_kind: FinancialImportSuggestionKind.CREATE_MOVEMENT,
      suggestion_status: FinancialImportSuggestionStatus.SUGGESTED,
      confidence_score: category ? '75' : '62',
      rule_code: 'BANK_DEBIT_FALLBACK',
      ai_reasoning: 'Saida sem titulo aberto compativel. Melhor iniciar como movimento bancario.',
      suggested_category_id: category?.id || null,
      suggested_cost_center_id: costCenterId,
      suggested_company_id: company?.id || null,
    };
  }

  private async requestAiImportHints(context: any, lines: FinanceImportParseLine[], drafts: FinanceImportSuggestionDraft[]) {
    const hints = new Map<number, any>();
    if (!this.openAiClient) return hints;

    const candidates = lines
      .map((line, index) => ({ line, draft: drafts[index] }))
      .filter((item) => Number(item.draft.confidence_score || 0) < 92)
      .slice(0, 60);
    if (!candidates.length) return hints;

    const response = await this.openAiClient.responses.create({
      model: this.openAiModel,
      input: [
        {
          role: 'system',
          content: [
            'Voce revisa conciliacao financeira de ERP e responde somente JSON puro.',
            'Recebera linhas normalizadas de extrato, a sugestao heuristica atual e catalogos do tenant.',
            'Objetivo: apenas melhorar o tipo de acao, categoria, centro de custo e empresa quando houver evidencias.',
            'Retorne um array JSON com itens no formato:',
            '[{"line_number":1,"suggestion_kind":"CREATE_MOVEMENT|MATCH_RECEIVABLE_PAYMENT|MATCH_PAYABLE_PAYMENT|CREATE_RECEIVABLE|CREATE_PAYABLE|TRANSFER|IGNORE","confidence_score":0,"category_name":null,"cost_center_name":null,"company_name":null,"reasoning":"..."}]',
            'Nao invente nomes fora do catalogo enviado.',
          ].join('\n'),
        },
        {
          role: 'user',
          content: JSON.stringify({
            categories: context.categories.map((item: any) => ({ name: item.name, code: item.code })),
            costCenters: context.costCenters.map((item: any) => ({ name: item.name, code: item.code })),
            companies: context.companies.slice(0, 150).map((item: any) => ({ company_name: item.company_name })),
            lines: candidates.map((item) => ({
              line_number: item.line.line_number,
              movement_type: item.line.movement_type,
              amount: item.line.amount,
              description: item.line.description,
              counterparty_name: item.line.counterparty_name,
              document_number: item.line.document_number,
              heuristic: {
                suggestion_kind: item.draft.suggestion_kind,
                confidence_score: item.draft.confidence_score,
                reasoning: item.draft.ai_reasoning,
              },
            })),
          }),
        },
      ],
    } as any);

    const parsed = this.extractJsonPayload(this.extractAiText(response));
    const arr = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.items) ? parsed.items : [];
    arr.forEach((item: any) => {
      const lineNumber = Number(item?.line_number || 0);
      if (!lineNumber) return;
      hints.set(lineNumber, item);
    });
    return hints;
  }

  private mergeImportSuggestionDraft(context: any, line: FinanceImportParseLine, draft: FinanceImportSuggestionDraft, hint: any) {
    if (!hint || !hint.suggestion_kind) return draft;
    if (
      draft.suggestion_kind === FinancialImportSuggestionKind.MATCH_RECEIVABLE_PAYMENT ||
      draft.suggestion_kind === FinancialImportSuggestionKind.MATCH_PAYABLE_PAYMENT
    ) {
      return draft;
    }

    const aiConfidence = this.roundMoney(Number(hint.confidence_score || 0));
    const draftConfidence = this.roundMoney(Number(draft.confidence_score || 0));
    if (aiConfidence < draftConfidence + 4) return draft;

    const category = this.findNamedRecord(context.categories, hint.category_name, ['name', 'code']);
    const costCenter = this.findNamedRecord(context.costCenters, hint.cost_center_name, ['name', 'code']);
    const company = this.findNamedRecord(context.companies, hint.company_name, ['company_name']);

    return {
      ...draft,
      suggestion_kind: this.parseImportSuggestionKind(hint.suggestion_kind) || draft.suggestion_kind,
      confidence_score: String(aiConfidence),
      ai_reasoning: String(hint.reasoning || draft.ai_reasoning || '').trim() || draft.ai_reasoning,
      suggested_category_id: category?.id || draft.suggested_category_id || null,
      suggested_cost_center_id: costCenter?.id || draft.suggested_cost_center_id || null,
      suggested_company_id: company?.id || draft.suggested_company_id || null,
    };
  }

  private buildAiSummary(suggestions: FinanceImportSuggestionDraft[]) {
    const counts = {
      matched_receivable_payments: 0,
      matched_payable_payments: 0,
      create_receivables: 0,
      create_payables: 0,
      create_movements: 0,
      transfers: 0,
      ignored: 0,
    };
    suggestions.forEach((item) => {
      if (item.suggestion_kind === FinancialImportSuggestionKind.MATCH_RECEIVABLE_PAYMENT) counts.matched_receivable_payments += 1;
      else if (item.suggestion_kind === FinancialImportSuggestionKind.MATCH_PAYABLE_PAYMENT) counts.matched_payable_payments += 1;
      else if (item.suggestion_kind === FinancialImportSuggestionKind.CREATE_RECEIVABLE) counts.create_receivables += 1;
      else if (item.suggestion_kind === FinancialImportSuggestionKind.CREATE_PAYABLE) counts.create_payables += 1;
      else if (item.suggestion_kind === FinancialImportSuggestionKind.TRANSFER) counts.transfers += 1;
      else if (item.suggestion_kind === FinancialImportSuggestionKind.IGNORE) counts.ignored += 1;
      else counts.create_movements += 1;
    });
    return counts;
  }

  private buildApprovedAction(bankAccount: any, line: any) {
    const amount = this.roundMoney(Math.abs(Number(line.amount || 0)));
    const transactionDate = this.dateKey(this.toDateOnly(line.transaction_date) ?? this.todayDateOnly());
    const description = String(line.description || line.raw_text || `Imported transaction ${line.line_number}`).trim();
    const paymentMethod = this.detectPaymentMethod(description);
    const entryGroup = this.inferEntryGroupFromText(description);

    if (line.suggestion_kind === FinancialImportSuggestionKind.IGNORE) {
      return { type: 'IGNORE', payload: { reason: line.review_note || 'Ignored by review' } };
    }

    if (
      line.suggestion_kind === FinancialImportSuggestionKind.MATCH_RECEIVABLE_PAYMENT &&
      line.matched_receivable_id
    ) {
      return {
        type: 'MATCH_RECEIVABLE_PAYMENT',
        payload: {
          receivable_id: line.matched_receivable_id,
          bank_account_id: bankAccount.id,
          payment_date: transactionDate,
          amount: amount.toFixed(2),
          payment_method: paymentMethod,
          reference: line.document_number || null,
          notes: description,
        },
      };
    }

    if (line.suggestion_kind === FinancialImportSuggestionKind.MATCH_PAYABLE_PAYMENT && line.matched_payable_id) {
      return {
        type: 'MATCH_PAYABLE_PAYMENT',
        payload: {
          payable_id: line.matched_payable_id,
          bank_account_id: bankAccount.id,
          payment_date: transactionDate,
          amount: amount.toFixed(2),
          payment_method: paymentMethod,
          reference: line.document_number || null,
          notes: description,
        },
      };
    }

    if (
      line.suggestion_kind === FinancialImportSuggestionKind.CREATE_RECEIVABLE &&
      line.suggested_company_id
    ) {
      return {
        type: 'CREATE_RECEIVABLE_AND_SETTLE',
        payload: {
          bank_account_id: bankAccount.id,
          company_id: line.suggested_company_id,
          currency_id: bankAccount.currency_id,
          due_date: transactionDate,
          issue_date: transactionDate,
          original_amount: amount.toFixed(2),
          description,
          category_id: line.suggested_category_id || null,
          cost_center_id: line.suggested_cost_center_id || null,
          entry_group: entryGroup,
          payment_method: paymentMethod,
          reference: line.document_number || null,
        },
      };
    }

    if (line.suggestion_kind === FinancialImportSuggestionKind.CREATE_PAYABLE) {
      return {
        type: 'CREATE_PAYABLE_AND_SETTLE',
        payload: {
          bank_account_id: bankAccount.id,
          company_id: line.suggested_company_id || null,
          currency_id: bankAccount.currency_id,
          due_date: transactionDate,
          issue_date: transactionDate,
          original_amount: amount.toFixed(2),
          description,
          category_id: line.suggested_category_id || null,
          cost_center_id: line.suggested_cost_center_id || null,
          entry_group: entryGroup,
          payment_method: paymentMethod,
          reference: line.document_number || null,
        },
      };
    }

    return {
      type:
        line.suggestion_kind === FinancialImportSuggestionKind.TRANSFER
          ? 'TRANSFER'
          : 'CREATE_MOVEMENT',
      payload: {
        bank_account_id: bankAccount.id,
        movement_date: transactionDate,
        movement_type: line.movement_type || FinancialMovementType.DEBIT,
        amount: amount.toFixed(2),
        description,
        category_id: line.suggested_category_id || null,
        cost_center_id: line.suggested_cost_center_id || null,
        reference_table: 'financial_import_lines',
        reference_id: line.id || null,
        reconciled: true,
        reconciliation_note: 'Imported from bank statement',
      },
    };
  }

  private async applyImportLineAction(tx: PrismaClient, user: AuthUser, bankAccount: any, line: any, action: any) {
    const type = String(action?.type || '').trim().toUpperCase();
    const payload = action?.payload || {};

    if (!type || type === 'IGNORE') {
      return { touched_bank_account_id: bankAccount.id };
    }

    if (type === 'CREATE_MOVEMENT' || type === 'TRANSFER') {
      const movement = await tx.financial_bank_movements.create({
        data: {
          tenant_id: user.tenant_id,
          bank_account_id: payload.bank_account_id || bankAccount.id,
          movement_date: this.toDate(payload.movement_date) ?? new Date(),
          movement_type: payload.movement_type || line.movement_type || FinancialMovementType.DEBIT,
          amount: this.decimal(payload.amount, '0'),
          description: payload.description || line.description || null,
          category_id: payload.category_id || null,
          cost_center_id: payload.cost_center_id || null,
          reference_table: payload.reference_table || 'financial_import_lines',
          reference_id: payload.reference_id || line.id || null,
          reconciled: payload.reconciled ?? true,
          reconciliation_note: payload.reconciliation_note || 'Imported from bank statement',
        },
      });
      return {
        generated_bank_movement_id: movement.id,
        touched_bank_account_id: movement.bank_account_id,
      };
    }

    if (type === 'MATCH_RECEIVABLE_PAYMENT') {
      const created = await this.createReceivableSettlementFromImport(tx, user, payload, line);
      return { ...created, touched_bank_account_id: payload.bank_account_id || bankAccount.id };
    }

    if (type === 'MATCH_PAYABLE_PAYMENT') {
      const created = await this.createPayableSettlementFromImport(tx, user, payload, line);
      return { ...created, touched_bank_account_id: payload.bank_account_id || bankAccount.id };
    }

    if (type === 'CREATE_RECEIVABLE_AND_SETTLE') {
      const titleNumber = await this.ensureUniqueEntryNumber(
        tx,
        'financial_receivables',
        'title_number',
        user.tenant_id,
        this.buildImportEntryNumber('REC', line),
      );
      const original = this.decimal(payload.original_amount, '0');
      const dueDate = this.toDateOnly(payload.due_date) ?? this.todayDateOnly();
      const receivable = await tx.financial_receivables.create({
        data: {
          tenant_id: user.tenant_id,
          title_number: titleNumber,
          description: payload.description || line.description || null,
          company_id: payload.company_id,
          currency_id: payload.currency_id || bankAccount.currency_id,
          category_id: payload.category_id || null,
          cost_center_id: payload.cost_center_id || null,
          issue_date: this.toDateOnly(payload.issue_date) ?? dueDate,
          due_date: dueDate,
          original_amount: original,
          paid_amount: this.decimal('0'),
          outstanding_amount: original,
          entry_group: payload.entry_group || FinancialEntryGroup.VARIABLE,
        },
      });
      const settlement = await this.createReceivableSettlementFromImport(
        tx,
        user,
        {
          receivable_id: receivable.id,
          bank_account_id: payload.bank_account_id || bankAccount.id,
          payment_date: payload.due_date,
          amount: payload.original_amount,
          payment_method: payload.payment_method,
          reference: payload.reference,
          notes: payload.description,
        },
        line,
      );
      return {
        generated_receivable_id: receivable.id,
        ...settlement,
        touched_bank_account_id: payload.bank_account_id || bankAccount.id,
      };
    }

    if (type === 'CREATE_PAYABLE_AND_SETTLE') {
      const payableNumber = await this.ensureUniqueEntryNumber(
        tx,
        'financial_payables',
        'payable_number',
        user.tenant_id,
        this.buildImportEntryNumber('PAY', line),
      );
      const original = this.decimal(payload.original_amount, '0');
      const dueDate = this.toDateOnly(payload.due_date) ?? this.todayDateOnly();
      const payable = await tx.financial_payables.create({
        data: {
          tenant_id: user.tenant_id,
          payable_number: payableNumber,
          description: payload.description || line.description || null,
          company_id: payload.company_id || null,
          currency_id: payload.currency_id || bankAccount.currency_id,
          category_id: payload.category_id || null,
          cost_center_id: payload.cost_center_id || null,
          issue_date: this.toDateOnly(payload.issue_date) ?? dueDate,
          due_date: dueDate,
          original_amount: original,
          paid_amount: this.decimal('0'),
          outstanding_amount: original,
          entry_group: payload.entry_group || FinancialEntryGroup.VARIABLE,
        },
      });
      const settlement = await this.createPayableSettlementFromImport(
        tx,
        user,
        {
          payable_id: payable.id,
          bank_account_id: payload.bank_account_id || bankAccount.id,
          payment_date: payload.due_date,
          amount: payload.original_amount,
          payment_method: payload.payment_method,
          reference: payload.reference,
          notes: payload.description,
        },
        line,
      );
      return {
        generated_payable_id: payable.id,
        ...settlement,
        touched_bank_account_id: payload.bank_account_id || bankAccount.id,
      };
    }

    throw new BadRequestException(`Unsupported import action: ${type}`);
  }

  private async createReceivableSettlementFromImport(
    tx: PrismaClient,
    user: AuthUser,
    payload: any,
    line: any,
  ) {
    const receivable = await tx.financial_receivables.findFirst({
      where: { tenant_id: user.tenant_id, id: payload.receivable_id },
    });
    if (!receivable) throw new NotFoundException('Receivable not found for import settlement');

    const payment = await tx.financial_receivable_payments.create({
      data: {
        tenant_id: user.tenant_id,
        receivable_id: receivable.id,
        bank_account_id: payload.bank_account_id || null,
        payment_date: this.toDate(payload.payment_date) ?? new Date(),
        amount: this.decimal(payload.amount, '0'),
        payment_method: payload.payment_method || this.detectPaymentMethod(line.description || ''),
        reference: payload.reference || null,
        notes: payload.notes || null,
      },
    });

    let movementId: string | null = null;
    if (payload.bank_account_id) {
      const movement = await tx.financial_bank_movements.create({
        data: {
          tenant_id: user.tenant_id,
          bank_account_id: payload.bank_account_id,
          movement_date: this.toDate(payload.payment_date) ?? new Date(),
          movement_type: FinancialMovementType.CREDIT,
          amount: this.getReceivableBankMovementAmount({
            amount: payment.amount,
            fee_amount: payment.fee_amount,
            interest_amount: payment.interest_amount,
            discount_amount: payment.discount_amount,
          }),
          description: `Receivable settlement ${receivable.title_number}`,
          category_id: receivable.category_id ?? null,
          cost_center_id: receivable.cost_center_id ?? null,
          reference_table: 'financial_receivables',
          reference_id: receivable.id,
          reconciled: true,
          reconciliation_note: 'Imported from bank statement',
        },
      });
      movementId = movement.id;
      await tx.financial_receivable_payments.updateMany({
        where: { tenant_id: user.tenant_id, id: payment.id },
        data: { bank_movement_id: movement.id, updated_at: new Date() },
      });
    }

    await this.syncReceivableState(tx, user.tenant_id, receivable.id);
    return {
      generated_receivable_payment_id: payment.id,
      generated_bank_movement_id: movementId,
    };
  }

  private async createPayableSettlementFromImport(
    tx: PrismaClient,
    user: AuthUser,
    payload: any,
    line: any,
  ) {
    const payable = await tx.financial_payables.findFirst({
      where: { tenant_id: user.tenant_id, id: payload.payable_id },
    });
    if (!payable) throw new NotFoundException('Payable not found for import settlement');

    const payment = await tx.financial_payable_payments.create({
      data: {
        tenant_id: user.tenant_id,
        payable_id: payable.id,
        bank_account_id: payload.bank_account_id || null,
        payment_date: this.toDate(payload.payment_date) ?? new Date(),
        amount: this.decimal(payload.amount, '0'),
        payment_method: payload.payment_method || this.detectPaymentMethod(line.description || ''),
        reference: payload.reference || null,
        notes: payload.notes || null,
      },
    });

    let movementId: string | null = null;
    if (payload.bank_account_id) {
      const movement = await tx.financial_bank_movements.create({
        data: {
          tenant_id: user.tenant_id,
          bank_account_id: payload.bank_account_id,
          movement_date: this.toDate(payload.payment_date) ?? new Date(),
          movement_type: FinancialMovementType.DEBIT,
          amount: this.getPayableBankMovementAmount({
            amount: payment.amount,
            fee_amount: payment.fee_amount,
            interest_amount: payment.interest_amount,
            discount_amount: payment.discount_amount,
          }),
          description: `Payable settlement ${payable.payable_number}`,
          category_id: payable.category_id ?? null,
          cost_center_id: payable.cost_center_id ?? null,
          reference_table: 'financial_payables',
          reference_id: payable.id,
          reconciled: true,
          reconciliation_note: 'Imported from bank statement',
        },
      });
      movementId = movement.id;
      await tx.financial_payable_payments.updateMany({
        where: { tenant_id: user.tenant_id, id: payment.id },
        data: { bank_movement_id: movement.id, updated_at: new Date() },
      });
    }

    await this.syncPayableState(tx, user.tenant_id, payable.id);
    return {
      generated_payable_payment_id: payment.id,
      generated_bank_movement_id: movementId,
    };
  }

  private async recalculateImportJobCounters(tenantId: string, jobId: string) {
    await this.prisma.transaction(async (tx) => {
      const counters = await this.collectImportJobCountersTx(tx, tenantId, jobId);
      await tx.financial_import_jobs.updateMany({
        where: { tenant_id: tenantId, id: jobId },
        data: {
          lines_reviewed: counters.lines_reviewed,
          lines_applied: counters.lines_applied,
          lines_ignored: counters.lines_ignored,
          status: counters.pending > 0 ? FinancialImportJobStatus.REVIEW : FinancialImportJobStatus.APPLIED,
          updated_at: new Date(),
        },
      });
    });
  }

  private async collectImportJobCountersTx(tx: PrismaClient, tenantId: string, jobId: string) {
    const [approved, suggested, applied, ignored, error] = await Promise.all([
      tx.financial_import_lines.count({
        where: { tenant_id: tenantId, import_job_id: jobId, suggestion_status: FinancialImportSuggestionStatus.APPROVED },
      }),
      tx.financial_import_lines.count({
        where: { tenant_id: tenantId, import_job_id: jobId, suggestion_status: FinancialImportSuggestionStatus.SUGGESTED },
      }),
      tx.financial_import_lines.count({
        where: { tenant_id: tenantId, import_job_id: jobId, suggestion_status: FinancialImportSuggestionStatus.APPLIED },
      }),
      tx.financial_import_lines.count({
        where: { tenant_id: tenantId, import_job_id: jobId, suggestion_status: FinancialImportSuggestionStatus.IGNORED },
      }),
      tx.financial_import_lines.count({
        where: { tenant_id: tenantId, import_job_id: jobId, suggestion_status: FinancialImportSuggestionStatus.ERROR },
      }),
    ]);

    return {
      pending: approved + suggested,
      lines_reviewed: approved + applied + ignored + error,
      lines_applied: applied,
      lines_ignored: ignored,
    };
  }

  private buildParsedSummary(lines: FinanceImportParseLine[]) {
    const creditAmount = lines
      .filter((line) => line.movement_type === FinancialMovementType.CREDIT)
      .reduce((acc, line) => acc + Number(line.amount || 0), 0);
    const debitAmount = lines
      .filter((line) => line.movement_type === FinancialMovementType.DEBIT)
      .reduce((acc, line) => acc + Number(line.amount || 0), 0);
    const dates = lines
      .map((line) => this.toDateOnly(line.transaction_date))
      .filter(Boolean) as Date[];
    const sortedDates = dates.slice().sort((a, b) => a.getTime() - b.getTime());
    return {
      total_lines: lines.length,
      credit_lines: lines.filter((line) => line.movement_type === FinancialMovementType.CREDIT).length,
      debit_lines: lines.filter((line) => line.movement_type === FinancialMovementType.DEBIT).length,
      credit_amount: this.roundMoney(creditAmount),
      debit_amount: this.roundMoney(debitAmount),
      period_start: sortedDates[0] ? this.dateKey(sortedDates[0]) : null,
      period_end: sortedDates[sortedDates.length - 1] ? this.dateKey(sortedDates[sortedDates.length - 1]) : null,
    };
  }

  private normalizeImportedLine(item: any, lineNumber: number): FinanceImportParseLine | null {
    const amountValue = this.parseFlexibleNumber(item?.amount);
    if (amountValue == null || Math.abs(amountValue) < 0.00001) return null;
    const movementTypeRaw = String(item?.movement_type || '').trim().toUpperCase();
    const movementType =
      movementTypeRaw === 'DEBIT' ? FinancialMovementType.DEBIT : FinancialMovementType.CREDIT;
    return {
      line_number: Number(item?.line_number || lineNumber || 1),
      external_id: item?.external_id ? String(item.external_id) : null,
      transaction_date: this.parseImportedDate(item?.transaction_date),
      movement_type: movementType,
      amount: Math.abs(amountValue).toFixed(2),
      balance_after:
        this.parseFlexibleNumber(item?.balance_after) != null
          ? Number(this.parseFlexibleNumber(item?.balance_after)).toFixed(2)
          : null,
      currency_code: item?.currency_code ? String(item.currency_code).trim().toUpperCase() : null,
      description: item?.description ? String(item.description).trim() : null,
      counterparty_name: item?.counterparty_name ? String(item.counterparty_name).trim() : null,
      document_number: item?.document_number ? String(item.document_number).trim() : null,
      raw_text: item?.raw_text ? String(item.raw_text) : null,
      source_payload: typeof item === 'object' && item ? item : null,
    };
  }

  private decodeImportBuffer(buffer: Buffer) {
    const utf8 = buffer.toString('utf8');
    const replacementRatio = (utf8.match(/\uFFFD/g) || []).length;
    if (replacementRatio > 4) return buffer.toString('latin1');
    return utf8;
  }

  private extractOfxTag(block: string, tag: string) {
    const match = block.match(new RegExp(`<${tag}>([^<\\r\\n]+)`, 'i'));
    return match?.[1] ? String(match[1]).trim() : '';
  }

  private parseOfxDate(raw: string | null | undefined) {
    const clean = String(raw || '').trim();
    const digits = clean.replace(/[^\d]/g, '');
    if (digits.length < 8) return null;
    const year = Number(digits.slice(0, 4));
    const month = Number(digits.slice(4, 6));
    const day = Number(digits.slice(6, 8));
    if (!year || !month || !day) return null;
    return new Date(Date.UTC(year, month - 1, day));
  }

  private detectCsvDelimiter(lines: string[]) {
    const delimiters = [';', ',', '\t', '|'];
    const scores = delimiters.map((delimiter) => ({
      delimiter,
      score: lines.reduce((acc, line) => acc + this.parseCsvRow(line, delimiter).length, 0),
    }));
    scores.sort((left, right) => right.score - left.score);
    return scores[0]?.delimiter || ';';
  }

  private parseCsvRow(row: string, delimiter: string) {
    const out: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < row.length; i += 1) {
      const char = row[i];
      if (char === '"') {
        if (inQuotes && row[i + 1] === '"') {
          current += '"';
          i += 1;
        } else {
          inQuotes = !inQuotes;
        }
        continue;
      }
      if (char === delimiter && !inQuotes) {
        out.push(current.trim());
        current = '';
        continue;
      }
      current += char;
    }
    out.push(current.trim());
    return out;
  }

  private findHeaderIndex(headers: string[], candidates: string[]) {
    return headers.findIndex((header) => candidates.some((candidate) => header.includes(this.normalizeSearchText(candidate))));
  }

  private parseImportedDate(value: any) {
    const raw = String(value || '').trim();
    if (!raw) return null;
    if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return this.toDateOnly(raw);
    const br = raw.match(/^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/);
    if (br) {
      const year = br[3].length === 2 ? Number(`20${br[3]}`) : Number(br[3]);
      return new Date(Date.UTC(year, Number(br[2]) - 1, Number(br[1])));
    }
    return this.toDateOnly(raw);
  }

  private parseFlexibleNumber(value: any): number | null {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    const cleaned = raw.replace(/\s+/g, '').replace(/[R$\u00A0]/g, '').replace(/[^\d,.\-]/g, '');
    if (!cleaned) return null;

    let normalized = cleaned;
    if (cleaned.includes(',') && cleaned.includes('.')) {
      normalized =
        cleaned.lastIndexOf(',') > cleaned.lastIndexOf('.')
          ? cleaned.replace(/\./g, '').replace(',', '.')
          : cleaned.replace(/,/g, '');
    } else if (cleaned.includes(',')) {
      normalized = cleaned.replace(/\./g, '').replace(',', '.');
    }

    const valueNumber = Number(normalized);
    return Number.isFinite(valueNumber) ? valueNumber : null;
  }

  private normalizeSearchText(value: string) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9\s]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  private tokenizeSearchText(value: string) {
    return this.normalizeSearchText(value)
      .split(' ')
      .map((item) => item.trim())
      .filter((item) => item.length > 2);
  }

  private findBestCompanyMatch(companies: any[], normalizedText: string) {
    if (!normalizedText) return null;
    const tokens = this.tokenizeSearchText(normalizedText);
    let best: any = null;
    let bestScore = 0;
    companies.forEach((company) => {
      const label = this.normalizeSearchText([company.company_name, company.company_number].filter(Boolean).join(' '));
      if (!label) return;
      let score = 0;
      if (company.company_number && normalizedText.includes(this.normalizeSearchText(String(company.company_number)))) score += 70;
      tokens.forEach((token) => {
        if (label.includes(token)) score += 8;
      });
      if (score > bestScore) {
        bestScore = score;
        best = company;
      }
    });
    return bestScore >= 16 ? best : null;
  }

  private findBestCategoryMatch(categories: any[], normalizedText: string, movementType?: FinancialMovementType | null) {
    const tokens = this.tokenizeSearchText(normalizedText);
    let best: any = null;
    let bestScore = 0;
    categories.forEach((category) => {
      if (movementType === FinancialMovementType.CREDIT && String(category.kind || '').toUpperCase() === 'EXPENSE') return;
      if (movementType === FinancialMovementType.DEBIT && String(category.kind || '').toUpperCase() === 'REVENUE') return;
      const label = this.normalizeSearchText([category.code, category.name].filter(Boolean).join(' '));
      let score = 0;
      tokens.forEach((token) => {
        if (label.includes(token)) score += 10;
      });
      if (movementType === FinancialMovementType.DEBIT && this.looksLikeTaxText(normalizedText) && label.includes('impost')) score += 25;
      if (movementType === FinancialMovementType.DEBIT && this.looksLikeRecurringExpenseText(normalizedText) && label.includes('despes')) score += 15;
      if (score > bestScore) {
        bestScore = score;
        best = category;
      }
    });
    return bestScore >= 12 ? best : null;
  }

  private findBestReceivableMatch(receivables: any[], normalizedText: string, amount: number) {
    let best: any = null;
    let bestScore = 0;
    receivables.forEach((item) => {
      const candidate = this.normalizeSearchText(
        [item.title_number, item.description, item.company?.company_name, item.company?.company_number].filter(Boolean).join(' '),
      );
      const amountDiff = Math.abs(Number(item.outstanding_amount || 0) - amount);
      let score = amountDiff <= 0.05 ? 74 : amountDiff <= 1 ? 60 : amountDiff <= 5 ? 40 : 0;
      if (!score) return;
      if (normalizedText.includes(this.normalizeSearchText(String(item.title_number || '')))) score += 22;
      this.tokenizeSearchText(normalizedText).forEach((token) => {
        if (candidate.includes(token)) score += 4;
      });
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    });
    return best ? { item: best, score: Math.min(99, bestScore) } : null;
  }

  private findBestPayableMatch(payables: any[], normalizedText: string, amount: number) {
    let best: any = null;
    let bestScore = 0;
    payables.forEach((item) => {
      const candidate = this.normalizeSearchText(
        [item.payable_number, item.description, item.company?.company_name, item.company?.company_number].filter(Boolean).join(' '),
      );
      const amountDiff = Math.abs(Number(item.outstanding_amount || 0) - amount);
      let score = amountDiff <= 0.05 ? 74 : amountDiff <= 1 ? 60 : amountDiff <= 5 ? 40 : 0;
      if (!score) return;
      if (normalizedText.includes(this.normalizeSearchText(String(item.payable_number || '')))) score += 22;
      this.tokenizeSearchText(normalizedText).forEach((token) => {
        if (candidate.includes(token)) score += 4;
      });
      if (score > bestScore) {
        bestScore = score;
        best = item;
      }
    });
    return best ? { item: best, score: Math.min(99, bestScore) } : null;
  }

  private findNamedRecord(items: any[], label: string | null | undefined, keys: string[]) {
    const normalized = this.normalizeSearchText(String(label || ''));
    if (!normalized) return null;
    return (
      items.find((item) =>
        keys.some((key) => this.normalizeSearchText(String(item?.[key] || '')) === normalized),
      ) || null
    );
  }

  private parseImportSuggestionKind(value: string | null | undefined) {
    const normalized = String(value || '').trim().toUpperCase();
    return Object.values(FinancialImportSuggestionKind).includes(normalized as FinancialImportSuggestionKind)
      ? (normalized as FinancialImportSuggestionKind)
      : null;
  }

  private looksLikeTransferText(text: string) {
    return /(transfer|transferencia|transf|ted |doc |entre contas|pix transfer|remessa)/i.test(text);
  }

  private looksLikeTaxText(text: string) {
    return /(impost|tribut|darf|simples|iss|icms|ipi|inss|fgts|irpj|csll|receita federal)/i.test(text);
  }

  private looksLikeRecurringExpenseText(text: string) {
    return /(internet|energia|luz|agua|aluguel|telefone|celular|salario|folha|contabil|software|saas|assinatura|mensalidade)/i.test(text);
  }

  private looksLikeInvoiceText(text: string) {
    return /(invoice|fatura|nf |nota fiscal|boleto|recebimento|cliente|venda|pedido)/i.test(text);
  }

  private inferEntryGroupFromText(text: string) {
    const normalized = this.normalizeSearchText(text);
    if (this.looksLikeTaxText(normalized)) return FinancialEntryGroup.TAX;
    if (this.looksLikeTransferText(normalized)) return FinancialEntryGroup.TRANSFER;
    return FinancialEntryGroup.VARIABLE;
  }

  private detectPaymentMethod(text: string) {
    const normalized = this.normalizeSearchText(text);
    if (normalized.includes('pix')) return FinancialPaymentMethod.PIX;
    if (normalized.includes('boleto')) return FinancialPaymentMethod.BOLETO;
    if (normalized.includes('credito') || normalized.includes('credit card')) return FinancialPaymentMethod.CREDIT_CARD;
    if (normalized.includes('debito') || normalized.includes('debit card')) return FinancialPaymentMethod.DEBIT_CARD;
    if (normalized.includes('dinheiro') || normalized.includes('cash')) return FinancialPaymentMethod.CASH;
    return FinancialPaymentMethod.BANK_TRANSFER;
  }

  private buildImportEntryNumber(prefix: string, line: any) {
    const date = this.toDateOnly(line.transaction_date) ?? this.todayDateOnly();
    return `${prefix}-${this.dateKey(date).replace(/-/g, '')}-${String(line.line_number || 1).padStart(3, '0')}`;
  }

  private extractAiText(response: any): string {
    if (typeof response?.output_text === 'string' && response.output_text.trim()) {
      return response.output_text.trim();
    }

    const chunks: string[] = [];
    const output = Array.isArray(response?.output) ? response.output : [];
    output.forEach((item: any) => {
      const content = Array.isArray(item?.content) ? item.content : [];
      content.forEach((part: any) => {
        if (typeof part?.text === 'string' && part.text.trim()) chunks.push(part.text.trim());
      });
    });
    return chunks.join('\n').trim();
  }

  private extractJsonPayload(text: string) {
    const raw = String(text || '').trim();
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch {
      const startObject = raw.indexOf('{');
      const endObject = raw.lastIndexOf('}');
      if (startObject >= 0 && endObject > startObject) {
        try {
          return JSON.parse(raw.slice(startObject, endObject + 1));
        } catch {
          // ignore
        }
      }
      const startArray = raw.indexOf('[');
      const endArray = raw.lastIndexOf(']');
      if (startArray >= 0 && endArray > startArray) {
        try {
          return JSON.parse(raw.slice(startArray, endArray + 1));
        } catch {
          // ignore
        }
      }
      throw new BadRequestException('Unable to parse AI response for financial import');
    }
  }

  private async syncReceivableState(tx: PrismaClient, tenantId: string, receivableId: string) {
    const receivable = await tx.financial_receivables.findFirst({
      where: { tenant_id: tenantId, id: receivableId },
    });
    if (!receivable) return;

    const sums = await tx.financial_receivable_payments.aggregate({
      where: { tenant_id: tenantId, receivable_id: receivableId },
      _sum: {
        amount: true,
        interest_amount: true,
        discount_amount: true,
      },
    });

    const paid = this.roundMoney(
      Number(sums._sum.amount || 0) + Number(sums._sum.interest_amount || 0) - Number(sums._sum.discount_amount || 0),
    );
    const state = this.computeEntryState(receivable.original_amount, this.decimal(String(paid)), receivable.due_date);

    await tx.financial_receivables.updateMany({
      where: { tenant_id: tenantId, id: receivableId },
      data: {
        paid_amount: state.paidAmount,
        outstanding_amount: state.outstandingAmount,
        status: state.status,
        is_delinquent: state.isDelinquent,
        delinquent_days: state.delinquentDays,
        updated_at: new Date(),
      },
    });
  }

  private async syncPayableState(tx: PrismaClient, tenantId: string, payableId: string) {
    const payable = await tx.financial_payables.findFirst({
      where: { tenant_id: tenantId, id: payableId },
    });
    if (!payable) return;

    const sums = await tx.financial_payable_payments.aggregate({
      where: { tenant_id: tenantId, payable_id: payableId },
      _sum: {
        amount: true,
        interest_amount: true,
        discount_amount: true,
      },
    });

    const paid = this.roundMoney(
      Number(sums._sum.amount || 0) + Number(sums._sum.interest_amount || 0) - Number(sums._sum.discount_amount || 0),
    );
    const state = this.computeEntryState(payable.original_amount, this.decimal(String(paid)), payable.due_date);

    await tx.financial_payables.updateMany({
      where: { tenant_id: tenantId, id: payableId },
      data: {
        paid_amount: state.paidAmount,
        outstanding_amount: state.outstandingAmount,
        status: state.status,
        is_delinquent: state.isDelinquent,
        delinquent_days: state.delinquentDays,
        updated_at: new Date(),
      },
    });
  }

  private async refreshBankAccountBalance(tx: PrismaClient, tenantId: string, accountId: string) {
    const account = await tx.financial_bank_accounts.findFirst({
      where: { tenant_id: tenantId, id: accountId },
      select: { opening_balance: true },
    });
    if (!account) return;

    const credits = await tx.financial_bank_movements.aggregate({
      where: { tenant_id: tenantId, bank_account_id: accountId, movement_type: FinancialMovementType.CREDIT },
      _sum: { amount: true },
    });
    const debits = await tx.financial_bank_movements.aggregate({
      where: { tenant_id: tenantId, bank_account_id: accountId, movement_type: FinancialMovementType.DEBIT },
      _sum: { amount: true },
    });

    const opening = this.decimal(account.opening_balance as any, '0');
    const current = opening
      .plus(this.decimal(credits._sum.amount as any, '0'))
      .minus(this.decimal(debits._sum.amount as any, '0'));

    await tx.financial_bank_accounts.updateMany({
      where: { tenant_id: tenantId, id: accountId },
      data: { current_balance: current, updated_at: new Date() },
    });
  }

  private async createFinanceEvent(
    tx: PrismaClient,
    params: {
      tenantId: string;
      relatedTable: string;
      relatedId: string;
      title: string;
      description?: string | null;
    },
  ) {
    try {
      await tx.events.create({
        data: {
          tenant_id: params.tenantId,
          related_table: params.relatedTable,
          related_id: params.relatedId,
          title: params.title,
          description: params.description || null,
          type: 1,
          status: 1,
          start_time: new Date(),
          end_time: null,
          finished: false,
          document_related: false,
        },
      });
    } catch {
      // ignore
    }
  }

  private async resolveCurrencyIdByCode(code: string) {
    const normalized = String(code || '').trim().toUpperCase();
    const currency = await this.db.currencies.findFirst({
      where: { code: normalized },
      select: { id: true },
    });
    if (!currency?.id) {
      throw new BadRequestException(`Currency ${normalized} not found`);
    }
    return currency.id;
  }

  private decorateEntryState<T extends { due_date: Date | null; original_amount: any; paid_amount: any }>(row: T) {
    const computed = this.computeEntryState(row.original_amount, row.paid_amount, row.due_date);
    return {
      ...row,
      status: computed.status,
      is_delinquent: computed.isDelinquent,
      delinquent_days: computed.delinquentDays,
      outstanding_amount: computed.outstandingAmount,
    };
  }

  private computeEntryState(
    originalAmount: Prisma.Decimal.Value | null | undefined,
    paidAmount: Prisma.Decimal.Value | null | undefined,
    dueDate: Date | null | undefined,
  ): FinanceEntryState {
    const original = this.roundMoney(Number(originalAmount || 0));
    const paid = this.roundMoney(Number(paidAmount || 0));
    const outstanding = this.roundMoney(Math.max(0, original - paid));

    let status: FinancialEntryStatus = FinancialEntryStatus.OPEN;
    if (outstanding <= 0) status = FinancialEntryStatus.PAID;
    else if (paid > 0) status = FinancialEntryStatus.PARTIAL;

    let isDelinquent = false;
    let delinquentDays = 0;
    if (outstanding > 0 && dueDate) {
      const today = this.todayDateOnly();
      const due = this.toDateOnly(dueDate as any);
      if (due && due < today) {
        status = FinancialEntryStatus.OVERDUE;
        isDelinquent = true;
        delinquentDays = Math.max(0, Math.floor((today.getTime() - due.getTime()) / 86400000));
      }
    }

    return {
      paidAmount: this.decimal(String(paid), '0'),
      outstandingAmount: this.decimal(String(outstanding), '0'),
      status,
      isDelinquent,
      delinquentDays,
    };
  }

  private getReceivableBankMovementAmount(payment: {
    amount: Prisma.Decimal.Value;
    interest_amount: Prisma.Decimal.Value;
    discount_amount: Prisma.Decimal.Value;
    fee_amount: Prisma.Decimal.Value;
  }) {
    const value = this.roundMoney(
      Number(payment.amount || 0) +
        Number(payment.interest_amount || 0) -
        Number(payment.discount_amount || 0) -
        Number(payment.fee_amount || 0),
    );
    return this.decimal(String(Math.max(0, value)), '0');
  }

  private getPayableBankMovementAmount(payment: {
    amount: Prisma.Decimal.Value;
    interest_amount: Prisma.Decimal.Value;
    discount_amount: Prisma.Decimal.Value;
    fee_amount: Prisma.Decimal.Value;
  }) {
    const value = this.roundMoney(
      Number(payment.amount || 0) +
        Number(payment.interest_amount || 0) -
        Number(payment.discount_amount || 0) +
        Number(payment.fee_amount || 0),
    );
    return this.decimal(String(Math.max(0, value)), '0');
  }

  private buildRecurrenceDates(
    baseDate: Date,
    enabled?: boolean,
    frequency?: FinancialRecurrenceFrequency | null,
    interval?: number | null,
    occurrences?: number | null,
    endDateValue?: string | Date | null,
    dayOfMonth?: number | null,
  ) {
    const dates: Date[] = [baseDate];
    if (!enabled) return dates;

    const normalizedFrequency = frequency ?? FinancialRecurrenceFrequency.MONTHLY;
    const normalizedInterval = Math.max(1, Number(interval || 1));
    const normalizedOccurrences = Math.max(1, Number(occurrences || 1));
    const endDate = this.toDateOnly(endDateValue);

    let cursor = baseDate;
    while (dates.length < normalizedOccurrences) {
      cursor = this.shiftRecurrenceDate(cursor, normalizedFrequency, normalizedInterval, 1, dayOfMonth);
      if (endDate && cursor > endDate) break;
      dates.push(cursor);
    }

    if (endDate && !occurrences) {
      while (true) {
        const next = this.shiftRecurrenceDate(cursor, normalizedFrequency, normalizedInterval, 1, dayOfMonth);
        if (next > endDate || dates.length >= 240) break;
        dates.push(next);
        cursor = next;
      }
    }

    return dates;
  }

  private shiftRecurrenceDate(
    baseDate: Date,
    frequency: FinancialRecurrenceFrequency,
    interval: number,
    multiplier: number,
    dayOfMonth?: number | null,
  ) {
    const out = new Date(baseDate.getTime());
    const step = Math.max(1, Number(interval || 1)) * Math.max(0, Number(multiplier || 0));
    if (!step) return out;

    if (frequency === FinancialRecurrenceFrequency.WEEKLY) {
      out.setUTCDate(out.getUTCDate() + step * 7);
      return out;
    }

    if (frequency === FinancialRecurrenceFrequency.YEARLY) {
      out.setUTCFullYear(out.getUTCFullYear() + step);
      const targetDay = this.resolveRecurrenceDay(dayOfMonth, out.getUTCDate(), out.getUTCFullYear(), out.getUTCMonth());
      out.setUTCDate(targetDay);
      return out;
    }

    const targetMonth = out.getUTCMonth() + step;
    const targetYear = out.getUTCFullYear() + Math.floor(targetMonth / 12);
    const normalizedMonth = ((targetMonth % 12) + 12) % 12;
    const targetDay = this.resolveRecurrenceDay(dayOfMonth, out.getUTCDate(), targetYear, normalizedMonth);
    return new Date(Date.UTC(targetYear, normalizedMonth, targetDay));
  }

  private resolveRecurrenceDay(dayOfMonth: number | null | undefined, fallbackDay: number, year: number, month: number) {
    const desired = Math.max(1, Math.min(31, Number(dayOfMonth || fallbackDay || 1)));
    const maxDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    return Math.min(desired, maxDay);
  }

  private buildGeneratedEntryNumber(baseNumber: string, occurrenceNumber: number) {
    return `${String(baseNumber || '').trim()}-${String(occurrenceNumber).padStart(2, '0')}`;
  }

  private async ensureUniqueEntryNumber(
    tx: PrismaClient,
    delegate: 'financial_receivables' | 'financial_payables',
    field: 'title_number' | 'payable_number',
    tenantId: string,
    candidate: string,
  ) {
    const normalized = String(candidate || '').trim();
    if (!normalized) throw new BadRequestException('Financial entry number is required');

    let value = normalized;
    let suffix = 0;
    while (await (tx as any)[delegate].findFirst({ where: { tenant_id: tenantId, [field]: value }, select: { id: true } })) {
      suffix += 1;
      value = `${normalized}-${suffix}`;
    }
    return value;
  }

  private decimal(value: Prisma.Decimal.Value | null | undefined, fallback = '0') {
    const raw = value == null || String(value).trim() === '' ? fallback : String(value);
    return new Prisma.Decimal(raw);
  }

  private toDate(value: string | Date | null | undefined): Date | null {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private toDateOnly(value: string | Date | null | undefined): Date | null {
    const date = this.toDate(value);
    if (!date) return null;
    return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  }

  private toDateEnd(value: string | Date | null | undefined): Date | null {
    const date = this.toDate(value);
    if (!date) return null;
    date.setHours(23, 59, 59, 999);
    return date;
  }

  private addDays(date: Date, days: number): Date {
    const out = new Date(date.getTime());
    out.setUTCDate(out.getUTCDate() + days);
    return out;
  }

  private todayDateOnly() {
    return this.toDateOnly(new Date()) as Date;
  }

  private dateKey(date: Date) {
    return this.toDateOnly(date)?.toISOString().slice(0, 10) || '';
  }

  private roundMoney(value: number) {
    if (!Number.isFinite(value)) return 0;
    return Math.round((value + Number.EPSILON) * 100) / 100;
  }

  private toOptionalBoolean(value: string | undefined): boolean | undefined {
    if (value == null || String(value).trim() === '') return undefined;
    const normalized = String(value).trim().toLowerCase();
    if (['1', 'true', 'yes', 'y'].includes(normalized)) return true;
    if (['0', 'false', 'no', 'n'].includes(normalized)) return false;
    return undefined;
  }

  private toCents(value: Prisma.Decimal.Value | null | undefined): number {
    const n = Number(value || 0);
    if (!Number.isFinite(n)) return 0;
    return Math.round(n * 100);
  }

  private decimalFromCents(cents: number): Prisma.Decimal {
    return this.decimal((Math.max(0, cents) / 100).toFixed(2), '0');
  }
}
