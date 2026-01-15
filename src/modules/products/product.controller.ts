import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
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
  async findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @ApiBody({ type: CreateProductDTO })
  @ApiCreatedResponse({ description: 'Product successfully created' })
  async create(@Body() data: CreateProductDTO) {
    return this.service.create(data);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateProductDTO })
  @ApiOkResponse({ description: 'Product updated' })
  async update(@Param('id') id: string, @Body() data: UpdateProductDTO) {
    return this.service.update(id, data);
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Product removed' })
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
