import { Injectable } from '@nestjs/common';
import { ProcessTypeRepository } from './process-type.repository';
import { CreateProcessTypeDTO } from './dto/create-process-type.dto';
import { UpdateProcessTypeDTO } from './dto/update-process-type.dto';
import { process_types } from '@prisma/client';

@Injectable()
export class ProcessTypeService {
  private readonly defaultProcessTypeNames = ['Exportacao', 'Importacao', 'Nacional'];

  constructor(private readonly repository: ProcessTypeRepository) {}

  async create(data: CreateProcessTypeDTO): Promise<process_types> {
    return await this.repository.create(data);
  }

  async findAll(): Promise<process_types[]> {
    const current = await this.repository.findAll();
    if (current.length > 0) return current;

    for (const name of this.defaultProcessTypeNames) {
      try {
        await this.repository.create({ name } as CreateProcessTypeDTO);
      } catch {
        // Ignore single insert failures and keep trying the rest.
      }
    }

    return await this.repository.findAll();
  }

  async findById(id: string): Promise<process_types | null> {
    return await this.repository.findById(id);
  }

  async findByName(name: string): Promise<process_types | null> {
    return await this.repository.findByName(name);
  }

  async update(id: string, data: UpdateProcessTypeDTO): Promise<process_types> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<process_types> {
    return await this.repository.delete(id);
  }
}
