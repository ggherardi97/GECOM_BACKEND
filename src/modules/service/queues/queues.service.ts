import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateQueueDto, CreateQueueMemberDto, UpdateQueueDto, UpdateQueueMemberDto } from './queues.dto';
import { QueuesRepository } from './queues.repository';

@Injectable()
export class QueuesService {
  constructor(private readonly repository: QueuesRepository) {}

  listQueues(tenantId: string) {
    return this.repository.findQueues(tenantId);
  }

  async getQueue(tenantId: string, id: string) {
    const row = await this.repository.findQueueById(tenantId, id);
    if (!row) throw new NotFoundException('Fila não encontrada.');
    return row;
  }

  createQueue(tenantId: string, dto: CreateQueueDto) {
    return this.repository.createQueue(tenantId, dto);
  }

  async updateQueue(tenantId: string, id: string, dto: UpdateQueueDto) {
    await this.getQueue(tenantId, id);
    return this.repository.updateQueue(tenantId, id, dto);
  }

  async removeQueue(tenantId: string, id: string) {
    await this.getQueue(tenantId, id);
    await this.repository.removeQueue(tenantId, id);
  }

  listMembers(tenantId: string) {
    return this.repository.findMembers(tenantId);
  }

  async getMember(tenantId: string, id: string) {
    const row = await this.repository.findMemberById(tenantId, id);
    if (!row) throw new NotFoundException('Membro da fila não encontrado.');
    return row;
  }

  createMember(tenantId: string, dto: CreateQueueMemberDto) {
    return this.repository.createMember(tenantId, dto);
  }

  async updateMember(tenantId: string, id: string, dto: UpdateQueueMemberDto) {
    await this.getMember(tenantId, id);
    return this.repository.updateMember(tenantId, id, dto);
  }

  async removeMember(tenantId: string, id: string) {
    await this.getMember(tenantId, id);
    await this.repository.removeMember(tenantId, id);
  }
}
