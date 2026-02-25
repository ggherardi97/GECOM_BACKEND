import { Injectable, NotFoundException } from '@nestjs/common';
import { SalesApprovalStatus } from '@prisma/client';
import { SalesApprovalsRepository } from './sales-approvals.repository';
import { CreateSalesApprovalDto } from './dto/create-sales-approval.dto';
import { UpdateSalesApprovalDto } from './dto/update-sales-approval.dto';

type AuthUser = {
  id: string;
  tenant_id: string;
};

@Injectable()
export class SalesApprovalsService {
  constructor(private readonly repository: SalesApprovalsRepository) {}

  async list(user: AuthUser, query: { q?: string; status?: string; entity_type?: string }) {
    const rawStatus = String(query.status || '').trim().toUpperCase();
    const status = rawStatus && rawStatus in SalesApprovalStatus ? (rawStatus as SalesApprovalStatus) : undefined;

    return this.repository.list({
      tenantId: user.tenant_id,
      q: query.q,
      status,
      entityType: query.entity_type,
    });
  }

  async findById(user: AuthUser, id: string) {
    const found = await this.repository.findById(user.tenant_id, id);
    if (!found) throw new NotFoundException('Sales approval not found');
    return found;
  }

  async create(user: AuthUser, dto: CreateSalesApprovalDto) {
    const created = await this.repository.create({
      tenant_id: user.tenant_id,
      entity_type: dto.entity_type,
      entity_id: dto.entity_id,
      status: dto.status ?? SalesApprovalStatus.PENDING,
      title: dto.title,
      description: dto.description ?? null,
      amount: dto.amount != null ? dto.amount : null,
      requested_at: new Date(),
      requested_by_user: { connect: { id: user.id } },
      ...(dto.opportunity_id ? { opportunity: { connect: { id: dto.opportunity_id } } } : {}),
      ...(dto.status && dto.status !== SalesApprovalStatus.PENDING
        ? {
            resolved_at: new Date(),
            resolution_note: dto.resolution_note ?? null,
            resolved_by_user: { connect: { id: user.id } },
          }
        : {}),
    });

    return this.findById(user, created.id);
  }

  async update(user: AuthUser, id: string, dto: UpdateSalesApprovalDto) {
    const existing = await this.repository.findById(user.tenant_id, id);
    if (!existing) throw new NotFoundException('Sales approval not found');

    const isResolved =
      dto.status === SalesApprovalStatus.APPROVED ||
      dto.status === SalesApprovalStatus.REJECTED ||
      dto.status === SalesApprovalStatus.CANCELLED;

    const updated = await this.repository.update(id, user.tenant_id, {
      ...(dto.entity_type !== undefined ? { entity_type: dto.entity_type } : {}),
      ...(dto.entity_id !== undefined ? { entity_id: dto.entity_id } : {}),
      ...(dto.opportunity_id !== undefined ? { opportunity_id: dto.opportunity_id ?? null } : {}),
      ...(dto.title !== undefined ? { title: dto.title } : {}),
      ...(dto.description !== undefined ? { description: dto.description ?? null } : {}),
      ...(dto.amount !== undefined ? { amount: dto.amount ?? null } : {}),
      ...(dto.status !== undefined ? { status: dto.status } : {}),
      ...(dto.resolution_note !== undefined ? { resolution_note: dto.resolution_note ?? null } : {}),
      ...(isResolved
        ? {
            resolved_at: new Date(),
            resolved_by_user_id: user.id,
          }
        : {}),
      updated_at: new Date(),
    });

    if (!updated) throw new NotFoundException('Sales approval not found');
    return updated;
  }

  async remove(user: AuthUser, id: string) {
    const removed = await this.repository.remove(id, user.tenant_id);
    if (!removed) throw new NotFoundException('Sales approval not found');
    return removed;
  }
}
