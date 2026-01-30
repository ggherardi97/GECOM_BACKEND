import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateCompanyDTO } from './dto/create.dto';
import { UpdateCompanyDTO } from './dto/update.dto';
import { companies } from '@prisma/client';

@Injectable()
export class CompanyRepository {
  private logger = new Logger(CompanyRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateCompanyDTO): Promise<companies | null> {
    try {
      return await this.prisma.companies.create({
        data: {
          company_name: data.company_name,
          // ✅ agora pode ser null
          primaryUser: {
            connect: {
              id: data.user_id,
            },
          },

          phone: data.phone ?? null,
          company_number: data.company_number ?? null,
          sector: data.sector ?? null,
          category: data.category ?? null,

          address_line: data.address_line ?? null,
          address_street: data.address_street ?? null,
          address_number: data.address_number ?? null,
          address_city: data.address_city ?? null,
          address_country: data.address_country ?? null,

          address_postalcode: data.address_postalcode ?? null,
          address_state: data.address_state ?? null,
          number_of_invoices: data.number_of_invoices ?? 0,
          language: data.language ?? null,
        },
      });
    } catch (e) {
      this.logger.error('Error creating company:', e);
      return null;
    }
  }

  async findAll(): Promise<companies[]> {
    return await this.prisma.companies.findMany({
      where: {
        deleted_at: null,
      },
      include: {
        // Primary contact (companies.user_id -> users.id)
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
        // Users that belong to the company (users.company_id -> companies.id)
        users: {
          select: {
            id: true,
            full_name: true,
            email: true,
            status: true,
            phonenumber: true,
            role: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  async findById(id: string): Promise<companies | null> {
    return await this.prisma.companies.findFirst({
      where: { id, deleted_at: null },
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
          },
        },
      },
    });
  }

  async findByUserId(userId: string): Promise<companies[]> {
    return await this.prisma.companies.findMany({
      where: {
        user_id: userId,
        deleted_at: null,
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  async update(id: string, data: UpdateCompanyDTO): Promise<companies> {
    try {
      // Avoid forcing user_id if it was not provided
      const { user_id, ...rest } = data as any;

      return await this.prisma.companies.update({
        where: { id },
        data: {
          ...rest,
          ...(user_id ? { user_id } : {}),
          updated_at: new Date(),
        },
      });
    } catch (error) {
      this.logger.error('Error updating company:', error);
      throw new BadRequestException('Error updating company');
    }
  }

  async remove(id: string): Promise<companies> {
    try {
      return await this.prisma.companies.update({
        where: { id },
        data: {
          deleted_at: new Date(),
        },
      });
    } catch (error) {
      this.logger.error('Error removing company:', error);
      throw new BadRequestException('Error removing company');
    }
  }

  async hardDelete(id: string): Promise<companies> {
    try {
      return await this.prisma.companies.delete({
        where: { id },
      });
    } catch (error) {
      this.logger.error('Error hard deleting company:', error);
      throw new BadRequestException('Error hard deleting company');
    }
  }
}
