import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import {
  FinancialEntryStatus,
  FinancialMovementType,
  FinancialPaymentMethod,
  Prisma,
  PrismaClient,
} from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import {
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

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

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
    query: { q?: string; status?: string; company_id?: string; from_due?: string; to_due?: string },
  ) {
    const q = String(query.q || '').trim();
    const rows = await this.db.financial_receivables.findMany({
      where: {
        tenant_id: user.tenant_id,
        ...(query.status ? { status: query.status as any } : {}),
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
    const created = await this.prisma.transaction(async (tx) => {
      const original = this.decimal(dto.original_amount, '0');
      const computed = this.computeEntryState(original, this.decimal('0'), this.toDateOnly(dto.due_date));

      const item = await tx.financial_receivables.create({
        data: {
          tenant_id: user.tenant_id,
          title_number: dto.title_number.trim(),
          description: dto.description?.trim() || null,
          company_id: dto.company_id,
          invoice_id: dto.invoice_id ?? null,
          document_id: dto.document_id ?? null,
          currency_id: dto.currency_id,
          category_id: dto.category_id ?? null,
          cost_center_id: dto.cost_center_id ?? null,
          issue_date: this.toDateOnly(dto.issue_date),
          due_date: this.toDateOnly(dto.due_date) ?? new Date(),
          original_amount: original,
          paid_amount: computed.paidAmount,
          outstanding_amount: computed.outstandingAmount,
          installment_number: dto.installment_number ?? 1,
          installment_total: dto.installment_total ?? 1,
          status: dto.status ?? computed.status,
          is_delinquent: computed.isDelinquent,
          delinquent_days: computed.delinquentDays,
          notes: dto.notes?.trim() || null,
        },
      });

      await this.createFinanceEvent(tx, {
        tenantId: user.tenant_id,
        relatedTable: 'financial_receivables',
        relatedId: item.id,
        title: `Receivable created: ${item.title_number}`,
        description: item.description || 'Receivable title created',
      });

      return item;
    });

    return this.findReceivableById(user, created.id);
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
        total: true,
        due_at: true,
        issued_at: true,
        notes: true,
      },
    });
    if (!invoice) throw new NotFoundException('Invoice not found');

    const totalCents = this.toCents(invoice.total);
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
            currency_id: invoice.currency_id,
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
          ...(dto.installment_number !== undefined ? { installment_number: dto.installment_number } : {}),
          ...(dto.installment_total !== undefined ? { installment_total: dto.installment_total } : {}),
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
    query: { q?: string; status?: string; company_id?: string; from_due?: string; to_due?: string },
  ) {
    const q = String(query.q || '').trim();
    const rows = await this.db.financial_payables.findMany({
      where: {
        tenant_id: user.tenant_id,
        ...(query.status ? { status: query.status as any } : {}),
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
    const created = await this.prisma.transaction(async (tx) => {
      const original = this.decimal(dto.original_amount, '0');
      const computed = this.computeEntryState(original, this.decimal('0'), this.toDateOnly(dto.due_date));

      const item = await tx.financial_payables.create({
        data: {
          tenant_id: user.tenant_id,
          payable_number: dto.payable_number.trim(),
          description: dto.description?.trim() || null,
          company_id: dto.company_id ?? null,
          document_id: dto.document_id ?? null,
          currency_id: dto.currency_id,
          category_id: dto.category_id ?? null,
          cost_center_id: dto.cost_center_id ?? null,
          issue_date: this.toDateOnly(dto.issue_date),
          due_date: this.toDateOnly(dto.due_date) ?? new Date(),
          original_amount: original,
          paid_amount: computed.paidAmount,
          outstanding_amount: computed.outstandingAmount,
          installment_number: dto.installment_number ?? 1,
          installment_total: dto.installment_total ?? 1,
          status: dto.status ?? computed.status,
          is_delinquent: computed.isDelinquent,
          delinquent_days: computed.delinquentDays,
          notes: dto.notes?.trim() || null,
        },
      });

      await this.createFinanceEvent(tx, {
        tenantId: user.tenant_id,
        relatedTable: 'financial_payables',
        relatedId: item.id,
        title: `Payable created: ${item.payable_number}`,
        description: item.description || 'Payable title created',
      });

      return item;
    });

    return this.findPayableById(user, created.id);
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
          ...(dto.installment_number !== undefined ? { installment_number: dto.installment_number } : {}),
          ...(dto.installment_total !== undefined ? { installment_total: dto.installment_total } : {}),
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
