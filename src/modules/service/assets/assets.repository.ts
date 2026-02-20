import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateAssetDto, UpdateAssetDto } from './assets.dto';

@Injectable()
export class AssetsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(tenantId: string) {
    return this.prisma.customer_assets.findMany({
      where: { tenant_id: tenantId },
      include: { company: true },
      orderBy: { created_at: 'desc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.customer_assets.findFirst({ where: { tenant_id: tenantId, id }, include: { company: true } });
  }

  create(tenantId: string, data: CreateAssetDto) {
    return this.prisma.customer_assets.create({
      data: {
        tenant_id: tenantId,
        ...data,
        purchase_date: data.purchase_date ? new Date(data.purchase_date) : null,
        warranty_end_date: data.warranty_end_date ? new Date(data.warranty_end_date) : null,
      },
    });
  }

  async update(tenantId: string, id: string, data: UpdateAssetDto) {
    await this.prisma.customer_assets.updateMany({
      where: { tenant_id: tenantId, id },
      data: {
        ...data,
        purchase_date: data.purchase_date ? new Date(data.purchase_date) : undefined,
        warranty_end_date: data.warranty_end_date ? new Date(data.warranty_end_date) : undefined,
        updated_at: new Date(),
      },
    });
    return this.findById(tenantId, id);
  }

  remove(tenantId: string, id: string) {
    return this.prisma.customer_assets.deleteMany({ where: { tenant_id: tenantId, id } });
  }
}
