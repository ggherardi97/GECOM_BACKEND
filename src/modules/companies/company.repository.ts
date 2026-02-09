import { Injectable, Logger } from '@nestjs/common';
import { Prisma, companies } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class CompanyRepository {
  private readonly logger = new Logger(CompanyRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: Prisma.companiesCreateInput, tenantId: string): Promise<companies | null> {
    try {
      // IMPORTANT: ensure tenant_id is set explicitly
      return await this.prisma.companies.create({
        data: {
          ...(data as any),
          tenant_id: tenantId,
        },
      });
    } catch (error) {
      this.logger.error('Error creating company:', error as any);
      return null;
    }
  }

  async findAll(tenantId: string): Promise<companies[]> {
    return this.prisma.companies.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
      } as any,
      orderBy: { company_name: 'asc' },
      include: {
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
      },
    });
  }

  async findById(id: string, tenantId: string): Promise<companies | null> {
    return this.prisma.companies.findFirst({
      where: {
        id,
        tenant_id: tenantId,
        deleted_at: null,
      } as any,
      include: {
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
      },
    });
  }

  async findByUserId(userId: string, tenantId: string): Promise<companies[]> {
    return this.prisma.companies.findMany({
      where: {
        tenant_id: tenantId,
        deleted_at: null,
        user_id: userId,
      } as any,
      orderBy: { company_name: 'asc' },
      include: {
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
      },
    });
  }

  async update(id: string, tenantId: string, data: Prisma.companiesUpdateInput): Promise<companies | null> {
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

      // 2) Build update payload
      const updateData: Prisma.companiesUpdateInput = {
        ...rest,
        updated_at: new Date(),
        ...(user_id
          ? {
              primaryUser: {
                connect: { id: String(user_id) },
              },
            }
          : {}),
      };

      // 3) Tenant-safe update.
      // IMPORTANT: prisma.update() only accepts WhereUniqueInput.
      // To enforce tenant_id in the write path, we use updateMany + count check.
      const result = await this.prisma.companies.updateMany({
        where: {
          id,
          tenant_id: tenantId,
          deleted_at: null,
        } as any,
        data: updateData as any,
      });

      if (!result || result.count === 0) {
        return null;
      }

      // 4) Return updated record with includes
      return await this.findById(id, tenantId);
    } catch (error) {
      this.logger.error('Error updating company:', error as any);
      throw error;
    }
  }

  async remove(id: string, tenantId: string): Promise<boolean> {
    // Soft delete (mark deleted_at) and tenant-safe
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
