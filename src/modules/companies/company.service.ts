import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyRepository } from './company.repository';
import { CreateCompanyDTO } from './dto/create.dto';
import { UpdateCompanyDTO } from './dto/update.dto';
import { companies } from '@prisma/client';

@Injectable()
export class CompanyService {
  constructor(private readonly repository: CompanyRepository) {}

  async create(data: CreateCompanyDTO): Promise<companies> {
    const company = await this.repository.create(data);

    if (!company) {
      throw new BadRequestException('Failed to create company');
    }

    return company;
  }

  async findAll(): Promise<companies[]> {
    return this.repository.findAll();
  }

  async findById(id: string): Promise<companies> {
    const company = await this.repository.findById(id);
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async findByUserId(userId: string): Promise<companies[]> {
    return this.repository.findByUserId(userId);
  }

  async update(id: string, data: UpdateCompanyDTO): Promise<companies> {
    const company = await this.repository.findById(id);
    if (!company) throw new NotFoundException('Company not found');

    return this.repository.update(id, data);
  }

  async remove(id: string): Promise<companies> {
    const company = await this.repository.findById(id);
    if (!company) throw new NotFoundException('Company not found');

    return this.repository.remove(id);
  }
}
