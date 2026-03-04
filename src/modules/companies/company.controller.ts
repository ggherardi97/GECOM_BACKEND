import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Delete,
  UseGuards,
  Req,
  Query,
  BadRequestException,
  Res,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ApiTags,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
} from '@nestjs/swagger';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { CompanyService } from './company.service';
import { CreateCompanyDTO } from './dto/create.dto';
import { UpdateCompanyDTO } from './dto/update.dto';
import { UpdateCompanyPictureDTO } from './dto/update-company-picture.dto';
import { CompanyIdName, CompanySafe, CompanySummary } from './company.repository';
import { AccessResource } from '../access-control/decorators/access-resource.decorator';

@ApiTags('companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@AccessResource('companies')
@Controller('companies')
export class CompanyController {
  constructor(private readonly service: CompanyService) {}

  private getTenantId(req: Request): string {
    const tenantId = String((req as any)?.user?.tenant_id ?? (req as any)?.user?.tenantId ?? '').trim();
    if (!tenantId) throw new BadRequestException('tenant_id is missing from authenticated user.');
    return tenantId;
  }

  @Post()
  @ApiOperation({
    summary: 'Create a new company',
    description: 'Creates a new company with the provided information',
  })
  @ApiBody({ type: CreateCompanyDTO })
  @ApiCreatedResponse({ description: 'Company successfully created' })
  async create(@Req() req: Request, @Body() data: CreateCompanyDTO): Promise<CompanySafe> {
    const tenantId = this.getTenantId(req);
    return this.service.create(data, tenantId);
  }

  @Get()
  @ApiOperation({
    summary: 'List all companies',
    description: 'Returns a list of all active companies (supports fields=summary)',
  })
  @ApiOkResponse({ description: 'List of companies' })
  async findAll(
    @Req() req: Request,
    @Query('fields') fields?: string,
  ): Promise<CompanySafe[] | CompanySummary[] | CompanyIdName[]> {
    const tenantId = this.getTenantId(req);
    return this.service.findAll(tenantId, fields);
  }

  @Get('/user/:userId')
  @ApiOperation({
    summary: 'List companies by user',
    description: 'Returns all companies associated with a specific user (without company_picture)',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    example: 'b8f9b6a4-3e5d-4c9e-9b6a-1d9e7a3f2c11',
  })
  @ApiOkResponse({ description: 'List of user companies' })
  async findByUserId(@Req() req: Request, @Param('userId') userId: string): Promise<CompanySafe[]> {
    const tenantId = this.getTenantId(req);
    return this.service.findByUserId(userId, tenantId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get company by ID',
    description: 'Returns a specific company by its ID (without company_picture)',
  })
  @ApiParam({
    name: 'id',
    description: 'Company ID',
    example: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
  })
  @ApiOkResponse({ description: 'Company found' })
  async findById(@Req() req: Request, @Param('id') id: string): Promise<CompanySafe> {
    const tenantId = this.getTenantId(req);
    return this.service.findById(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a company',
    description: 'Updates company information (company_picture is accepted but not returned in payload)',
  })
  @ApiParam({
    name: 'id',
    description: 'Company ID',
    example: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
  })
  @ApiBody({ type: UpdateCompanyDTO })
  @ApiOkResponse({ description: 'Company updated' })
  async update(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() data: UpdateCompanyDTO,
  ): Promise<CompanySafe> {
    const tenantId = this.getTenantId(req);
    return this.service.update(id, data, tenantId);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a company',
    description: 'Soft deletes a company (marks as deleted)',
  })
  @ApiParam({
    name: 'id',
    description: 'Company ID',
    example: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
  })
  @ApiOkResponse({ description: 'Company removed' })
  async remove(@Req() req: Request, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.service.remove(id, tenantId);
  }

  // -----------------------------
  // ✅ Dedicated endpoints (fast)
  // -----------------------------

  // Existing: returns image bytes (good for <img src="/api/companies/:id/logo">)
  @Get(':id/logo')
  @ApiOperation({
    summary: 'Get company logo (image bytes)',
    description: 'Returns only the company logo bytes (company_picture)',
  })
  async getLogo(@Req() req: Request, @Param('id') id: string, @Res() res: Response) {
    const tenantId = this.getTenantId(req);
    const bytes = await this.service.getCompanyLogoBytes(tenantId, id);

    if (!bytes || bytes.length === 0) return res.status(204).send();

    res.setHeader('Content-Type', 'image/png');
    res.setHeader('Cache-Control', 'private, max-age=300');
    return res.status(200).send(Buffer.from(bytes));
  }

  // ✅ New: base64 (easy for JS + localStorage cache)
  @Get(':id/company-picture')
  @ApiOperation({
    summary: 'Get company_picture as base64',
    description: 'Returns { base64 } for company_picture (logo).',
  })
  async getCompanyPictureBase64(@Req() req: Request, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.service.getCompanyPictureBase64(tenantId, id);
  }

  // ✅ New: patch only company_picture
  @Patch(':id/company-picture')
  @ApiOperation({
    summary: 'Update company_picture (logo)',
    description: 'Send base64 or dataURL. Send empty/null to clear.',
  })
  @ApiBody({ type: UpdateCompanyPictureDTO })
  async updateCompanyPicture(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateCompanyPictureDTO) {
    const tenantId = this.getTenantId(req);
    return this.service.updateCompanyPicture(tenantId, id, dto);
  }
}
