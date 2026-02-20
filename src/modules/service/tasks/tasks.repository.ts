import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateTaskDto, CreateTaskTypeDto, UpdateTaskDto, UpdateTaskTypeDto } from './tasks.dto';

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findTaskTypes(tenantId: string) {
    return this.prisma.service_task_types.findMany({ where: { tenant_id: tenantId }, orderBy: { name: 'asc' } });
  }

  findTaskTypeById(tenantId: string, id: string) {
    return this.prisma.service_task_types.findFirst({ where: { tenant_id: tenantId, id } });
  }

  createTaskType(tenantId: string, data: CreateTaskTypeDto) {
    return this.prisma.service_task_types.create({ data: { tenant_id: tenantId, ...data } });
  }

  async updateTaskType(tenantId: string, id: string, data: UpdateTaskTypeDto) {
    await this.prisma.service_task_types.updateMany({ where: { tenant_id: tenantId, id }, data: { ...data, updated_at: new Date() } });
    return this.findTaskTypeById(tenantId, id);
  }

  removeTaskType(tenantId: string, id: string) {
    return this.prisma.service_task_types.deleteMany({ where: { tenant_id: tenantId, id } });
  }

  findTasks(tenantId: string) {
    return this.prisma.service_tasks.findMany({ where: { tenant_id: tenantId }, include: { incident: true, task_type: true, assigned_to_user: true, created_by_user: true }, orderBy: { created_at: 'desc' } });
  }

  findTaskById(tenantId: string, id: string) {
    return this.prisma.service_tasks.findFirst({ where: { tenant_id: tenantId, id }, include: { incident: true, task_type: true, assigned_to_user: true, created_by_user: true } });
  }

  createTask(tenantId: string, userId: string, data: CreateTaskDto) {
    return this.prisma.service_tasks.create({
      data: {
        tenant_id: tenantId,
        created_by_user_id: userId,
        ...data,
        due_at: data.due_at ? new Date(data.due_at) : null,
        started_at: data.started_at ? new Date(data.started_at) : null,
        completed_at: data.completed_at ? new Date(data.completed_at) : null,
      },
    });
  }

  async updateTask(tenantId: string, id: string, data: UpdateTaskDto) {
    await this.prisma.service_tasks.updateMany({
      where: { tenant_id: tenantId, id },
      data: {
        ...data,
        due_at: data.due_at ? new Date(data.due_at) : undefined,
        started_at: data.started_at ? new Date(data.started_at) : undefined,
        completed_at: data.completed_at ? new Date(data.completed_at) : undefined,
        updated_at: new Date(),
      },
    });
    return this.findTaskById(tenantId, id);
  }

  removeTask(tenantId: string, id: string) {
    return this.prisma.service_tasks.deleteMany({ where: { tenant_id: tenantId, id } });
  }
}
