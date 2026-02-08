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
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ProductService } from './product.service';
import { CreateProductDTO } from './dto/create.dto';
import { UpdateProductDTO } from './dto/update.dto';

@ApiTags('products')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('products')
export class ProductController {
  constructor(private readonly service: ProductService) {}

  private getTenantId(req: any): string {
    const tenantId = String(req?.user?.tenant_id ?? req?.user?.tenantId ?? '').trim();
    if (!tenantId) {
      throw new BadRequestException('tenant_id is missing from authenticated user.');
    }
    return tenantId;
  }

  @Get()
  @ApiOkResponse({ description: 'List of products' })
  @ApiOperation({
    summary: 'List products',
    description: 'Optional filters: currency_id, is_active (true/false), q (search)',
  })
  async findAll(
    @Query('currency_id') currency_id?: string,
    @Query('is_active') is_active?: string,
    @Query('q') q?: string
  ) {
    return this.service.findAll({ currency_id, is_active, q });
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Product found' })
  async findById(@Req() req: any, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.service.findById(id, tenantId);
  }

  @Post()
  @ApiBody({ type: CreateProductDTO })
  @ApiCreatedResponse({ description: 'Product successfully created' })
  async create(@Body() data: CreateProductDTO) {
    // tenant_id is injected by Prisma middleware in create (per your architecture)
    return this.service.create(data);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateProductDTO })
  @ApiOkResponse({ description: 'Product updated' })
  async update(@Req() req: any, @Param('id') id: string, @Body() data: UpdateProductDTO) {
    const tenantId = this.getTenantId(req);
    return this.service.update(id, tenantId, data);
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Product removed' })
  async remove(@Req() req: any, @Param('id') id: string) {
    const tenantId = this.getTenantId(req);
    return this.service.remove(id, tenantId);
  }
}
