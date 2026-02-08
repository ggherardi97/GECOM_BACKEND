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
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
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
import { companies } from '@prisma/client';

@ApiTags('companies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
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
  async create(@Req() req: Request, @Body() data: CreateCompanyDTO): Promise<companies> {
    const tenantId = this.getTenantId(req);
    return this.service.create(data, tenantId);
  }

  @Get()
  @ApiOperation({
    summary: 'List all companies',
    description: 'Returns a list of all active companies',
  })
  @ApiOkResponse({ description: 'List of companies' })
  async findAll(@Req() req: Request): Promise<companies[]> {
    const tenantId = this.getTenantId(req);
    return this.service.findAll(tenantId);
  }

  @Get('/user/:userId')
  @ApiOperation({
    summary: 'List companies by user',
    description: 'Returns all companies associated with a specific user',
  })
  @ApiParam({
    name: 'userId',
    description: 'User ID',
    example: 'b8f9b6a4-3e5d-4c9e-9b6a-1d9e7a3f2c11',
  })
  @ApiOkResponse({ description: 'List of user companies' })
  async findByUserId(@Req() req: Request, @Param('userId') userId: string): Promise<companies[]> {
    const tenantId = this.getTenantId(req);
    return this.service.findByUserId(userId, tenantId);
  }

  @Get(':id')
  @ApiOperation({
    summary: 'Get company by ID',
    description: 'Returns a specific company by its ID',
  })
  @ApiParam({
    name: 'id',
    description: 'Company ID',
    example: 'a1b2c3d4-5e6f-7g8h-9i0j-k1l2m3n4o5p6',
  })
  @ApiOkResponse({ description: 'Company found' })
  async findById(@Req() req: Request, @Param('id') id: string): Promise<companies> {
    const tenantId = this.getTenantId(req);
    return this.service.findById(id, tenantId);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a company',
    description: 'Updates company information',
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
  ): Promise<companies> {
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
}
