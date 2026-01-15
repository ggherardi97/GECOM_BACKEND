import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { handlePrismaError } from '../utils/errors';
import { Prisma } from '@prisma/client';

@Injectable()
export class InvoiceLineRepository {
  private logger = new Logger(InvoiceLineRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(params?: { invoice_id?: string; product_id?: string }) {
    try {
      const where: Prisma.invoice_linesWhereInput = {
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

  async findById(id: string) {
    try {
      return await this.prisma.invoice_lines.findUnique({
        where: { id },
        include: {
          invoices: true,
          products: true,
        },
      });
    } catch (error) {
      handlePrismaError(error, 'fetching invoice line by id');
    }
  }

  async create(data: Prisma.invoice_linesCreateInput) {
    try {
      return await this.prisma.invoice_lines.create({
        data,
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

  async update(id: string, data: Prisma.invoice_linesUpdateInput) {
    try {
      return await this.prisma.invoice_lines.update({
        where: { id },
        data,
        include: {
          invoices: true,
          products: true,
        },
      });
    } catch (error) {
      handlePrismaError(error, 'updating invoice line');
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.invoice_lines.delete({ where: { id } });
    } catch (error) {
      handlePrismaError(error, 'deleting invoice line');
    }
  }
}