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
  UseInterceptors,
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
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { InvoiceService } from './invoices.service';
import { CreateInvoiceDTO } from './dto/create.dto';
import { UpdateInvoiceDTO } from './dto/update.dto';
import { InvoiceJsonInterceptor } from './interceptors/invoice-json.interceptor';

@ApiTags('invoices')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@UseInterceptors(InvoiceJsonInterceptor) // ✅ converts Prisma Decimal + BigInt only for invoices
@Controller('invoices')
export class InvoiceController {
  constructor(private readonly service: InvoiceService) {}

  private getTenantId(req: Request): string {
    const tenantId = String((req as any)?.user?.tenant_id ?? (req as any)?.user?.tenantId ?? '').trim();
    if (!tenantId) throw new BadRequestException('tenant_id is missing from authenticated user.');
    return tenantId;
  }

@Get()
@ApiOkResponse({ description: 'List of invoices' })
@ApiOperation({
  summary: 'List invoices',
  description: 'Optional filters: company_id, status, fields=summary',
})
async findAll(
  @Req() req: Request,
  @Query('company_id') company_id?: string,
  @Query('status') status?: string,
  @Query('fields') fields?: string
) {
  const tenantId = this.getTenantId(req);
  return this.service.findAll({ company_id, status }, tenantId, fields);
}


  @Get(':id')
  @ApiOkResponse({ description: 'Invoice found' })
  async findById(@Req() req: Request, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.service.findById(id, tenantId);
  }

  @Post()
  @ApiBody({ type: CreateInvoiceDTO })
  @ApiCreatedResponse({ description: 'Invoice successfully created' })
  async create(@Req() req: Request, @Body() data: CreateInvoiceDTO) {
    const tenantId = this.getTenantId(req);
    return this.service.create(data, tenantId);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateInvoiceDTO })
  @ApiOkResponse({ description: 'Invoice updated' })
  async update(@Req() req: Request, @Param('id') id: string, @Body() data: UpdateInvoiceDTO) {
    const tenantId = this.getTenantId(req);
    return this.service.update(id, tenantId, data);
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Invoice removed' })
  async remove(@Req() req: Request, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.service.remove(id, tenantId);
  }
}
