import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { handlePrismaError } from '../utils/errors';
import { Prisma } from '@prisma/client';

type InvoiceFindAllParams = {
  tenantId: string;
  company_id?: string;
  status?: number;
  status_config_id?: string;
  fields?: string;
};

@Injectable()
export class InvoiceRepository {
  private logger = new Logger(InvoiceRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(params: InvoiceFindAllParams) {
    try {
      const where = {
        tenant_id: params.tenantId,
        ...(params.company_id ? { company_id: params.company_id } : {}),
        ...(params.status_config_id ? { status_config_id: params.status_config_id } : {}),
        ...(params.status !== undefined ? { status: params.status } : {}),
      } as any;

      // ✅ lightweight mode: only what dashboard/client details need
      if (params.fields === 'summary') {
        return await this.prisma.invoices.findMany({
          where,
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            total: true,
            quote_at: true,
            created_at: true,
            status: true,
            status_config_id: true,
            company_id: true,
            currency_id: true,
            currencies: {
              select: {
                id: true,
                code: true,
                symbol: true,
                decimals: true,
              },
            },
            status_config: {
              select: {
                id: true,
                code: true,
                label: true,
                color: true,
                entity: true,
              },
            },
          },
        });
      }

      if (params.fields === 'header') {
        return await this.prisma.invoices.findMany({
          where,
          orderBy: { created_at: 'desc' },
          select: {
            id: true,
            total: true,
            invoice_number:true,
            subtotal:true,
            discount_amount: true,
            tax_total:true,
            due_at:true,
            quote_at: true,
            created_at: true,
            status: true,
            status_config_id: true,
            company_id: true,
            currency_id: true,
            status_config: {
              select: {
                id: true,
                code: true,
                label: true,
                color: true,
                entity: true,
              },
            },
            currencies: {
              select: {
                id: true,
                code: true,
                symbol: true,
                decimals: true,
              },
            },
            companies: {
              select:{
                company_name:true,
                id:true,
              }
            }
          },
        });
      }

      // ✅ full mode (existing behavior)
      return await this.prisma.invoices.findMany({
        where,
        orderBy: { created_at: 'desc' },
        include: {
          invoice_lines: true,
          currencies: true,
          companies: true,
          status_config: true,
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
          status_config: true,
        },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching invoice by id');
    }
  }

  async create(data: Prisma.invoicesCreateInput) {
    try {
      return await this.prisma.transaction(async (tx) => {
        const created = await tx.invoices.create({
          data,
          include: {
            invoice_lines: true,
            currencies: true,
            companies: true,
            status_config: true,
          },
        });

        if (created.company_id && created.tenant_id) {
          await tx.companies.updateMany({
            where: {
              id: created.company_id,
              tenant_id: created.tenant_id,
            } as any,
            data: {
              number_of_invoices: { increment: 1 },
            },
          });
        }

        return created;
      });
    } catch (e) {
      this.logger.error(e);
      handlePrismaError(e, 'creating invoice');
    }
  }

  async update(id: string, tenantId: string, data: Prisma.invoicesUpdateManyMutationInput) {
    try {
      return await this.prisma.transaction(async (tx) => {
        const before = await tx.invoices.findFirst({
          where: { id, tenant_id: tenantId } as any,
          select: { company_id: true },
        });

        if (!before) return null;

        const result = await tx.invoices.updateMany({
          where: { id, tenant_id: tenantId } as any,
          data,
        });

        if (!result || result.count === 0) return null;

        const after = await tx.invoices.findFirst({
          where: { id, tenant_id: tenantId } as any,
          select: { company_id: true },
        });

        if (before.company_id !== after?.company_id) {
          if (before.company_id) {
            await tx.companies.updateMany({
              where: {
                id: before.company_id,
                tenant_id: tenantId,
              } as any,
              data: {
                number_of_invoices: { decrement: 1 },
              },
            });
          }

          if (after?.company_id) {
            await tx.companies.updateMany({
              where: {
                id: after.company_id,
                tenant_id: tenantId,
              } as any,
              data: {
                number_of_invoices: { increment: 1 },
              },
            });
          }
        }

        return this.findById(id, tenantId);
      });
    } catch (error) {
      handlePrismaError(error, 'updating invoice');
    }
  }

  async replaceLines(invoice_id: string, tenantId: string, lines: any[]) {
    try {
      await this.prisma.invoice_lines.deleteMany({
        where: { invoice_id, tenant_id: tenantId } as any,
      });

      const safeLines: Prisma.invoice_linesCreateManyInput[] = (Array.isArray(lines) ? lines : [])
        .filter(Boolean)
        .map((l: any, idx: number) => {
          const { id, created_at, updated_at, ...rest } = l || {};

          return {
            ...rest,
            tenant_id: tenantId,
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
      return await this.prisma.transaction(async (tx) => {
        const existing = await tx.invoices.findFirst({
          where: { id, tenant_id: tenantId } as any,
          select: { id: true, company_id: true },
        });

        if (!existing) return null;

        await tx.invoices.deleteMany({
          where: { id, tenant_id: tenantId } as any,
        });

        if (existing.company_id) {
          await tx.companies.updateMany({
            where: {
              id: existing.company_id,
              tenant_id: tenantId,
            } as any,
            data: {
              number_of_invoices: { decrement: 1 },
            },
          });
        }

        return existing;
      });
    } catch (error) {
      handlePrismaError(error, 'deleting invoice');
    }
  }
}
