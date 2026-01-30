import { Injectable } from '@nestjs/common';
import { ProcessTypeRepository } from './process-type.repository';
import { CreateProcessTypeDTO } from './dto/create-process-type.dto';
import { UpdateProcessTypeDTO } from './dto/update-process-type.dto';
import { process_types } from '@prisma/client';

@Injectable()
export class ProcessTypeService {
  constructor(private readonly repository: ProcessTypeRepository) {}

  async create(data: CreateProcessTypeDTO): Promise<process_types> {
    return await this.repository.create(data);
  }

  async findAll(): Promise<process_types[]> {
    return await this.repository.findAll();
  }

  async findById(id: string): Promise<process_types | null> {
    return await this.repository.findById(id);
  }

  async update(id: string, data: UpdateProcessTypeDTO): Promise<process_types> {
    return await this.repository.update(id, data);
  }

  async delete(id: string): Promise<process_types> {
    return await this.repository.delete(id);
  }
}
