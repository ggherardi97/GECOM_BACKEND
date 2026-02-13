import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Helpers to convert base64/dataURL images into Bytes (bytea) for Prisma.
 */
function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

/**
 * Accepts:
 * - dataURL: "data:image/png;base64,AAAA..."
 * - pure base64: "AAAA..."
 * Returns Uint8Array bytes
 */
function base64ToBytes(input: string): Uint8Array {
  const trimmed = input.trim();
  const base64 = trimmed.startsWith('data:') ? (trimmed.split(',')[1] ?? '') : trimmed;

  if (!isNonEmptyString(base64)) return new Uint8Array();

  return Uint8Array.from(Buffer.from(base64, 'base64'));
}

/**
 * ✅ "Lite" select: includes ALL scalar fields from model companies
 * EXCEPT company_picture (to keep payload fast).
 */
const companySelectLite = {
  id: true,
  tenant_id: true,
  company_name: true,
  user_id: true,
  phone: true,
  company_number: true,
  sector: true,
  category: true,
  address_line: true,
  address_street: true,
  address_number: true,
  address_city: true,
  address_country: true,
  created_at: true,
  updated_at: true,
  deleted_at: true,
  address_postalcode: true,
  address_state: true,
  number_of_invoices: true,
  language: true,

  // ❌ intentionally excluded:
  // company_picture: true,
} satisfies Prisma.companiesSelect;

const companySelectLiteWithIncludes = {
  ...companySelectLite,
  primaryUser: {
    select: {
      id: true,
      full_name: true,
      email: true,
      status: true,
      phonenumber: true,
      role: true,
    },
  },
  users: {
    select: {
      id: true,
      full_name: true,
      email: true,
      status: true,
      phonenumber: true,
      role: true,
      company_id: true,
    },
  },
} satisfies Prisma.companiesSelect;

export type CompanySafe = Prisma.companiesGetPayload<{
  select: typeof companySelectLiteWithIncludes;
}>;

const companySelectSummary = {
  id: true,
  tenant_id: true,
  company_name: true,
  user_id: true,
  phone: true,
  company_number: true,
  sector: true,
  category: true,
  number_of_invoices: true,
  created_at: true,
  primaryUser: {
    select: {
      id: true,
      full_name: true,
      email: true,
      status: true,
      phonenumber: true,
      role: true,
    },
  },
} satisfies Prisma.companiesSelect;

export type CompanySummary = Prisma.companiesGetPayload<{
  select: typeof companySelectSummary;
}>;

const companySelectIdName = {
  id: true,
  company_name: true,
} satisfies Prisma.companiesSelect;

export type CompanyIdName = Prisma.companiesGetPayload<{
  select: typeof companySelectIdName;
}>;

@Injectable()
export class CompanyRepository {
  private readonly logger = new Logger(CompanyRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.companiesCreateInput, tenantId: string): Promise<CompanySafe | null> {
    try {
      return await this.prisma.companies.create({
        data: {
          ...(data as any),
          tenant_id: tenantId,
        },
        select: companySelectLiteWithIncludes,
      });
    } catch (error) {
      this.logger.error('Error creating company:', error as any);
      return null;
    }
  }

  async findAll(tenantId: string, fields?: string): Promise<CompanySafe[] | CompanySummary[] | CompanyIdName[]> {
    const mode = String(fields ?? '').toLowerCase();

    if (mode === 'select') {
      return this.prisma.companies.findMany({
        where: {
          tenant_id: tenantId,
          deleted_at: null,
        } as any,
        orderBy: { company_name: 'asc' },
        select: companySelectIdName,
      });
    }

    if (mode === 'summary') {
      return this.prisma.companies.findMany({
        where: {
          tenant_id: tenantId,
          deleted_at: null,
        } as any,
        orderBy: { company_name: 'asc' },
        select: companySelectSummary,
      });
    }

    return this.prisma.companies.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
      } as any,
      orderBy: { company_name: 'asc' },
      select: companySelectLiteWithIncludes,
    });
  }

  async findById(id: string, tenantId: string): Promise<CompanySafe | null> {
    return this.prisma.companies.findFirst({
      where: {
        id,
        tenant_id: tenantId,
        deleted_at: null,
      } as any,
      select: companySelectLiteWithIncludes,
    });
  }

  async findByUserId(userId: string, tenantId: string): Promise<CompanySafe[]> {
    return this.prisma.companies.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        user_id: userId,
      } as any,
      orderBy: { company_name: 'asc' },
      select: companySelectLiteWithIncludes,
    });
  }

  async update(id: string, tenantId: string, data: Prisma.companiesUpdateInput): Promise<CompanySafe | null> {
    try {
      // 1) Avoid forcing/allowing unsafe fields
      const {
        id: _ignoreId,
        tenant_id: _ignoreTenantId,
        created_at: _ignoreCreatedAt,
        deleted_at: _ignoreDeletedAt,
        updated_at: _ignoreUpdatedAt,
        user_id,
        ...rest
      } = data as any;

      // 1.1) Normalize company_picture: allow base64/dataURL string, persist as Bytes (bytea)
      const normalizedRest: any = { ...rest };

      if (Object.prototype.hasOwnProperty.call(rest as any, 'company_picture')) {
        const value = (rest as any).company_picture;

        if (value == null || value === '') {
          normalizedRest.company_picture = null;
        } else if (typeof value === 'string') {
          const bytes = base64ToBytes(value);
          normalizedRest.company_picture = bytes.length > 0 ? (bytes as unknown as Prisma.Bytes) : null;
        } else if (value instanceof Uint8Array) {
          normalizedRest.company_picture = value as unknown as Prisma.Bytes;
        } else {
          throw new Error('company_picture must be a base64/dataURL string, Uint8Array, or null.');
        }
      }

      // 2) Build update payload
      // IMPORTANT: updateMany does NOT allow nested relation updates.
      // So we separate primaryUser connect from updateMany.
      const updateData: Prisma.companiesUpdateManyMutationInput = {
        ...normalizedRest,
        updated_at: new Date(),
      } as any;

      // 3) Tenant-safe update (updateMany + count check)
      const result = await this.prisma.companies.updateMany({
        where: {
          id,
          tenant_id: tenantId,
          deleted_at: null,
        } as any,
        data: updateData,
      });

      if (!result || result.count === 0) return null;

      // 3.1) If user_id was provided, connect primary user using a second call (tenant-safe)
      if (user_id) {
        await this.prisma.companies.updateMany({
          where: {
            id,
            tenant_id: tenantId,
            deleted_at: null,
          } as any,
          data: {
            user_id: String(user_id),
            updated_at: new Date(),
          } as any,
        });
      }

      // 4) Return updated record (lite, without company_picture)
      return await this.findById(id, tenantId);
    } catch (error) {
      this.logger.error('Error updating company:', error as any);
      throw error;
    }
  }

  /**
   * ✅ Dedicated endpoint use: returns ONLY the logo bytes (fast & safe)
   */
  async getCompanyLogoBytes(tenantId: string, companyId: string): Promise<Uint8Array | null> {
    const row = await this.prisma.companies.findFirst({
      where: {
        id: companyId,
        tenant_id: tenantId,
        deleted_at: null,
      } as any,
      select: { company_picture: true },
    });

    return (row?.company_picture as Uint8Array | null) ?? null;
  }

  async remove(id: string, tenantId: string): Promise<boolean> {
    const result = await this.prisma.companies.updateMany({
      where: {
        id,
        tenant_id: tenantId,
        deleted_at: null,
      } as any,
      data: {
        deleted_at: new Date(),
        updated_at: new Date(),
      },
    });

    return !!result && result.count > 0;
  }
}
