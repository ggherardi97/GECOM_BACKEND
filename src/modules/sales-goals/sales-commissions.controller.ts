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
import { SalesGoalsService } from './sales-goals.service';
import { CreateSalesCommissionDto } from './dto/create-sales-commission.dto';
import { UpdateSalesCommissionDto } from './dto/update-sales-commission.dto';

@ApiTags('sales-commissions')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales-commissions')
export class SalesCommissionsController {
  constructor(private readonly service: SalesGoalsService) {}

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
    @Query('owner_user_id') owner_user_id?: string,
    @Query('sales_goal_id') sales_goal_id?: string,
  ) {
    return this.service.listCommissions(this.getUser(req), { owner_user_id, sales_goal_id });
  }

  @Get(':id')
  async findById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findCommissionById(this.getUser(req), id);
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateSalesCommissionDto) {
    return this.service.createCommission(this.getUser(req), dto);
  }

  @Patch(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateSalesCommissionDto) {
    return this.service.updateCommission(this.getUser(req), id, dto);
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeCommission(this.getUser(req), id);
  }
}
