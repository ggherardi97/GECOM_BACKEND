import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CompanyRepository, CompanySafe } from './company.repository';
import { CreateCompanyDTO } from './dto/create.dto';
import { UpdateCompanyDTO } from './dto/update.dto';

@Injectable()
export class CompanyService {
  constructor(private readonly repository: CompanyRepository) {}

  async create(data: CreateCompanyDTO, tenantId: string): Promise<CompanySafe> {
    const company = await this.repository.create(data as any, tenantId);

    if (!company) {
      throw new BadRequestException('Failed to create company');
    }

    return company;
  }

  async findAll(tenantId: string): Promise<CompanySafe[]> {
    return this.repository.findAll(tenantId);
  }

  async findById(id: string, tenantId: string): Promise<CompanySafe> {
    const company = await this.repository.findById(id, tenantId);
    if (!company) throw new NotFoundException('Company not found');
    return company;
  }

  async findByUserId(userId: string, tenantId: string): Promise<CompanySafe[]> {
    return this.repository.findByUserId(userId, tenantId);
  }

  async update(id: string, data: UpdateCompanyDTO, tenantId: string): Promise<CompanySafe> {
    const updated = await this.repository.update(id, tenantId, data as any);
    if (!updated) throw new NotFoundException('Empresa não encontrada.');
    return updated;
  }

  async remove(id: string, tenantId: string) {
    const company = await this.repository.findById(id, tenantId);
    if (!company) throw new NotFoundException('Company not found');

    const ok = await this.repository.remove(id, tenantId);
    if (!ok) throw new NotFoundException('Company not found');

    return { ok: true };
  }

  async getCompanyLogoBytes(tenantId: string, companyId: string): Promise<Uint8Array | null> {
    return this.repository.getCompanyLogoBytes(tenantId, companyId);
  }
}
