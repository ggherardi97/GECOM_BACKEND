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
          user_id: data.user_id,
          phone: data.phone,
          company_number: data.company_number,
          sector: data.sector,
          category: data.category,
          address_line: data.address_line,
          address_street: data.address_street,
          address_number: data.address_number,
          address_city: data.address_city,
          address_country: data.address_country,
        },
      });
    return null;
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
        users: {
          select: {
            id: true,
            full_name: true,
            email: true,
          },
        },
      },
      orderBy: {
        created_at: 'desc',
      },
    });
  }

  async findById(id: string): Promise<companies | null> {
    return await this.prisma.companies.findUnique({
      where: { id, deleted_at: null },
      include: {
        users: {
          select: {
            id: true,
            full_name: true,
            email: true,
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
      return await this.prisma.companies.update({
      where: { id },
      data: {
        ...data,
        user_id: data.user_id,
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
      where: { id, deleted_at: null },
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
