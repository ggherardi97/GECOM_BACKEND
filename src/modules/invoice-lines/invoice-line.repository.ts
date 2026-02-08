import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { handlePrismaError } from '../utils/errors';
import { Prisma } from '@prisma/client';

@Injectable()
export class InvoiceLineRepository {
  private logger = new Logger(InvoiceLineRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(tenantId: string, params?: { invoice_id?: string; product_id?: string }) {
    try {
      const where: Prisma.invoice_linesWhereInput = {
        tenant_id: tenantId,
        ...(params?.invoice_id ? { invoice_id: params.invoice_id } : {}),
        ...(params?.product_id ? { product_id: params.product_id } : {}),
      };

      return await this.prisma.invoice_lines.findMany({
        where,
        orderBy: [{ invoice_id: 'asc' }, { line_number: 'asc' }],
        include: {
          invoices: true,
          products: true,
        },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching invoice lines');
    }
  }

  async findById(id: string, tenantId: string) {
    try {
      return await this.prisma.invoice_lines.findFirst({
        where: { id, tenant_id: tenantId } as any,
        include: {
          invoices: true,
          products: true,
        },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching invoice line by id');
    }
  }

  async invoiceExists(invoiceId: string, tenantId: string): Promise<boolean> {
    const found = await this.prisma.invoices.findFirst({
      where: { id: invoiceId, tenant_id: tenantId } as any,
      select: { id: true },
    });

    return !!found;
  }

  async productExists(productId: string, tenantId: string): Promise<boolean> {
    const found = await this.prisma.products.findFirst({
      where: { id: productId, tenant_id: tenantId } as any,
      select: { id: true },
    });

    return !!found;
  }

  async create(tenantId: string, data: Prisma.invoice_linesUncheckedCreateInput) {
    try {
      return await this.prisma.invoice_lines.create({
        data: {
          ...data,
          tenant_id: tenantId, // ✅ explicit, don't rely on middleware
        },
        include: {
          invoices: true,
          products: true,
        },
      });
    } catch (e) {
      this.logger.error(e);
      return null;
    }
  }

  async update(id: string, tenantId: string, data: Prisma.invoice_linesUncheckedUpdateInput) {
    try {
      // IMPORTANT: updateMany allows filtering by tenant_id
      const result = await this.prisma.invoice_lines.updateMany({
        where: { id, tenant_id: tenantId } as any,
        data: {
          ...(data as any),
          id: undefined,        // never allow id change
          tenant_id: undefined, // never allow tenant change
        },
      });

      if (!result || result.count === 0) return null;

      return await this.findById(id, tenantId);
    } catch (error) {
      handlePrismaError(error, 'updating invoice line');
    }
  }

  async remove(id: string, tenantId: string) {
    try {
      const result = await this.prisma.invoice_lines.deleteMany({
        where: { id, tenant_id: tenantId } as any,
      });

      return !!result && result.count > 0;
    } catch (error) {
      handlePrismaError(error, 'deleting invoice line');
    }
  }
}
