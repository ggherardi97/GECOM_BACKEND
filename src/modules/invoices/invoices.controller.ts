import { Body, Controller, Get, Param, Post, Patch, Delete, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { InvoiceService } from './invoices.service';
import { CreateInvoiceDTO } from './dto/create.dto';
import { UpdateInvoiceDTO } from './dto/update.dto';

/**
 * Converts BigInt to string recursively to avoid:
 * "TypeError: Do not know how to serialize a BigInt"
 */
function jsonSafe<T>(value: T): any {
  if (value === null || value === undefined) return value;
  if (typeof value === 'bigint') return value.toString();

  if (Array.isArray(value)) {
    return value.map((x) => jsonSafe(x));
  }

  if (typeof value === 'object') {
    const out: any = {};
    for (const [k, v] of Object.entries(value as any)) {
      out[k] = jsonSafe(v);
    }
    return out;
  }

  return value;
}

@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('invoices')
export class InvoiceController {
  constructor(private readonly service: InvoiceService) {}

  @Get()
  @ApiOkResponse({ description: 'List of invoices' })
  @ApiOperation({
    summary: 'List invoices',
    description: 'Optional filters: company_id, status',
  })
  async findAll(@Query('company_id') company_id?: string, @Query('status') status?: string) {
    const result = await this.service.findAll({ company_id, status });
    return jsonSafe(result);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Invoice found' })
  async findById(@Param('id') id: string) {
    const result = await this.service.findById(id);
    return jsonSafe(result);
  }

  @Post()
  @ApiBody({ type: CreateInvoiceDTO })
  @ApiCreatedResponse({ description: 'Invoice successfully created' })
  async create(@Body() data: CreateInvoiceDTO) {
    const result = await this.service.create(data);
    return jsonSafe(result);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateInvoiceDTO })
  @ApiOkResponse({ description: 'Invoice updated' })
  async update(@Param('id') id: string, @Body() data: UpdateInvoiceDTO) {
    const result = await this.service.update(id, data);
    return jsonSafe(result);
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Invoice removed' })
  async remove(@Param('id') id: string) {
    const result = await this.service.remove(id);
    return jsonSafe(result);
  }
}