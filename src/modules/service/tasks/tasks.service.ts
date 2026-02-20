import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateTaskDto, CreateTaskTypeDto, UpdateTaskDto, UpdateTaskTypeDto } from './tasks.dto';
import { TasksRepository } from './tasks.repository';

@Injectable()
export class TasksService {
  constructor(private readonly repository: TasksRepository) {}

  listTaskTypes(tenantId: string) {
    return this.repository.findTaskTypes(tenantId);
  }

  async getTaskType(tenantId: string, id: string) {
    const row = await this.repository.findTaskTypeById(tenantId, id);
    if (!row) throw new NotFoundException('Tipo de tarefa não encontrado.');
    return row;
  }

  createTaskType(tenantId: string, dto: CreateTaskTypeDto) {
    return this.repository.createTaskType(tenantId, dto);
  }

  async updateTaskType(tenantId: string, id: string, dto: UpdateTaskTypeDto) {
    await this.getTaskType(tenantId, id);
    return this.repository.updateTaskType(tenantId, id, dto);
  }

  async removeTaskType(tenantId: string, id: string) {
    await this.getTaskType(tenantId, id);
    await this.repository.removeTaskType(tenantId, id);
  }

  listTasks(tenantId: string) {
    return this.repository.findTasks(tenantId);
  }

  async getTask(tenantId: string, id: string) {
    const row = await this.repository.findTaskById(tenantId, id);
    if (!row) throw new NotFoundException('Tarefa não encontrada.');
    return row;
  }

  createTask(tenantId: string, userId: string, dto: CreateTaskDto) {
    return this.repository.createTask(tenantId, userId, dto);
  }

  async updateTask(tenantId: string, id: string, dto: UpdateTaskDto) {
    await this.getTask(tenantId, id);
    return this.repository.updateTask(tenantId, id, dto);
  }

  async removeTask(tenantId: string, id: string) {
    await this.getTask(tenantId, id);
    await this.repository.removeTask(tenantId, id);
  }
}
