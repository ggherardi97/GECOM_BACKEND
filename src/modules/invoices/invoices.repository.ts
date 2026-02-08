import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { handlePrismaError } from '../utils/errors';
import { Prisma } from '@prisma/client';

@Injectable()
export class InvoiceRepository {
  private logger = new Logger(InvoiceRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: { tenantId: string; company_id?: string; status?: number }) {
    try {
      return await this.prisma.invoices.findMany({
        where: {
          tenant_id: params.tenantId,
          ...(params.company_id ? { company_id: params.company_id } : {}),
          ...(params.status !== undefined ? { status: params.status } : {}),
        } as any,
        orderBy: { created_at: 'desc' },
        include: {
          invoice_lines: true,
          currencies: true,
          companies: true,
        },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching invoices');
    }
  }

  async findById(id: string, tenantId: string) {
    try {
      // IMPORTANT: tenant-safe (do not use findUnique by id only)
      return await this.prisma.invoices.findFirst({
        where: { id, tenant_id: tenantId } as any,
        include: {
          invoice_lines: true,
          currencies: true,
          companies: true,
        },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching invoice by id');
    }
  }

  async create(data: Prisma.invoicesCreateInput) {
    try {
      // tenant_id is injected by Prisma middleware in create (per your architecture)
      return await this.prisma.invoices.create({
        data,
        include: {
          invoice_lines: true,
          currencies: true,
          companies: true,
        },
      });
    } catch (e) {
      this.logger.error(e);
      return null;
    }
  }

  async update(id: string, tenantId: string, data: Prisma.invoicesUpdateManyMutationInput) {
    try {
      // IMPORTANT: updateMany supports filtering by tenant_id
      const result = await this.prisma.invoices.updateMany({
        where: { id, tenant_id: tenantId } as any,
        data,
      });

      if (!result || result.count === 0) return null;

      return await this.findById(id, tenantId);
    } catch (error) {
      handlePrismaError(error, 'updating invoice');
    }
  }

  async replaceLines(invoice_id: string, tenantId: string, lines: any[]) {
    try {
      // Delete existing lines only for this tenant
      await this.prisma.invoice_lines.deleteMany({
        where: { invoice_id, tenant_id: tenantId } as any,
      });

      const safeLines: Prisma.invoice_linesCreateManyInput[] = (Array.isArray(lines) ? lines : [])
        .filter(Boolean)
        .map((l: any, idx: number) => {
          // Remove fields that Prisma doesn't accept for invoice_lines.createMany()
          const { id, created_at, updated_at, ...rest } = l || {};

          return {
            ...rest,
            tenant_id: tenantId, // ✅ IMPORTANT: createMany usually bypasses middleware
            invoice_id,
            line_number: Number.isFinite(Number(rest?.line_number)) ? Number(rest.line_number) : idx + 1,
          } as Prisma.invoice_linesCreateManyInput;
        });

      if (safeLines.length > 0) {
        await this.prisma.invoice_lines.createMany({ data: safeLines });
      }
    } catch (error) {
      handlePrismaError(error, 'replacing invoice lines');
    }
  }

  async remove(id: string, tenantId: string) {
    try {
      // Tenant-safe delete using deleteMany
      const existing = await this.findById(id, tenantId);
      if (!existing) return null;

      await this.prisma.invoices.deleteMany({
        where: { id, tenant_id: tenantId } as any,
      });

      return existing;
    } catch (error) {
      handlePrismaError(error, 'deleting invoice');
    }
  }
}
