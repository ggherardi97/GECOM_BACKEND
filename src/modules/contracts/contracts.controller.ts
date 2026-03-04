import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { ContractsService } from './contracts.service';
import { CreateContractDto } from './dto/create-contract.dto';
import { UpdateContractDto } from './dto/update-contract.dto';
import { GenerateContractInvoiceDto } from './dto/generate-contract-invoice.dto';
import { AccessResource } from '../access-control/decorators/access-resource.decorator';

@ApiTags('contracts')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@AccessResource('contracts')
@Controller('contracts')
export class ContractsController {
  constructor(private readonly service: ContractsService) {}

  private getUser(req: Request) {
    const user = ((req as any)?.user ?? {}) as any;
    const id = String(user.id ?? user.user_id ?? user.userId ?? user.sub ?? '').trim();
    const tenantId = String(user.tenant_id ?? user.tenantId ?? '').trim();

    if (!id || !tenantId) {
      throw new UnauthorizedException('Authentication context missing: req.user.id / req.user.tenant_id');
    }

    return { id, tenant_id: tenantId };
  }

  @Get()
  async list(
    @Req() req: Request,
    @Query('q') q?: string,
    @Query('status') status?: string,
    @Query('company_id') company_id?: string,
    @Query('owner_user_id') owner_user_id?: string,
    @Query('fields') fields?: string,
  ) {
    return this.service.list(this.getUser(req), { q, status, company_id, owner_user_id, fields });
  }

  @Get(':id')
  async findById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findById(this.getUser(req), id);
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateContractDto) {
    return this.service.create(this.getUser(req), dto);
  }

  @Patch(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateContractDto) {
    return this.service.update(this.getUser(req), id, dto);
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    return this.service.remove(this.getUser(req), id);
  }

  @Post(':id/generate-invoice')
  async generateInvoice(@Req() req: Request, @Param('id') id: string, @Body() dto: GenerateContractInvoiceDto) {
    return this.service.generateInvoice(this.getUser(req), id, dto);
  }
}
