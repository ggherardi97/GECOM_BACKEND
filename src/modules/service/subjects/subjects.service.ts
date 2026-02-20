import { Injectable, NotFoundException } from '@nestjs/common';
import { CreateSubjectDto, UpdateSubjectDto } from './subjects.dto';
import { SubjectsRepository } from './subjects.repository';

@Injectable()
export class SubjectsService {
  constructor(private readonly repository: SubjectsRepository) {}

  list(tenantId: string) {
    return this.repository.findMany(tenantId);
  }

  async getById(tenantId: string, id: string) {
    const row = await this.repository.findById(tenantId, id);
    if (!row) throw new NotFoundException('Assunto não encontrado.');
    return row;
  }

  create(tenantId: string, dto: CreateSubjectDto) {
    return this.repository.create(tenantId, dto);
  }

  async update(tenantId: string, id: string, dto: UpdateSubjectDto) {
    await this.getById(tenantId, id);
    return this.repository.update(tenantId, id, dto);
  }

  async remove(tenantId: string, id: string) {
    await this.getById(tenantId, id);
    await this.repository.remove(tenantId, id);
  }
}
