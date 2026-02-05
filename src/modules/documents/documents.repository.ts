import { BadRequestException, Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateDocumentDTO } from './dto/create.dto';
import { UpdateDocumentDTO } from './dto/update.dto';

export type DocumentsFindAllFilters = {
  account_id?: string;
  parent_id?: string | null; // null = root
  related_table?: string;
  related_id?: string;
  item_type?: string; // FILE | FOLDER | LINK
  include_deleted?: boolean;
  q?: string;
  take?: number;
  skip?: number;
};

@Injectable()
export class DocumentsRepository {
  private logger = new Logger(DocumentsRepository.name);

  constructor(private readonly prisma: PrismaService) {}

  // ---------------------------
  // Queries
  // ---------------------------
  async findAll(filters: DocumentsFindAllFilters = {}) {
    const take = Math.min(Math.max(filters.take ?? 100, 1), 500);
    const skip = Math.max(filters.skip ?? 0, 0);

    const where: any = {};

    if (filters.account_id) where.account_id = filters.account_id;
    if (filters.parent_id !== undefined) where.parent_id = filters.parent_id;

    if (filters.related_table) where.related_table = filters.related_table;
    if (filters.related_id) where.related_id = filters.related_id;

    if (filters.item_type) where.item_type = filters.item_type;

    if (!filters.include_deleted) where.deleted_at = null;

    if (filters.q) {
      where.name = { contains: String(filters.q), mode: 'insensitive' };
    }

    // No is_folder in your schema. If you want folder-first ordering, we can later implement
    // a CASE ordering using raw SQL, or standardize item_type ordering in DB.
    return this.prisma.documents.findMany({
      where,
      orderBy: [{ name: 'asc' }, { created_at: 'desc' }],
      take,
      skip,
    });
  }

  async findById(id: string, includeDeleted = false) {
    return this.prisma.documents.findFirst({
      where: { id, ...(includeDeleted ? {} : { deleted_at: null }) },
    });
  }

  async findByIdWithChildren(id: string, includeDeleted = false) {
    return this.prisma.documents.findFirst({
      where: { id, ...(includeDeleted ? {} : { deleted_at: null }) },
      include: {
        children: {
          where: includeDeleted ? {} : { deleted_at: null },
          orderBy: [{ name: 'asc' }, { created_at: 'desc' }],
        },
      },
    });
  }

  // ---------------------------
  // Helpers
  // ---------------------------
  private normalizePathSegment(value: string): string {
    const trimmed = String(value ?? '').trim();
    if (!trimmed) return 'item';
    return trimmed.replace(/\//g, '-');
  }

  private async computePathAndDepth(args: {
    account_id: string;
    parent_id?: string | null;
    name: string;
  }): Promise<{ path: string; depth: number }> {
    const segment = this.normalizePathSegment(args.name);

    if (!args.parent_id) {
      return { path: `/${segment}`, depth: 0 };
    }

    const parent = await this.prisma.documents.findFirst({
      where: {
        id: args.parent_id,
        account_id: args.account_id,
        deleted_at: null,
      },
      select: {
        path: true,
        depth: true,
      },
    });

    if (!parent) {
      throw new BadRequestException('Invalid parent_id for this account_id');
    }

    const base = parent.path.replace(/\/+$/g, '');
    const path = `${base}/${segment}`;
    const depth = (parent.depth ?? 0) + 1;

    return { path, depth };
  }

  // ---------------------------
  // Commands
  // ---------------------------
  async create(data: CreateDocumentDTO) {
    try {
      const input: any = data as any;

      const accountId: string = input.account_id;
      if (!accountId) throw new BadRequestException('account_id is required');

      const parentId: string | null = input.parent_id ?? null;

      const name: string = input.name;
      if (!name) throw new BadRequestException('name is required');

      const itemType: string = input.item_type;
      if (!itemType) throw new BadRequestException('item_type is required');

      const computed = await this.computePathAndDepth({
        account_id: accountId,
        parent_id: parentId,
        name,
      });

      return await this.prisma.documents.create({
        data: {
          account_id: accountId,
          parent_id: parentId,

          item_type: itemType,
          name,

          path: computed.path,
          depth: computed.depth,

          filename: input.filename ?? null,
          ext: input.ext ?? null,
          mime_type: input.mime_type ?? null,

          size_bytes: input.size_bytes != null ? BigInt(input.size_bytes) : undefined,

          description: input.description ?? null,
          external_key: input.external_key ?? null,

          readonly: input.readonly ?? false,

          related_table: input.related_table ?? null,
          related_id: input.related_id ?? null,

          storage_provider: input.storage_provider ?? null,
          bucket: input.bucket ?? null,
          object_key: input.object_key ?? null,
          etag: input.etag ?? null,
          version: input.version ?? null,
          upload_status: input.upload_status ?? null,

          created_by_user_id: input.created_by_user_id ?? null,
        } as any,
      });
    } catch (e) {
      this.logger.error('Error creating document:', e);
      throw e instanceof BadRequestException ? e : new BadRequestException('Error creating document');
    }
  }

  async update(id: string, data: UpdateDocumentDTO) {
    try {
      const input: any = data as any;

      // Never allow tenant switch
      delete input.account_id;

      // BigInt handling
      if (input.size_bytes === null) delete input.size_bytes;
      if (input.size_bytes != null) input.size_bytes = BigInt(input.size_bytes);

      // If name or parent changed, recompute path/depth
      let computed: { path: string; depth: number } | null = null;

      if (input.name || input.parent_id !== undefined) {
        const current = await this.prisma.documents.findFirst({
          where: { id, deleted_at: null },
          select: { account_id: true, parent_id: true, name: true },
        });

        if (!current) throw new BadRequestException('Document not found');

        const newName = input.name ?? current.name;
        const newParentId = input.parent_id !== undefined ? input.parent_id : current.parent_id;

        computed = await this.computePathAndDepth({
          account_id: current.account_id,
          parent_id: newParentId,
          name: newName,
        });
      }

      return await this.prisma.documents.update({
        where: { id },
        data: {
          ...input,
          ...(computed ? { path: computed.path, depth: computed.depth } : {}),
          updated_at: new Date(),
        } as any,
      });
    } catch (error) {
      this.logger.error('Error updating document:', error);
      throw error instanceof BadRequestException ? error : new BadRequestException('Error updating document');
    }
  }

  async remove(id: string) {
    try {
      return await this.prisma.documents.update({
        where: { id },
        data: { deleted_at: new Date() },
      });
    } catch (error) {
      this.logger.error('Error removing document:', error);
      throw new BadRequestException('Error removing document');
    }
  }
}
