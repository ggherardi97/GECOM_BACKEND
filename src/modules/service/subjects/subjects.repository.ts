import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateSubjectDto, UpdateSubjectDto } from './subjects.dto';

@Injectable()
export class SubjectsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(tenantId: string) {
    return this.prisma.service_subjects.findMany({
      where: { tenant_id: tenantId },
      include: { parent: true, children: true },
      orderBy: { name: 'asc' },
    });
  }

  findById(tenantId: string, id: string) {
    return this.prisma.service_subjects.findFirst({ where: { tenant_id: tenantId, id }, include: { parent: true, children: true } });
  }

  create(tenantId: string, data: CreateSubjectDto) {
    return this.prisma.service_subjects.create({ data: { tenant_id: tenantId, ...data } });
  }

  async update(tenantId: string, id: string, data: UpdateSubjectDto) {
    await this.prisma.service_subjects.updateMany({ where: { tenant_id: tenantId, id }, data: { ...data, updated_at: new Date() } });
    return this.findById(tenantId, id);
  }

  remove(tenantId: string, id: string) {
    return this.prisma.service_subjects.deleteMany({ where: { tenant_id: tenantId, id } });
  }
}
