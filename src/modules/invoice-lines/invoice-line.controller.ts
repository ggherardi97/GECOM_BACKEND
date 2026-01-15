import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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

  @Get()
  @ApiOkResponse({ description: 'List of invoice lines' })
  @ApiOperation({
    summary: 'List invoice lines',
    description: 'Optional filters: invoice_id, product_id',
  })
  async findAll(@Query('invoice_id') invoice_id?: string, @Query('product_id') product_id?: string) {
    return this.service.findAll({ invoice_id, product_id });
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Invoice line found' })
  async findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @ApiBody({ type: CreateInvoiceLineDTO })
  @ApiCreatedResponse({ description: 'Invoice line successfully created' })
  async create(@Body() data: CreateInvoiceLineDTO) {
    return this.service.create(data);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateInvoiceLineDTO })
  @ApiOkResponse({ description: 'Invoice line updated' })
  async update(@Param('id') id: string, @Body() data: UpdateInvoiceLineDTO) {
    return this.service.update(id, data);
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Invoice line removed' })
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}