import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { documents } from '@prisma/client';
import { DocumentsRepository, DocumentsFindAllFilters } from './documents.repository';
import { CreateDocumentDTO } from './dto/create.dto';
import { UpdateDocumentDTO } from './dto/update.dto';

@Injectable()
export class DocumentsService {
  constructor(private readonly repository: DocumentsRepository) {}

  // Converts Prisma BigInt fields to JSON-safe strings (local to this module)
  private jsonSafeDocument<T>(value: T): T {
    if (value == null) return value;

    // Array support
    if (Array.isArray(value)) {
      return value.map((v) => this.jsonSafeDocument(v)) as any;
    }

    // Object support
    if (typeof value === 'object') {
      const obj: any = value as any;
      const cloned: any = { ...obj };

      if (typeof cloned.size_bytes === 'bigint') {
        cloned.size_bytes = cloned.size_bytes.toString();
      }

      if (Array.isArray(cloned.children)) {
        cloned.children = cloned.children.map((c: any) => this.jsonSafeDocument(c));
      }

      return cloned as T;
    }

    return value;
  }

  async create(data: CreateDocumentDTO, tenantId: string): Promise<documents> {
    const doc = await this.repository.create(data, tenantId);
    if (!doc) throw new BadRequestException('Failed to create document');
    return this.jsonSafeDocument(doc);
  }

  async findAll(filters: DocumentsFindAllFilters = {}, tenantId: string): Promise<documents[]> {
    const docs = await this.repository.findAll(filters, tenantId);
    return this.jsonSafeDocument(docs);
  }

  async findById(id: string, tenantId: string, includeChildren = false) {
    const doc = includeChildren
      ? await this.repository.findByIdWithChildren(id, tenantId)
      : await this.repository.findById(id, tenantId);

    if (!doc) throw new NotFoundException('Document not found');
    return this.jsonSafeDocument(doc);
  }

  async update(id: string, tenantId: string, data: UpdateDocumentDTO): Promise<documents> {
    const existing = await this.repository.findById(id, tenantId);
    if (!existing) throw new NotFoundException('Document not found');

    const updated = await this.repository.update(id, tenantId, data);
    if (!updated) throw new NotFoundException('Document not found');

    return this.jsonSafeDocument(updated);
  }

  async remove(id: string, tenantId: string): Promise<documents> {
    const existing = await this.repository.findById(id, tenantId);
    if (!existing) throw new NotFoundException('Document not found');

    const removed = await this.repository.remove(id, tenantId);
    if (!removed) throw new NotFoundException('Document not found');

    return this.jsonSafeDocument(removed);
  }
}
