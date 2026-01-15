import { Body, Controller, Get, Param, Post, Patch, Delete, UseGuards, Query } from '@nestjs/common';
import { ApiTags, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiBearerAuth, ApiOperation } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { InvoiceService } from './invoices.service';
import { CreateInvoiceDTO } from './dto/create.dto';
import { UpdateInvoiceDTO } from './dto/update.dto';

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
  async findAll(
    @Query('company_id') company_id?: string,
    @Query('status') status?: string
  ) {
    return this.service.findAll({ company_id, status });
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Invoice found' })
  async findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @ApiBody({ type: CreateInvoiceDTO })
  @ApiCreatedResponse({ description: 'Invoice successfully created' })
  async create(@Body() data: CreateInvoiceDTO) {
    return this.service.create(data);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateInvoiceDTO })
  @ApiOkResponse({ description: 'Invoice updated' })
  async update(@Param('id') id: string, @Body() data: UpdateInvoiceDTO) {
    return this.service.update(id, data);
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Invoice removed' })
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}