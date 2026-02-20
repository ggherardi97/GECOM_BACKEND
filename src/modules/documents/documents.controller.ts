import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Delete,
  UseGuards,
  Query,
  BadRequestException,
  Req,
  ForbiddenException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiTags, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiBearerAuth, ApiOperation, ApiParam } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DocumentsService } from './documents.service';
import { CreateDocumentDTO } from './dto/create.dto';
import { UpdateDocumentDTO } from './dto/update.dto';
import { R2Service } from './r2.service';
import { PrismaService } from '../../prisma/prisma.service';

type PresignUploadDto = {
  fileName: string;
  contentType?: string;
  size?: number;
};

function sanitizeFileName(value: string): string {
  const raw = String(value ?? '').trim();
  if (!raw) return 'file';

  return raw
    .replace(/[/\\]+/g, '_')
    .replace(/[^\w.\- ()]+/g, '_')
    .slice(0, 180);
}

function getExt(fileName: string): string | null {
  const name = String(fileName ?? '').trim();
  const idx = name.lastIndexOf('.');
  if (idx <= 0 || idx === name.length - 1) return null;
  return name.substring(idx + 1).toLowerCase();
}

function buildObjectKey(args: { accountId: string; documentId: string; fileName: string }): string {
  const safeName = sanitizeFileName(args.fileName);
  return `accounts/${args.accountId}/documents/${args.documentId}/${safeName}`;
}

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly service: DocumentsService,
    private readonly r2Service: R2Service,
    private readonly prisma: PrismaService,
  ) {}

  // ------------------------
  // Helpers: role/company/tenant from JWT
  // ------------------------
  private getUser(req: Request): any {
    return (req as any).user ?? {};
  }

  private isAdmin(req: Request): boolean {
    const user = this.getUser(req);
    const role = String(user?.role ?? '').toUpperCase();
    return user?.isAdmin === true || role === 'ADMIN';
  }

  private getTenantId(req: Request): string {
    const user = this.getUser(req);
    const tenantId = String(user?.tenant_id ?? user?.tenantId ?? '').trim();
    if (!tenantId) throw new BadRequestException('Usuario sem tenant_id no token');
    return tenantId;
  }

  private getCompanyId(req: Request): string | null {
    const user = this.getUser(req);
    const companyId = user?.company_id ?? user?.companyId ?? null;
    return companyId ? String(companyId) : null;
  }

  private ensureCompanyScope(req: Request): { related_table: 'company'; related_id: string } {
    const companyId = this.getCompanyId(req);
    if (!companyId) throw new BadRequestException('Usuario sem company_id no token');
    return { related_table: 'company', related_id: companyId };
  }

  private normalizeRelatedTable(value: any): string {
    return String(value ?? '').trim().toLowerCase();
  }

  private isProcessRelatedTable(value: string): boolean {
    return value === 'process' || value === 'processes';
  }

  private async canReadProcessById(req: Request, tenantId: string, processId: string): Promise<boolean> {
    if (this.isAdmin(req)) return true;

    const scope = this.ensureCompanyScope(req);
    const process = await this.prisma.processes.findFirst({
      where: {
        id: processId,
        tenant_id: tenantId,
        deleted_at: null,
      } as any,
      select: { company_id: true } as any,
    });

    return !!process && String((process as any)?.company_id ?? '') === scope.related_id;
  }

  private async canReadByProcessScope(req: Request, tenantId: string, doc: any): Promise<boolean> {
    const relatedTable = this.normalizeRelatedTable(doc?.related_table);
    if (!this.isProcessRelatedTable(relatedTable)) return false;

    const processId = String(doc?.related_id ?? '').trim();
    if (!processId) return false;

    return this.canReadProcessById(req, tenantId, processId);
  }

  private canReadByCompanyScope(req: Request, doc: any): boolean {
    if (this.isAdmin(req)) return true;

    const scope = this.ensureCompanyScope(req);
    return (
      String(doc?.related_table ?? '') === scope.related_table &&
      String(doc?.related_id ?? '') === scope.related_id
    );
  }

  private async ensureDocReadable(req: Request, tenantId: string, doc: any): Promise<void> {
    if (this.canReadByCompanyScope(req, doc)) return;
    if (await this.canReadByProcessScope(req, tenantId, doc)) return;
    // Backward compatibility: some child rows were created without related_* scope.
    // In this case, inherit access from an ancestor folder that is company-scoped.
    const visited = new Set<string>();
    let parentId = String(doc?.parent_id ?? '').trim();
    while (parentId) {
      if (visited.has(parentId)) break;
      visited.add(parentId);
      let parent: any = null;
      try {
        parent = await this.service.findById(parentId, tenantId, false);
      } catch {
        break;
      }
      if (this.canReadByCompanyScope(req, parent)) return;
      if (await this.canReadByProcessScope(req, tenantId, parent)) return;
      parentId = String(parent?.parent_id ?? '').trim();
    }
    throw new ForbiddenException('Voce nao tem acesso a este documento.');
  }

  // =========================
  // CRUD
  // =========================

  @Post()
  @ApiOperation({
    summary: 'Create a document (file or folder)',
    description: 'Creates a document record (metadata only). Upload to R2 will be added later.',
  })
  @ApiBody({ type: CreateDocumentDTO })
  @ApiCreatedResponse({ description: 'Document successfully created' })
  async create(@Req() req: Request, @Body() data: CreateDocumentDTO) {
    const tenantId = this.getTenantId(req);
const userId =
    (req as any)?.user?.id ||
    (req as any)?.user?.sub ||
    (req as any)?.userId ||
    null;

    // Non-admin must always create scoped to their company
    const payload: any = { ...(data as any) };

    if (!this.isAdmin(req)) {
      const scope = this.ensureCompanyScope(req);
      payload.related_table = scope.related_table;
      payload.related_id = scope.related_id;
    }

    // tenant_id is injected by Prisma middleware in create (per your architecture)
    return this.service.create(payload, tenantId, userId);
  }

  @Get()
  async findAll(
    @Req() req: Request,
    @Query('account_id') account_id?: string,
    @Query('path') path?: string,
    @Query('related_table') related_table?: string,
    @Query('related_id') related_id?: string,
    @Query('item_type') item_type?: string,
    @Query('q') q?: string,
    @Query('take') take?: string,
    @Query('skip') skip?: string,
  ) {
    const tenantId = this.getTenantId(req);

    const parsedPath = path === undefined ? undefined : (path === 'null' || path === '' ? null : path);

    // ADMIN: can use query filters as is (but still restricted by tenant)
    // Non-admin: force company scope for root listing.
    let enforcedRelatedTable = related_table;
    let enforcedRelatedId = related_id;

    if (!this.isAdmin(req)) {
      const requestedRelatedTable = this.normalizeRelatedTable(related_table);
      const requestedRelatedId = String(related_id ?? '').trim();

      if (this.isProcessRelatedTable(requestedRelatedTable) && requestedRelatedId) {
        const canReadProcess = await this.canReadProcessById(req, tenantId, requestedRelatedId);
        if (!canReadProcess) {
          throw new ForbiddenException('Voce nao tem acesso a este processo.');
        }
        enforcedRelatedTable = requestedRelatedTable;
        enforcedRelatedId = requestedRelatedId;
      } else {
        const scope = this.ensureCompanyScope(req);
        enforcedRelatedTable = scope.related_table;
        enforcedRelatedId = scope.related_id;
      }

      // For folder navigation (path=<parent_id>), first validate parent access
      // then list children by parent_id regardless of child related_* fields.
      if (parsedPath && parsedPath !== 'null') {
        const parent = await this.service.findById(String(parsedPath), tenantId, false);
        await this.ensureDocReadable(req, tenantId, parent);
        enforcedRelatedTable = undefined;
        enforcedRelatedId = undefined;
      }

      // optional: ignore account_id filtering for non-admin
      account_id = undefined;
    }

    return this.service.findAll(
      {
        account_id,
        parent_id: parsedPath as any,
        related_table: enforcedRelatedTable,
        related_id: enforcedRelatedId,
        item_type,
        q,
        take: take ? Number(take) : undefined,
        skip: skip ? Number(skip) : undefined,
      },
      tenantId,
    );
  }

  @Get(':id')
  async findById(
    @Req() req: Request,
    @Param('id') id: string,
    @Query('includeChildren') includeChildren?: string,
  ) {
    const tenantId = this.getTenantId(req);

    const include = String(includeChildren).toLowerCase() === 'true';
    const doc = await this.service.findById(id, tenantId, include);

    await this.ensureDocReadable(req, tenantId, doc);

    return doc;
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a document',
    description: 'Updates document metadata (does not upload any file)',
  })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiBody({ type: UpdateDocumentDTO })
  @ApiOkResponse({ description: 'Document updated' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() data: UpdateDocumentDTO) {
    const tenantId = this.getTenantId(req);

    const existing = await this.service.findById(id, tenantId, false);
    await this.ensureDocReadable(req, tenantId, existing);

    const payload: any = { ...(data as any) };

    // Non-admin cannot change scope
    if (!this.isAdmin(req)) {
      delete payload.related_table;
      delete payload.related_id;
      delete payload.account_id;
    }

    return this.service.update(id, tenantId, payload);
  }

  // =========================
  // R2 - Presigned URLs
  // =========================

  @Post(':id/presign-upload')
  @ApiOperation({
    summary: 'Get presigned upload URL (R2)',
    description: 'Returns a presigned PUT URL so the frontend can upload the file directly to R2.',
  })
  @ApiParam({ name: 'id', description: 'Document ID' })
  async presignUpload(@Req() req: Request, @Param('id') id: string, @Body() dto: PresignUploadDto) {
    const tenantId = this.getTenantId(req);

    const documentId = String(id ?? '').trim();
    if (!documentId) throw new BadRequestException('Missing document id');

    const fileNameRaw = String(dto?.fileName ?? '').trim();
    if (!fileNameRaw) throw new BadRequestException('fileName is required');

    const fileName = sanitizeFileName(fileNameRaw);
    const contentType = String(dto?.contentType ?? 'application/octet-stream').trim();

    const size = dto?.size == null ? undefined : Number(dto.size);
    if (size !== undefined && (!Number.isFinite(size) || size <= 0)) {
      throw new BadRequestException('size must be a positive number');
    }

    // Load doc and check access (tenant enforced)
    const doc = await this.service.findById(documentId, tenantId, false);
    await this.ensureDocReadable(req, tenantId, doc);

    const accountId = String((doc as any)?.account_id ?? '').trim();
    if (!accountId) throw new BadRequestException('Document missing account_id');

    const objectKey = buildObjectKey({ accountId, documentId, fileName });
    const bucket = this.r2Service.getBucket();
    const ext = getExt(fileName);

    await this.service.update(
      documentId,
      tenantId,
      {
        storage_provider: 'CLOUDFLARE_R2',
        bucket,
        object_key: objectKey,
        filename: fileName,
        ext: ext ?? undefined,
        mime_type: contentType,
        size_bytes: size as any,
        upload_status: 'PENDING',
      } as any,
    );

    const presign = await this.r2Service.presignPutObject({
      key: objectKey,
      contentType,
      contentLength: size,
    });

    return {
      ...presign,
      bucket,
      object_key: objectKey,
      filename: fileName,
      mime_type: contentType,
      size_bytes: size,
      upload_status: 'PENDING',
    };
  }

  @Get(':id/presign-download')
  @ApiOperation({
    summary: 'Get presigned download URL (R2)',
    description: 'Returns a presigned GET URL for downloading a file from R2.',
  })
  @ApiParam({ name: 'id', description: 'Document ID' })
  async presignDownload(@Req() req: Request, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);

    const documentId = String(id ?? '').trim();
    if (!documentId) throw new BadRequestException('Missing document id');

    const doc = await this.service.findById(documentId, tenantId, false);
    await this.ensureDocReadable(req, tenantId, doc);

    const objectKey = String((doc as any)?.object_key ?? '').trim();
    if (!objectKey) throw new BadRequestException('Document has no object_key. Upload it first.');

    return this.r2Service.presignGetObject(objectKey);
  }

  @Delete(':id/r2')
  @ApiOperation({
    summary: 'Delete object from R2',
    description: 'Deletes the physical object in R2 (does not delete the DB record).',
  })
  @ApiParam({ name: 'id', description: 'Document ID' })
  async deleteFromR2(@Req() req: Request, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);

    const documentId = String(id ?? '').trim();
    if (!documentId) throw new BadRequestException('Missing document id');

    const doc = await this.service.findById(documentId, tenantId, false);
    await this.ensureDocReadable(req, tenantId, doc);

    const objectKey = String((doc as any)?.object_key ?? '').trim();
    if (!objectKey) return { ok: true, message: 'No object_key found. Nothing to delete in R2.' };

    await this.r2Service.deleteObject(objectKey);

    await this.service.update(
      documentId,
      tenantId,
      {
        upload_status: 'DELETED',
        etag: null,
        version: (doc as any)?.version ? Number((doc as any).version) + 1 : undefined,
      } as any,
    );

    return { ok: true };
  }

  // =========================
  // DB Soft Delete
  // =========================

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a document',
    description: 'Soft deletes a document (marks as deleted)',
  })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiOkResponse({ description: 'Document removed' })
  async remove(@Req() req: Request, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);

    const existing = await this.service.findById(id, tenantId, false);
    await this.ensureDocReadable(req, tenantId, existing);

    return this.service.remove(id, tenantId);
  }
}

