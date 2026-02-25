import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { lead_status_enum, status_config_entity, status_configs } from '@prisma/client';
import { CreateStatusConfigDto } from './dto/create-status-config.dto';
import { UpdateStatusConfigDto } from './dto/update-status-config.dto';
import { StatusConfigRepository } from './status-config.repository';

@Injectable()
export class StatusConfigService {
  constructor(private readonly repository: StatusConfigRepository) {}

  async list(tenantId: string, query?: { entity?: status_config_entity; active?: string }) {
    const active =
      query?.active !== undefined && String(query.active).trim().length > 0
        ? String(query.active).toLowerCase() === 'true'
        : undefined;

    return this.repository.list(tenantId, {
      entity: query?.entity,
      active,
    });
  }

  async create(tenantId: string, dto: CreateStatusConfigDto) {
    this.validateEntityLegacyBinding(dto.entity, dto.legacy_int_value, dto.legacy_lead_status);

    const code = String(dto.code).trim().toUpperCase();
    const existing = await this.repository.findByEntityAndCode(tenantId, dto.entity, code);
    if (existing) {
      throw new BadRequestException('Codigo de status ja existe para esta entidade.');
    }

    return this.repository.create({
      tenant_id: tenantId,
      entity: dto.entity,
      code,
      label: dto.label.trim(),
      color: dto.color?.trim() || null,
      sort_order: dto.sort_order ?? 0,
      is_active: dto.is_active ?? true,
      is_system: false,
      legacy_int_value: dto.legacy_int_value ?? null,
      legacy_lead_status: dto.legacy_lead_status ?? null,
      updated_at: new Date(),
    });
  }

  async update(tenantId: string, id: string, dto: UpdateStatusConfigDto) {
    const existing = await this.repository.findById(tenantId, id);
    if (!existing) throw new NotFoundException('Configuracao de status nao encontrada.');

    const entity = dto.entity ?? existing.entity;
    const legacyInt = dto.legacy_int_value !== undefined ? dto.legacy_int_value : existing.legacy_int_value;
    const legacyLead =
      dto.legacy_lead_status !== undefined ? dto.legacy_lead_status : existing.legacy_lead_status;

    this.validateEntityLegacyBinding(entity, legacyInt ?? undefined, legacyLead ?? undefined);

    const nextCode = dto.code !== undefined ? String(dto.code).trim().toUpperCase() : existing.code;
    if (nextCode !== existing.code) {
      const duplicate = await this.repository.findByEntityAndCode(tenantId, entity, nextCode);
      if (duplicate && duplicate.id !== id) {
        throw new BadRequestException('Codigo de status ja existe para esta entidade.');
      }
    }

    return this.repository.update(tenantId, id, {
      ...(dto.entity !== undefined ? { entity: dto.entity } : {}),
      ...(dto.code !== undefined ? { code: nextCode } : {}),
      ...(dto.label !== undefined ? { label: dto.label.trim() } : {}),
      ...(dto.color !== undefined ? { color: dto.color?.trim() || null } : {}),
      ...(dto.sort_order !== undefined ? { sort_order: dto.sort_order } : {}),
      ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
      ...(dto.legacy_int_value !== undefined ? { legacy_int_value: dto.legacy_int_value } : {}),
      ...(dto.legacy_lead_status !== undefined ? { legacy_lead_status: dto.legacy_lead_status } : {}),
    });
  }

  async remove(tenantId: string, id: string) {
    const existing = await this.repository.findById(tenantId, id);
    if (!existing) throw new NotFoundException('Configuracao de status nao encontrada.');
    if (existing.is_system) {
      throw new BadRequestException('Nao e permitido remover status do sistema.');
    }

    const removed = await this.repository.remove(tenantId, id);
    if (!removed) throw new NotFoundException('Configuracao de status nao encontrada.');

    return { ok: true };
  }

  async seedDefaults(tenantId: string) {
    const rows = [
      { tenant_id: tenantId, entity: status_config_entity.PROCESS, code: 'PENDING', label: 'Pendente', legacy_int_value: 0, sort_order: 0, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.PROCESS, code: 'IN_PROGRESS', label: 'Em andamento', legacy_int_value: 1, sort_order: 1, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.PROCESS, code: 'AWAITING_APPROVAL', label: 'Aguardando aprovacao', legacy_int_value: 2, sort_order: 2, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.PROCESS, code: 'APPROVED', label: 'Aprovado', legacy_int_value: 3, sort_order: 3, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.PROCESS, code: 'IN_PRODUCTION', label: 'Em producao', legacy_int_value: 4, sort_order: 4, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.PROCESS, code: 'SHIPPED', label: 'Enviado', legacy_int_value: 5, sort_order: 5, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.PROCESS, code: 'DELIVERED', label: 'Entregue', legacy_int_value: 6, sort_order: 6, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.PROCESS, code: 'CANCELLED', label: 'Cancelado', legacy_int_value: 7, sort_order: 7, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.PROCESS, code: 'COMPLETED', label: 'Concluido', legacy_int_value: 8, sort_order: 8, is_active: true, is_system: true },

      { tenant_id: tenantId, entity: status_config_entity.INVOICE, code: 'DRAFT', label: 'Rascunho', legacy_int_value: 0, sort_order: 0, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.INVOICE, code: 'ACTIVE', label: 'Ativa', legacy_int_value: 1, sort_order: 1, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.INVOICE, code: 'EXPIRED', label: 'Expirada', legacy_int_value: 2, sort_order: 2, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.INVOICE, code: 'INVOICED', label: 'Faturada', legacy_int_value: 3, sort_order: 3, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.INVOICE, code: 'PAID', label: 'Paga', legacy_int_value: 4, sort_order: 4, is_active: true, is_system: true },

      { tenant_id: tenantId, entity: status_config_entity.LEAD, code: 'NEW', label: 'Novo', legacy_lead_status: lead_status_enum.NEW, sort_order: 0, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.LEAD, code: 'WORKING', label: 'Em andamento', legacy_lead_status: lead_status_enum.WORKING, sort_order: 1, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.LEAD, code: 'QUALIFIED', label: 'Qualificado', legacy_lead_status: lead_status_enum.QUALIFIED, sort_order: 2, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.LEAD, code: 'DISQUALIFIED', label: 'Desqualificado', legacy_lead_status: lead_status_enum.DISQUALIFIED, sort_order: 3, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.LEAD, code: 'CONVERTED', label: 'Convertido', legacy_lead_status: lead_status_enum.CONVERTED, sort_order: 4, is_active: true, is_system: true },

      { tenant_id: tenantId, entity: status_config_entity.OPPORTUNITY, code: 'OPEN', label: 'Aberta', sort_order: 0, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.OPPORTUNITY, code: 'PROPOSAL', label: 'Proposta', sort_order: 1, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.OPPORTUNITY, code: 'WON', label: 'Ganha', sort_order: 2, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.OPPORTUNITY, code: 'LOST', label: 'Perdida', sort_order: 3, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.OPPORTUNITY, code: 'CANCELLED', label: 'Cancelada', sort_order: 4, is_active: true, is_system: true },

      { tenant_id: tenantId, entity: status_config_entity.CONTRACT, code: 'DRAFT', label: 'Rascunho', sort_order: 0, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.CONTRACT, code: 'ACTIVE', label: 'Ativo', sort_order: 1, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.CONTRACT, code: 'SUSPENDED', label: 'Suspenso', sort_order: 2, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.CONTRACT, code: 'CANCELLED', label: 'Cancelado', sort_order: 3, is_active: true, is_system: true },
      { tenant_id: tenantId, entity: status_config_entity.CONTRACT, code: 'EXPIRED', label: 'Expirado', sort_order: 4, is_active: true, is_system: true },
    ];

    const normalized = rows.map((row) => ({
      ...row,
      code: row.code.toUpperCase(),
      updated_at: new Date(),
    }));

    await this.repository.createMany(normalized as any);
    return this.list(tenantId);
  }

  async ensureProcessStatusAllowed(tenantId: string, status: number) {
    await this.resolveProcessStatus(tenantId, { status });
  }

  async ensureInvoiceStatusAllowed(tenantId: string, status: number) {
    await this.resolveInvoiceStatus(tenantId, { status });
  }

  async ensureLeadStatusAllowed(tenantId: string, status: lead_status_enum | string) {
    await this.resolveLeadStatus(tenantId, { status });
  }

  async resolveProcessStatus(
    tenantId: string,
    input: { status?: number | string | null; status_config_id?: string | null },
  ): Promise<{ status: number; statusConfig: status_configs }> {
    await this.ensureDefaultsIfNeeded(tenantId);

    if (input.status_config_id) {
      const byId = await this.repository.findActiveById(
        tenantId,
        status_config_entity.PROCESS,
        String(input.status_config_id),
      );
      if (!byId) {
        throw new BadRequestException('status_config_id de processo invalido ou inativo.');
      }
      if (byId.legacy_int_value === null) {
        throw new BadRequestException('status_config de processo sem legacy_int_value.');
      }
      return { status: Number(byId.legacy_int_value), statusConfig: byId };
    }

    if (input.status !== undefined && input.status !== null && String(input.status).trim().length > 0) {
      const numeric = Number(input.status);
      if (!Number.isNaN(numeric)) {
        const byLegacy = await this.repository.findActiveProcessStatus(tenantId, numeric);
        if (byLegacy) {
          return { status: numeric, statusConfig: byLegacy };
        }
      }

      const byCode = await this.repository.findActiveByCode(
        tenantId,
        status_config_entity.PROCESS,
        this.normalizeCode(String(input.status)),
      );
      if (byCode && byCode.legacy_int_value !== null) {
        return { status: Number(byCode.legacy_int_value), statusConfig: byCode };
      }

      throw new BadRequestException('Status de processo invalido ou inativo para este tenant.');
    }

    const fallback = await this.repository.findFirstActiveByEntity(tenantId, status_config_entity.PROCESS);
    if (!fallback || fallback.legacy_int_value === null) {
      throw new BadRequestException('Nenhum status ativo de processo disponivel para este tenant.');
    }

    return { status: Number(fallback.legacy_int_value), statusConfig: fallback };
  }

  async resolveInvoiceStatus(
    tenantId: string,
    input: { status?: number | string | null; status_config_id?: string | null },
  ): Promise<{ status: number; statusConfig: status_configs }> {
    await this.ensureDefaultsIfNeeded(tenantId);

    if (input.status_config_id) {
      const byId = await this.repository.findActiveById(
        tenantId,
        status_config_entity.INVOICE,
        String(input.status_config_id),
      );
      if (!byId) {
        throw new BadRequestException('status_config_id de invoice invalido ou inativo.');
      }
      if (byId.legacy_int_value === null) {
        throw new BadRequestException('status_config de invoice sem legacy_int_value.');
      }
      return { status: Number(byId.legacy_int_value), statusConfig: byId };
    }

    if (input.status !== undefined && input.status !== null && String(input.status).trim().length > 0) {
      const numeric = Number(input.status);
      if (!Number.isNaN(numeric)) {
        const byLegacy = await this.repository.findActiveInvoiceStatus(tenantId, numeric);
        if (byLegacy) {
          return { status: numeric, statusConfig: byLegacy };
        }
      }

      const byCode = await this.repository.findActiveByCode(
        tenantId,
        status_config_entity.INVOICE,
        this.normalizeCode(String(input.status)),
      );
      if (byCode && byCode.legacy_int_value !== null) {
        return { status: Number(byCode.legacy_int_value), statusConfig: byCode };
      }

      throw new BadRequestException('Status de invoice invalido ou inativo para este tenant.');
    }

    const fallback = await this.repository.findFirstActiveByEntity(tenantId, status_config_entity.INVOICE);
    if (!fallback || fallback.legacy_int_value === null) {
      throw new BadRequestException('Nenhum status ativo de invoice disponivel para este tenant.');
    }

    return { status: Number(fallback.legacy_int_value), statusConfig: fallback };
  }

  async resolveLeadStatus(
    tenantId: string,
    input: { status?: lead_status_enum | string | null; status_config_id?: string | null },
  ): Promise<{ status: lead_status_enum; statusConfig: status_configs }> {
    await this.ensureDefaultsIfNeeded(tenantId);

    if (input.status_config_id) {
      const byId = await this.repository.findActiveById(
        tenantId,
        status_config_entity.LEAD,
        String(input.status_config_id),
      );
      if (!byId) {
        throw new BadRequestException('status_config_id de lead invalido ou inativo.');
      }
      return {
        status: byId.legacy_lead_status ?? this.fallbackLeadStatus(byId.code),
        statusConfig: byId,
      };
    }

    if (input.status !== undefined && input.status !== null && String(input.status).trim().length > 0) {
      const normalized = this.normalizeCode(String(input.status));

      const byCode = await this.repository.findActiveByCode(tenantId, status_config_entity.LEAD, normalized);
      if (byCode) {
        return {
          status: byCode.legacy_lead_status ?? this.fallbackLeadStatus(byCode.code),
          statusConfig: byCode,
        };
      }

      if (Object.values(lead_status_enum).includes(normalized as lead_status_enum)) {
        const byLegacy = await this.repository.findActiveLeadStatus(tenantId, normalized as lead_status_enum);
        if (byLegacy) {
          return {
            status: byLegacy.legacy_lead_status ?? (normalized as lead_status_enum),
            statusConfig: byLegacy,
          };
        }
      }

      throw new BadRequestException('Status de lead invalido ou inativo para este tenant.');
    }

    const byNew = await this.repository.findActiveLeadStatus(tenantId, lead_status_enum.NEW);
    if (byNew) {
      return {
        status: byNew.legacy_lead_status ?? lead_status_enum.NEW,
        statusConfig: byNew,
      };
    }

    const fallback = await this.repository.findFirstActiveByEntity(tenantId, status_config_entity.LEAD);
    if (!fallback) {
      throw new BadRequestException('Nenhum status ativo de lead disponivel para este tenant.');
    }

    return {
      status: fallback.legacy_lead_status ?? this.fallbackLeadStatus(fallback.code),
      statusConfig: fallback,
    };
  }

  private validateEntityLegacyBinding(
    entity: status_config_entity,
    legacyIntValue?: number,
    _legacyLeadStatus?: lead_status_enum,
  ) {
    if (entity === status_config_entity.LEAD) {
      return;
    }

    if (entity === status_config_entity.PROCESS || entity === status_config_entity.INVOICE) {
      if (legacyIntValue === undefined || legacyIntValue === null || Number.isNaN(Number(legacyIntValue))) {
        throw new BadRequestException('legacy_int_value e obrigatorio para PROCESS e INVOICE.');
      }
    }
  }

  private async ensureDefaultsIfNeeded(tenantId: string) {
    const total = await this.repository.countByTenant(tenantId);
    if (total === 0) {
      await this.seedDefaults(tenantId);
    }
  }

  private normalizeCode(value: string): string {
    return String(value).trim().toUpperCase();
  }

  private fallbackLeadStatus(code: string): lead_status_enum {
    const normalized = this.normalizeCode(code);

    if (normalized.includes('CONVERT')) return lead_status_enum.CONVERTED;
    if (normalized.includes('DISQUAL') || normalized.includes('LOST')) return lead_status_enum.DISQUALIFIED;
    if (normalized.includes('QUAL')) return lead_status_enum.QUALIFIED;
    if (normalized.includes('NEW')) return lead_status_enum.NEW;

    return lead_status_enum.WORKING;
  }
}
