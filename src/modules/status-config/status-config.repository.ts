import { Injectable } from '@nestjs/common';
import { Prisma, lead_status_enum, status_config_entity } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { handlePrismaError } from '../utils/errors';

@Injectable()
export class StatusConfigRepository {
  constructor(private readonly prisma: PrismaService) {}

  async list(tenantId: string, query?: { entity?: status_config_entity; active?: boolean }) {
    try {
      return await this.prisma.status_configs.findMany({
        where: {
          tenant_id: tenantId,
          ...(query?.entity ? { entity: query.entity } : {}),
          ...(query?.active !== undefined ? { is_active: query.active } : {}),
        },
        orderBy: [{ entity: 'asc' }, { sort_order: 'asc' }, { label: 'asc' }],
      });
    } catch (error) {
      handlePrismaError(error, 'listing status configs');
    }
  }

  async findById(tenantId: string, id: string) {
    try {
      return await this.prisma.status_configs.findFirst({ where: { tenant_id: tenantId, id } });
    } catch (error) {
      handlePrismaError(error, 'finding status config by id');
    }
  }

  async findByEntityAndCode(tenantId: string, entity: status_config_entity, code: string) {
    try {
      return await this.prisma.status_configs.findFirst({
        where: {
          tenant_id: tenantId,
          entity,
          code,
        },
      });
    } catch (error) {
      handlePrismaError(error, 'finding status config by code');
    }
  }

  async create(data: Prisma.status_configsUncheckedCreateInput) {
    try {
      return await this.prisma.status_configs.create({ data });
    } catch (error) {
      handlePrismaError(error, 'creating status config');
    }
  }

  async update(tenantId: string, id: string, data: Prisma.status_configsUpdateManyMutationInput) {
    try {
      const updated = await this.prisma.status_configs.updateMany({
        where: { tenant_id: tenantId, id },
        data: { ...data, updated_at: new Date() },
      });
      if (!updated || updated.count === 0) return null;
      return this.findById(tenantId, id);
    } catch (error) {
      handlePrismaError(error, 'updating status config');
    }
  }

  async remove(tenantId: string, id: string) {
    try {
      const deleted = await this.prisma.status_configs.deleteMany({
        where: { tenant_id: tenantId, id },
      });
      return deleted.count > 0;
    } catch (error) {
      handlePrismaError(error, 'deleting status config');
    }
  }

  async findActiveProcessStatus(tenantId: string, statusValue: number) {
    return this.prisma.status_configs.findFirst({
      where: {
        tenant_id: tenantId,
        entity: status_config_entity.PROCESS,
        is_active: true,
        legacy_int_value: statusValue,
      },
    });
  }

  async findActiveById(tenantId: string, entity: status_config_entity, id: string) {
    return this.prisma.status_configs.findFirst({
      where: {
        tenant_id: tenantId,
        entity,
        id,
        is_active: true,
      },
    });
  }

  async findActiveByCode(tenantId: string, entity: status_config_entity, code: string) {
    return this.prisma.status_configs.findFirst({
      where: {
        tenant_id: tenantId,
        entity,
        code,
        is_active: true,
      },
    });
  }

  async findFirstActiveByEntity(tenantId: string, entity: status_config_entity) {
    return this.prisma.status_configs.findFirst({
      where: {
        tenant_id: tenantId,
        entity,
        is_active: true,
      },
      orderBy: [{ sort_order: 'asc' }, { label: 'asc' }],
    });
  }

  async findActiveInvoiceStatus(tenantId: string, statusValue: number) {
    return this.prisma.status_configs.findFirst({
      where: {
        tenant_id: tenantId,
        entity: status_config_entity.INVOICE,
        is_active: true,
        legacy_int_value: statusValue,
      },
    });
  }

  async findActiveLeadStatus(tenantId: string, statusValue: lead_status_enum) {
    return this.prisma.status_configs.findFirst({
      where: {
        tenant_id: tenantId,
        entity: status_config_entity.LEAD,
        is_active: true,
        legacy_lead_status: statusValue,
      },
    });
  }

  async createMany(data: Prisma.status_configsCreateManyInput[]) {
    return this.prisma.status_configs.createMany({
      data,
      skipDuplicates: true,
    });
  }

  async countByTenant(tenantId: string) {
    return this.prisma.status_configs.count({
      where: { tenant_id: tenantId },
    });
  }
}

