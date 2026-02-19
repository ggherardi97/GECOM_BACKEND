import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const tenantSelect = {
  id: true,
  name: true,
  slug: true,
  company_id: true,
  status: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
  company: {
    select: {
      id: true,
      company_name: true,
    },
  },
} satisfies Prisma.tenantsSelect;

export type TenantSafe = Prisma.tenantsGetPayload<{
  select: typeof tenantSelect;
}>;

@Injectable()
export class TenantRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.tenantsCreateInput): Promise<TenantSafe> {
    return this.prisma.tenants.create({
      data,
      select: tenantSelect,
    });
  }

  async findAll(): Promise<TenantSafe[]> {
    return this.prisma.tenants.findMany({
      where: {
        deleted_at: null,
      },
      orderBy: {
        created_at: 'desc',
      },
      select: tenantSelect,
    });
  }

  async findById(id: string): Promise<TenantSafe | null> {
    return this.prisma.tenants.findFirst({
      where: {
        id,
        deleted_at: null,
      },
      select: tenantSelect,
    });
  }

  async update(id: string, data: Prisma.tenantsUpdateInput): Promise<TenantSafe | null> {
    const result = await this.prisma.tenants.updateMany({
      where: {
        id,
        deleted_at: null,
      },
      data: {
        ...(data as any),
        updated_at: new Date(),
      },
    });

    if (!result || result.count === 0) return null;
    return this.findById(id);
  }

  async remove(id: string): Promise<boolean> {
    const result = await this.prisma.tenants.updateMany({
      where: {
        id,
        deleted_at: null,
      },
      data: {
        deleted_at: new Date(),
        updated_at: new Date(),
      },
    });

    return !!result && result.count > 0;
  }
}
