import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOkResponse, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { CurrencyService } from './currency.service';
import { CreateCurrencyDTO } from './dto/create.dto';
import { UpdateCurrencyDTO } from './dto/update.dto';

@ApiTags('currencies')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('currencies')
export class CurrencyController {
  constructor(private readonly service: CurrencyService) {}

  @Get()
  @ApiOkResponse({ description: 'List of currencies' })
  @ApiOperation({
    summary: 'List currencies',
    description: 'Optional filters: is_active (true/false), q (search)',
  })
  async findAll(@Query('is_active') is_active?: string, @Query('q') q?: string) {
    return this.service.findAll({ is_active, q });
  }

  @Get(':id')
  @ApiOkResponse({ description: 'Currency found' })
  async findById(@Param('id') id: string) {
    return this.service.findById(id);
  }

  @Post()
  @ApiBody({ type: CreateCurrencyDTO })
  @ApiCreatedResponse({ description: 'Currency successfully created' })
  async create(@Body() data: CreateCurrencyDTO) {
    return this.service.create(data);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateCurrencyDTO })
  @ApiOkResponse({ description: 'Currency updated' })
  async update(@Param('id') id: string, @Body() data: UpdateCurrencyDTO) {
    return this.service.update(id, data);
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'Currency removed' })
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}