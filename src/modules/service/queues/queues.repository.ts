import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateQueueDto, CreateQueueMemberDto, UpdateQueueDto, UpdateQueueMemberDto } from './queues.dto';

@Injectable()
export class QueuesRepository {
  constructor(private readonly prisma: PrismaService) {}

  findQueues(tenantId: string) {
    return this.prisma.service_queues.findMany({
      where: { tenant_id: tenantId },
      include: { members: true },
      orderBy: { name: 'asc' },
    });
  }

  findQueueById(tenantId: string, id: string) {
    return this.prisma.service_queues.findFirst({ where: { tenant_id: tenantId, id }, include: { members: true } });
  }

  createQueue(tenantId: string, data: CreateQueueDto) {
    return this.prisma.service_queues.create({ data: { tenant_id: tenantId, ...data } });
  }

  async updateQueue(tenantId: string, id: string, data: UpdateQueueDto) {
    await this.prisma.service_queues.updateMany({ where: { tenant_id: tenantId, id }, data: { ...data, updated_at: new Date() } });
    return this.findQueueById(tenantId, id);
  }

  removeQueue(tenantId: string, id: string) {
    return this.prisma.service_queues.deleteMany({ where: { tenant_id: tenantId, id } });
  }

  findMembers(tenantId: string) {
    return this.prisma.service_queue_members.findMany({
      where: { tenant_id: tenantId },
      include: { queue: true, user: true },
      orderBy: { created_at: 'desc' },
    });
  }

  findMemberById(tenantId: string, id: string) {
    return this.prisma.service_queue_members.findFirst({ where: { tenant_id: tenantId, id }, include: { queue: true, user: true } });
  }

  createMember(tenantId: string, data: CreateQueueMemberDto) {
    return this.prisma.service_queue_members.create({ data: { tenant_id: tenantId, ...data } });
  }

  async updateMember(tenantId: string, id: string, data: UpdateQueueMemberDto) {
    await this.prisma.service_queue_members.updateMany({ where: { tenant_id: tenantId, id }, data: { ...data, updated_at: new Date() } });
    return this.findMemberById(tenantId, id);
  }

  removeMember(tenantId: string, id: string) {
    return this.prisma.service_queue_members.deleteMany({ where: { tenant_id: tenantId, id } });
  }
}
