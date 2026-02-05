import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { documents } from '@prisma/client';
import { DocumentsRepository, DocumentsFindAllFilters } from './documents.repository';
import { CreateDocumentDTO } from './dto/create.dto';
import { UpdateDocumentDTO } from './dto/update.dto';

@Injectable()
export class DocumentsService {
  constructor(private readonly repository: DocumentsRepository) {}

  async create(data: CreateDocumentDTO): Promise<documents> {
    const doc = await this.repository.create(data);
    if (!doc) throw new BadRequestException('Failed to create document');
    return doc;
  }

  async findAll(filters: DocumentsFindAllFilters = {}): Promise<documents[]> {
    return this.repository.findAll(filters);
  }

  async findById(id: string, includeChildren = false) {
    const doc = includeChildren
      ? await this.repository.findByIdWithChildren(id)
      : await this.repository.findById(id);

    if (!doc) throw new NotFoundException('Document not found');
    return doc;
  }

  async update(id: string, data: UpdateDocumentDTO): Promise<documents> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Document not found');
    return this.repository.update(id, data);
  }

  async remove(id: string): Promise<documents> {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Document not found');
    return this.repository.remove(id);
  }
}