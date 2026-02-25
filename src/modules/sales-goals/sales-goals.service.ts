import { Injectable, NotFoundException } from '@nestjs/common';
import { SalesGoalsRepository } from './sales-goals.repository';
import { CreateSalesGoalDto } from './dto/create-sales-goal.dto';
import { UpdateSalesGoalDto } from './dto/update-sales-goal.dto';
import { CreateSalesCommissionDto } from './dto/create-sales-commission.dto';
import { UpdateSalesCommissionDto } from './dto/update-sales-commission.dto';
import { Prisma, SalesCommissionStatus } from '@prisma/client';

type AuthUser = {
  id: string;
  tenant_id: string;
};

@Injectable()
export class SalesGoalsService {
  constructor(private readonly repository: SalesGoalsRepository) {}

  async listGoals(user: AuthUser, owner_user_id?: string) {
    return this.repository.listGoals(user.tenant_id, owner_user_id);
  }

  async findGoalById(user: AuthUser, id: string) {
    const goal = await this.repository.findGoalById(user.tenant_id, id);
    if (!goal) throw new NotFoundException('Sales goal not found');
    return goal;
  }

  async createGoal(user: AuthUser, dto: CreateSalesGoalDto) {
    const created = await this.repository.createGoal({
      tenant_id: user.tenant_id,
      owner_user: { connect: { id: dto.owner_user_id } },
      period_type: dto.period_type,
      period_start: new Date(dto.period_start),
      period_end: new Date(dto.period_end),
      target_amount: this.decimal(dto.target_amount, '0'),
      achieved_amount: this.decimal(dto.achieved_amount, '0'),
      commission_percent: this.decimal(dto.commission_percent, '0'),
      is_active: dto.is_active ?? true,
      ...(dto.currency_id ? { currency: { connect: { id: dto.currency_id } } } : {}),
    });

    return this.findGoalById(user, created.id);
  }

  async updateGoal(user: AuthUser, id: string, dto: UpdateSalesGoalDto) {
    const existing = await this.repository.findGoalById(user.tenant_id, id);
    if (!existing) throw new NotFoundException('Sales goal not found');

    const updated = await this.repository.updateGoal(id, user.tenant_id, {
      ...(dto.owner_user_id !== undefined ? { owner_user_id: dto.owner_user_id } : {}),
      ...(dto.period_type !== undefined ? { period_type: dto.period_type } : {}),
      ...(dto.period_start !== undefined ? { period_start: dto.period_start ? new Date(dto.period_start) : undefined } : {}),
      ...(dto.period_end !== undefined ? { period_end: dto.period_end ? new Date(dto.period_end) : undefined } : {}),
      ...(dto.target_amount !== undefined ? { target_amount: this.decimal(dto.target_amount, '0') } : {}),
      ...(dto.achieved_amount !== undefined ? { achieved_amount: this.decimal(dto.achieved_amount, '0') } : {}),
      ...(dto.commission_percent !== undefined ? { commission_percent: this.decimal(dto.commission_percent, '0') } : {}),
      ...(dto.currency_id !== undefined ? { currency_id: dto.currency_id ?? null } : {}),
      ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
      updated_at: new Date(),
    });

    if (!updated) throw new NotFoundException('Sales goal not found');
    return updated;
  }

  async removeGoal(user: AuthUser, id: string) {
    const removed = await this.repository.removeGoal(id, user.tenant_id);
    if (!removed) throw new NotFoundException('Sales goal not found');
    return removed;
  }

  async listCommissions(user: AuthUser, query: { owner_user_id?: string; sales_goal_id?: string }) {
    return this.repository.listCommissions(user.tenant_id, query.owner_user_id, query.sales_goal_id);
  }

  async findCommissionById(user: AuthUser, id: string) {
    const item = await this.repository.findCommissionById(user.tenant_id, id);
    if (!item) throw new NotFoundException('Sales commission not found');
    return item;
  }

  async createCommission(user: AuthUser, dto: CreateSalesCommissionDto) {
    const ownerUserId = dto.owner_user_id || user.id;

    const created = await this.repository.createCommission({
      tenant_id: user.tenant_id,
      source_type: dto.source_type,
      source_id: dto.source_id ?? null,
      base_amount: this.decimal(dto.base_amount, '0'),
      percent: this.decimal(dto.percent, '0'),
      amount: this.decimal(dto.amount, '0'),
      status: dto.status ?? SalesCommissionStatus.PENDING,
      due_at: dto.due_at ? new Date(dto.due_at) : null,
      paid_at: dto.paid_at ? new Date(dto.paid_at) : null,
      notes: dto.notes ?? null,
      owner_user: { connect: { id: ownerUserId } },
      ...(dto.sales_goal_id ? { sales_goal: { connect: { id: dto.sales_goal_id } } } : {}),
    });

    return this.findCommissionById(user, created.id);
  }

  async updateCommission(user: AuthUser, id: string, dto: UpdateSalesCommissionDto) {
    const existing = await this.repository.findCommissionById(user.tenant_id, id);
    if (!existing) throw new NotFoundException('Sales commission not found');

    const updated = await this.repository.updateCommission(id, user.tenant_id, {
      ...(dto.sales_goal_id !== undefined ? { sales_goal_id: dto.sales_goal_id ?? null } : {}),
      ...(dto.owner_user_id !== undefined ? { owner_user_id: dto.owner_user_id ?? null } : {}),
      ...(dto.source_type !== undefined ? { source_type: dto.source_type } : {}),
      ...(dto.source_id !== undefined ? { source_id: dto.source_id ?? null } : {}),
      ...(dto.base_amount !== undefined ? { base_amount: this.decimal(dto.base_amount, '0') } : {}),
      ...(dto.percent !== undefined ? { percent: this.decimal(dto.percent, '0') } : {}),
      ...(dto.amount !== undefined ? { amount: this.decimal(dto.amount, '0') } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.due_at !== undefined ? { due_at: dto.due_at ? new Date(dto.due_at) : null } : {}),
      ...(dto.paid_at !== undefined ? { paid_at: dto.paid_at ? new Date(dto.paid_at) : null } : {}),
      ...(dto.notes !== undefined ? { notes: dto.notes ?? null } : {}),
      updated_at: new Date(),
    });

    if (!updated) throw new NotFoundException('Sales commission not found');
    return updated;
  }

  async removeCommission(user: AuthUser, id: string) {
    const removed = await this.repository.removeCommission(id, user.tenant_id);
    if (!removed) throw new NotFoundException('Sales commission not found');
    return removed;
  }

  private decimal(value: string | number | null | undefined, fallback = '0') {
    const raw = value == null ? fallback : String(value);
    return new Prisma.Decimal(raw);
  }
}
