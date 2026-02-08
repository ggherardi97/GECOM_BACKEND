import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
  Req,
  BadRequestException,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { InvoiceLineService } from './invoice-line.service';
import { CreateInvoiceLineDTO } from './dto/create.dto';
import { UpdateInvoiceLineDTO } from './dto/update.dto';

@ApiTags('invoice_lines')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('invoice_lines')
export class InvoiceLineController {
  constructor(private readonly service: InvoiceLineService) {}

  private getTenantId(req: Request): string {
    const tenantId = String((req as any)?.user?.tenant_id ?? (req as any)?.user?.tenantId ?? '').trim();
    if (!tenantId) throw new BadRequestException('tenant_id is missing from authenticated user.');
    return tenantId;
  }

  @Get()
  @ApiOkResponse({ description: 'List of invoice lines' })
  @ApiOperation({
    summary: 'List invoice lines',
    description: 'Optional filters: invoice_id, product_id',
  })
  async findAll(
    @Req() req: Request,
    @Query('invoice_id') invoice_id?: string,
    @Query('product_id') product_id?: string
  ) {
    const tenantId = this.getTenantId(req);
    return this.service.findAll({ invoice_id, product_id }, tenantId);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Invoice line found' })
  async findById(@Req() req: Request, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.service.findById(id, tenantId);
  }

  @Post()
  @ApiBody({ type: CreateInvoiceLineDTO })
  @ApiCreatedResponse({ description: 'Invoice line successfully created' })
  async create(@Req() req: Request, @Body() data: CreateInvoiceLineDTO) {
    const tenantId = this.getTenantId(req);
    return this.service.create(data, tenantId);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateInvoiceLineDTO })
  @ApiOkResponse({ description: 'Invoice line updated' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() data: UpdateInvoiceLineDTO) {
    const tenantId = this.getTenantId(req);
    return this.service.update(id, data, tenantId);
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Invoice line removed' })
  async remove(@Req() req: Request, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.service.remove(id, tenantId);
  }
}
