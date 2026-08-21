import { Injectable } from '@nestjs/common';
import { PrismaService } from 'src/prisma/prisma.service';
import { CreateProcessTypeDTO } from './dto/create-process-type.dto';
import { process_types } from '@prisma/client';
import { UpdateProcessTypeDTO } from './dto/update-process-type.dto';

@Injectable()
export class ProcessTypeRepository {
  constructor(private readonly prisma: PrismaService) {}

  async create(data: CreateProcessTypeDTO): Promise<process_types> {
    return await this.prisma.process_types.create({
      data,
    });
  }

  async findAll(): Promise<process_types[]> {
    return await this.prisma.process_types.findMany();
  }

  async findById(id: string): Promise<process_types | null> {
    return await this.prisma.process_types.findUnique({
      where: { id },
    });
  }

  async findByName(name: string): Promise<process_types | null> {
    const normalized = String(name || '').trim();
    if (!normalized) return null;

    return await this.prisma.process_types.findFirst({
      where: {
        name: {
          equals: normalized,
          mode: 'insensitive',
        },
      },
    });
  }

  async update(id: string, data: UpdateProcessTypeDTO): Promise<process_types> {
    return await this.prisma.process_types.update({
      where: { id },
      data,
    });
  }

  async delete(id: string): Promise<process_types> {
    return await this.prisma.process_types.delete({
      where: { id },
    });
  }
}
