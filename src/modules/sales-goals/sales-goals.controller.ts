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
import { CreateSalesGoalDto } from './dto/create-sales-goal.dto';
import { UpdateSalesGoalDto } from './dto/update-sales-goal.dto';

@ApiTags('sales-goals')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('sales-goals')
export class SalesGoalsController {
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
  async list(@Req() req: Request, @Query('owner_user_id') owner_user_id?: string) {
    return this.service.listGoals(this.getUser(req), owner_user_id);
  }

  @Get(':id')
  async findById(@Req() req: Request, @Param('id') id: string) {
    return this.service.findGoalById(this.getUser(req), id);
  }

  @Post()
  async create(@Req() req: Request, @Body() dto: CreateSalesGoalDto) {
    return this.service.createGoal(this.getUser(req), dto);
  }

  @Patch(':id')
  async update(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateSalesGoalDto) {
    return this.service.updateGoal(this.getUser(req), id, dto);
  }

  @Delete(':id')
  async remove(@Req() req: Request, @Param('id') id: string) {
    return this.service.removeGoal(this.getUser(req), id);
  }
}
