import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { CreateTenantDTO } from './dto/create-tenant.dto';
import { UpdateTenantDTO } from './dto/update-tenant.dto';
import { TenantRepository, TenantSafe } from './tenant.repository';

@Injectable()
export class TenantService {
  constructor(private readonly repository: TenantRepository) {}

  async create(data: CreateTenantDTO): Promise<TenantSafe> {
    try {
      return await this.repository.create({
        name: data.name,
        slug: data.slug,
        status: data.status ?? 1,
        ...(data.company_id ? { company: { connect: { id: data.company_id } } } : {}),
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async findAll(requesterTenantId: string): Promise<TenantSafe[]> {
    const tenant = await this.repository.findById(requesterTenantId);
    return tenant ? [tenant] : [];
  }

  async findById(id: string): Promise<TenantSafe> {
    const tenant = await this.repository.findById(id);
    if (!tenant) throw new NotFoundException('Tenant not found');
    return tenant;
  }

  async update(id: string, data: UpdateTenantDTO): Promise<TenantSafe> {
    try {
      const updateData: Prisma.tenantsUpdateInput = {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
      };

      if (data.company_id !== undefined) {
        updateData.company = data.company_id
          ? { connect: { id: data.company_id } }
          : { disconnect: true };
      }

      const updated = await this.repository.update(id, updateData);
      if (!updated) throw new NotFoundException('Tenant not found');
      return updated;
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string): Promise<{ ok: true }> {
    const removed = await this.repository.remove(id);
    if (!removed) throw new NotFoundException('Tenant not found');
    return { ok: true };
  }

  private handlePrismaError(error: unknown): never {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        throw new BadRequestException('Tenant with this slug/company already exists.');
      }
      if (error.code === 'P2003') {
        throw new BadRequestException('Invalid foreign key: company_id does not exist.');
      }
      if (error.code === 'P2025') {
        throw new NotFoundException('Tenant not found');
      }
    }
    throw error;
  }
}
