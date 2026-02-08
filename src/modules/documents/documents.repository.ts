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
  async findAll(filters: DocumentsFindAllFilters = {}, tenantId: string) {
    const take = Math.min(Math.max(filters.take ?? 100, 1), 500);
    const skip = Math.max(filters.skip ?? 0, 0);

    const where: any = {
      tenant_id: tenantId,
    };

    if (filters.account_id) where.account_id = filters.account_id;
    if (filters.parent_id !== undefined) where.parent_id = filters.parent_id;

    if (filters.related_table) where.related_table = filters.related_table;
    if (filters.related_id) where.related_id = filters.related_id;

    if (filters.item_type) where.item_type = String(filters.item_type).toUpperCase();

    if (!filters.include_deleted) where.deleted_at = null;

    if (filters.q) {
      where.name = { contains: String(filters.q), mode: 'insensitive' };
    }

    return this.prisma.documents.findMany({
      where,
      orderBy: [{ name: 'asc' }, { created_at: 'desc' }],
      take,
      skip,
    });
  }

  async findById(id: string, tenantId: string, includeDeleted = false) {
    return this.prisma.documents.findFirst({
      where: {
        id,
        tenant_id: tenantId,
        ...(includeDeleted ? {} : { deleted_at: null }),
      } as any,
    });
  }

  async findByIdWithChildren(id: string, tenantId: string, includeDeleted = false) {
    return this.prisma.documents.findFirst({
      where: {
        id,
        tenant_id: tenantId,
        ...(includeDeleted ? {} : { deleted_at: null }),
      } as any,
      include: {
        children: {
          where: {
            tenant_id: tenantId,
            ...(includeDeleted ? {} : { deleted_at: null }),
          } as any,
          orderBy: [{ name: 'asc' }, { created_at: 'desc' }],
        },
      },
    });
  }

  // ---------------------------
  // Helpers (sanitization)
  // ---------------------------
  private stripNullBytes(value: any): string {
    return String(value ?? '').replace(/\u0000/g, '');
  }

  private sanitizeText(value: any, maxLen?: number): string | null {
    if (value == null) return null;

    const s = this.stripNullBytes(value).trim();
    if (!s) return null;

    if (maxLen && s.length > maxLen) return s.slice(0, maxLen);
    return s;
  }

  private sanitizeDataStrings<T extends Record<string, any>>(data: T): T {
    const cloned: any = { ...data };

    for (const [key, val] of Object.entries(cloned)) {
      if (typeof val === 'string' && val.includes('\u0000')) {
        this.logger.warn(`NUL byte detected in field "${key}". Sanitizing value.`);
        cloned[key] = val.replace(/\u0000/g, '');
      }
    }

    return cloned as T;
  }

  private normalizePathSegment(value: string): string {
    const trimmed = this.stripNullBytes(value).trim();
    if (!trimmed) return 'item';
    return trimmed.replace(/\//g, '-');
  }

  private async computePathAndDepth(args: {
    tenant_id: string;
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
        tenant_id: args.tenant_id,
        account_id: args.account_id,
        deleted_at: null,
      } as any,
      select: {
        path: true,
        depth: true,
      },
    });

    if (!parent) {
      throw new BadRequestException('Invalid parent_id for this account_id');
    }

    const parentPath = this.stripNullBytes(parent.path);
    const base = parentPath.replace(/\/+$/g, '');

    const path = `${base}/${segment}`;
    const depth = (parent.depth ?? 0) + 1;

    return { path: this.stripNullBytes(path), depth };
  }

  // ---------------------------
  // Commands
  // ---------------------------
  async create(data: CreateDocumentDTO, tenantId: string) {
    try {
      const input: any = data as any;

      const accountId: string = input.account_id;
      if (!accountId) throw new BadRequestException('account_id is required');

      const parentId: string | null = input.parent_id ?? null;

      const name = this.sanitizeText(input.name, 255);
      if (!name) throw new BadRequestException('name is required');

      const itemTypeRaw: string = input.item_type;
      if (!itemTypeRaw) throw new BadRequestException('item_type is required');

      const itemType = this.stripNullBytes(itemTypeRaw).trim().toUpperCase();

      const computed = await this.computePathAndDepth({
        tenant_id: tenantId,
        account_id: accountId,
        parent_id: parentId,
        name,
      });

      const storageProvider = this.sanitizeText(input.storage_provider, 20) ?? 'CLOUDFLARE_R2';
      const uploadStatusDefault = itemType === 'FILE' ? 'PENDING' : 'NONE';
      const uploadStatus = this.sanitizeText(input.upload_status, 50) ?? uploadStatusDefault;

      const versionValue = this.sanitizeText(input.version, 255) ?? '1';

      const bucketValueRaw: string | null = input.bucket ?? process.env.R2_BUCKET_NAME ?? null;
      const bucketValue = this.sanitizeText(bucketValueRaw, 255);

      const payload = {
        // tenant_id is injected by middleware normally, but we keep it explicit here
        tenant_id: tenantId,

        account_id: accountId,
        created_by_user_id: input.created_by_user_id ?? null,

        parent_id: parentId,

        item_type: itemType,
        name,

        path: this.stripNullBytes(computed.path),
        depth: computed.depth,

        filename: this.sanitizeText(input.filename, 255),
        ext: this.sanitizeText(input.ext, 20),
        mime_type: this.sanitizeText(input.mime_type, 120),

        size_bytes: input.size_bytes != null ? BigInt(input.size_bytes) : undefined,

        description: this.sanitizeText(input.description, 500),
        external_key: this.sanitizeText(input.external_key, 500),

        readonly: input.readonly ?? false,

        related_table: this.sanitizeText(input.related_table, 50),
        related_id: input.related_id ?? null,

        storage_provider: storageProvider,
        bucket: bucketValue,
        object_key: this.sanitizeText(input.object_key),
        etag: this.sanitizeText(input.etag, 255),

        version: versionValue,
        upload_status: uploadStatus,

        created_at: new Date(),
        updated_at: new Date(),
      };

      const safePayload = this.sanitizeDataStrings(payload);

      return await this.prisma.documents.create({
        data: safePayload as any,
      });
    } catch (e) {
      this.logger.error('Error creating document:', e);
      throw e instanceof BadRequestException ? e : new BadRequestException('Error creating document');
    }
  }

  async update(id: string, tenantId: string, data: UpdateDocumentDTO) {
    try {
      const input: any = data as any;

      // Never allow tenant/account switch
      delete input.account_id;
      delete input.tenant_id;

      if (input.item_type) input.item_type = this.stripNullBytes(input.item_type).trim().toUpperCase();

      if (input.size_bytes === null) delete input.size_bytes;
      if (input.size_bytes != null) input.size_bytes = BigInt(input.size_bytes);

      for (const [k, v] of Object.entries(input)) {
        if (typeof v === 'string') {
          input[k] = this.stripNullBytes(v).trim();
        }
      }

      // If name or parent changed, recompute path/depth (tenant-safe)
      let computed: { path: string; depth: number } | null = null;

      if (input.name || input.parent_id !== undefined) {
        const current = await this.prisma.documents.findFirst({
          where: { id, tenant_id: tenantId, deleted_at: null } as any,
          select: { account_id: true, parent_id: true, name: true },
        });

        if (!current) throw new BadRequestException('Document not found');

        const newName = input.name ?? current.name;
        const newParentId = input.parent_id !== undefined ? input.parent_id : current.parent_id;

        computed = await this.computePathAndDepth({
          tenant_id: tenantId,
          account_id: current.account_id,
          parent_id: newParentId,
          name: newName,
        });
      }

      const payload = {
        ...input,
        ...(computed ? { path: computed.path, depth: computed.depth } : {}),
        updated_at: new Date(),
      };

      const safePayload = this.sanitizeDataStrings(payload);

      // IMPORTANT: updateMany to enforce tenant_id safely
      const updated = await this.prisma.documents.updateMany({
        where: { id, tenant_id: tenantId } as any,
        data: safePayload as any,
      });

      if (!updated || updated.count === 0) {
        throw new BadRequestException('Document not found');
      }

      return await this.findById(id, tenantId, true);
    } catch (error) {
      this.logger.error('Error updating document:', error);
      throw error instanceof BadRequestException ? error : new BadRequestException('Error updating document');
    }
  }

  async remove(id: string, tenantId: string) {
    try {
      const existing = await this.findById(id, tenantId, true);
      if (!existing) throw new BadRequestException('Document not found');

      const result = await this.prisma.documents.updateMany({
        where: { id, tenant_id: tenantId } as any,
        data: { deleted_at: new Date(), updated_at: new Date() } as any,
      });

      if (!result || result.count === 0) throw new BadRequestException('Document not found');

      return await this.findById(id, tenantId, true);
    } catch (error) {
      this.logger.error('Error removing document:', error);
      throw new BadRequestException('Error removing document');
    }
  }
}
