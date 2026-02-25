import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AddPlanModuleDto } from './dto/add-plan-module.dto';
import { CreatePlanDto } from './dto/create-plan.dto';
import { UpdatePlanDto } from './dto/update-plan.dto';
import { UpdatePlanModuleDto } from './dto/update-plan-module.dto';

@Injectable()
export class PlansService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params?: { q?: string; is_active?: boolean }) {
    const q = String(params?.q ?? '').trim();

    return this.prisma.plans.findMany({
      where: {
        ...(params?.is_active !== undefined ? { is_active: params.is_active } : {}),
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: 'insensitive' } },
                { name: { contains: q, mode: 'insensitive' } },
                { description: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ name: 'asc' }, { code: 'asc' }],
      include: {
        _count: {
          select: {
            plan_modules: true,
          },
        },
      },
    });
  }

  async listPublicPlans() {
    const rows = await this.prisma.plans.findMany({
      where: {
        is_active: true,
        is_public: true,
        is_custom: false,
      },
      include: {
        plan_modules: {
          where: { included: true },
          include: {
            module: true,
          },
          orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
        },
      },
      orderBy: [{ monthly_price: 'asc' }, { name: 'asc' }],
    });

    return rows.map((row) => ({
      id: row.id,
      code: row.code,
      name: row.name,
      description: row.description,
      monthly_price: row.monthly_price,
      modules: row.plan_modules
        .filter((pm) => pm.module?.is_active)
        .map((pm) => ({
          id: pm.module.id,
          code: pm.module.code,
          name_pt_br: pm.module.name_pt_br,
          description_pt_br: pm.module.description_pt_br,
          monthly_price: pm.module.monthly_price,
          sort_order: pm.sort_order,
        })),
    }));
  }

  async getById(id: string) {
    const row = await this.prisma.plans.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Plano nao encontrado.');
    return row;
  }

  async create(dto: CreatePlanDto) {
    const code = this.normalizeCode(dto.code);
    await this.assertCodeAvailable(code);

    return this.prisma.plans.create({
      data: {
        code,
        name: String(dto.name).trim(),
        description: this.normalizeNullable(dto.description),
        is_active: dto.is_active ?? true,
        monthly_price: this.normalizeMoney(dto.monthly_price),
      },
    });
  }

  async update(id: string, dto: UpdatePlanDto) {
    await this.getById(id);

    let nextCode: string | undefined;
    if (dto.code !== undefined) {
      nextCode = this.normalizeCode(dto.code);
      await this.assertCodeAvailable(nextCode, id);
    }

    return this.prisma.plans.update({
      where: { id },
      data: {
        ...(nextCode !== undefined ? { code: nextCode } : {}),
        ...(dto.name !== undefined ? { name: String(dto.name).trim() } : {}),
        ...(dto.description !== undefined ? { description: this.normalizeNullable(dto.description) } : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
        ...(dto.monthly_price !== undefined ? { monthly_price: this.normalizeMoney(dto.monthly_price) } : {}),
        updated_at: new Date(),
      },
    });
  }

  async listPlanModules(planId: string) {
    await this.getById(planId);

    return this.prisma.plan_modules.findMany({
      where: { plan_id: planId },
      include: {
        module: true,
      },
      orderBy: [{ sort_order: 'asc' }, { created_at: 'asc' }],
    });
  }

  async addModule(planId: string, dto: AddPlanModuleDto) {
    await this.getById(planId);
    await this.assertModuleExists(dto.module_id);

    try {
      return await this.prisma.plan_modules.create({
        data: {
          plan_id: planId,
          module_id: dto.module_id,
          sort_order: dto.sort_order ?? 0,
          included: dto.included ?? true,
        },
        include: {
          module: true,
        },
      });
    } catch (error: any) {
      if (error?.code === 'P2002') {
        throw new BadRequestException('Este modulo ja esta vinculado ao plano.');
      }
      throw error;
    }
  }

  async updatePlanModule(id: string, dto: UpdatePlanModuleDto) {
    const existing = await this.prisma.plan_modules.findUnique({
      where: { id },
      include: { module: true },
    });
    if (!existing) throw new NotFoundException('Vinculo de modulo do plano nao encontrado.');

    return this.prisma.plan_modules.update({
      where: { id },
      data: {
        ...(dto.sort_order !== undefined ? { sort_order: dto.sort_order } : {}),
        ...(dto.included !== undefined ? { included: dto.included } : {}),
        updated_at: new Date(),
      },
      include: {
        module: true,
      },
    });
  }

  async removePlanModule(id: string) {
    const existing = await this.prisma.plan_modules.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Vinculo de modulo do plano nao encontrado.');
    await this.prisma.plan_modules.delete({ where: { id } });
    return { ok: true };
  }

  private normalizeCode(code: string): string {
    const value = String(code ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');

    if (!value) {
      throw new BadRequestException('Codigo do plano e obrigatorio.');
    }

    return value;
  }

  private normalizeNullable(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }

  private async assertCodeAvailable(code: string, ignoreId?: string) {
    const found = await this.prisma.plans.findUnique({ where: { code } });
    if (found && found.id !== ignoreId) {
      throw new BadRequestException('Ja existe um plano com este codigo.');
    }
  }

  private async assertModuleExists(moduleId: string) {
    const row = await this.prisma.modules.findUnique({ where: { id: moduleId } });
    if (!row) throw new NotFoundException('Modulo nao encontrado.');
  }

  private normalizeMoney(value?: number): number {
    const money = Number(value ?? 0);
    if (!Number.isFinite(money) || money < 0) {
      throw new BadRequestException('Preco mensal invalido para plano.');
    }
    return money;
  }
}
