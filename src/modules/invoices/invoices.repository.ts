import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateInvoiceDTO } from './dto/create.dto';
import { UpdateInvoiceDTO } from './dto/update.dto';
import { handlePrismaError } from '../utils/errors';
import { Prisma } from '@prisma/client';

@Injectable()
export class InvoiceRepository {
  private logger = new Logger(InvoiceRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async findAll(params?: { company_id?: string; status?: number }) {
    try {
      return await this.prisma.invoices.findMany({
        where: {
          ...(params?.company_id ? { company_id: params.company_id } : {}),
          ...(params?.status !== undefined ? { status: params.status } : {}),
        },
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

  async findById(id: string) {
    try {
      return await this.prisma.invoices.findUnique({
        where: { id },
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

  async update(id: string, data: Prisma.invoicesUpdateInput) {
    try {
      return await this.prisma.invoices.update({
        where: { id },
        data,
        include: {
          invoice_lines: true,
          currencies: true,
          companies: true,
        },
      });
    } catch (error) {
      handlePrismaError(error, 'updating invoice');
    }
  }

  async replaceLines(invoice_id: string, lines: Prisma.invoice_linesCreateManyInput[]) {
    try {
      await this.prisma.invoice_lines.deleteMany({ where: { invoice_id } });

      if (lines.length > 0) {
        await this.prisma.invoice_lines.createMany({ data: lines });
      }
    } catch (error) {
      handlePrismaError(error, 'replacing invoice lines');
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.invoices.delete({ where: { id } });
    } catch (error) {
      handlePrismaError(error, 'deleting invoice');
    }
  }
}