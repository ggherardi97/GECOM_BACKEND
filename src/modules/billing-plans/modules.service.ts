import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateModuleDto } from './dto/create-module.dto';
import { UpdateModuleDto } from './dto/update-module.dto';

@Injectable()
export class ModulesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params?: { q?: string; is_active?: boolean }) {
    const q = String(params?.q ?? '').trim();

    return this.prisma.modules.findMany({
      where: {
        ...(params?.is_active !== undefined ? { is_active: params.is_active } : {}),
        ...(q
          ? {
              OR: [
                { code: { contains: q, mode: 'insensitive' } },
                { name_pt_br: { contains: q, mode: 'insensitive' } },
                { description_pt_br: { contains: q, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      orderBy: [{ name_pt_br: 'asc' }, { code: 'asc' }],
    });
  }

  async listPublicModules() {
    return this.prisma.modules.findMany({
      where: {
        is_active: true,
      },
      orderBy: [{ monthly_price: 'asc' }, { name_pt_br: 'asc' }],
      select: {
        id: true,
        code: true,
        name_pt_br: true,
        description_pt_br: true,
        monthly_price: true,
      },
    });
  }

  async getById(id: string) {
    const row = await this.prisma.modules.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Modulo nao encontrado.');
    return row;
  }

  async create(dto: CreateModuleDto) {
    const code = this.normalizeCode(dto.code);
    await this.assertCodeAvailable(code);

    return this.prisma.modules.create({
      data: {
        code,
        name_pt_br: String(dto.name_pt_br).trim(),
        description_pt_br: this.normalizeNullable(dto.description_pt_br),
        is_active: dto.is_active ?? true,
        monthly_price: this.normalizeMoney(dto.monthly_price),
      },
    });
  }

  async update(id: string, dto: UpdateModuleDto) {
    await this.getById(id);

    let nextCode: string | undefined;
    if (dto.code !== undefined) {
      nextCode = this.normalizeCode(dto.code);
      await this.assertCodeAvailable(nextCode, id);
    }

    return this.prisma.modules.update({
      where: { id },
      data: {
        ...(nextCode !== undefined ? { code: nextCode } : {}),
        ...(dto.name_pt_br !== undefined ? { name_pt_br: String(dto.name_pt_br).trim() } : {}),
        ...(dto.description_pt_br !== undefined
          ? { description_pt_br: this.normalizeNullable(dto.description_pt_br) }
          : {}),
        ...(dto.is_active !== undefined ? { is_active: dto.is_active } : {}),
        ...(dto.monthly_price !== undefined ? { monthly_price: this.normalizeMoney(dto.monthly_price) } : {}),
        updated_at: new Date(),
      },
    });
  }

  private normalizeCode(code: string): string {
    const value = String(code ?? '')
      .trim()
      .toUpperCase()
      .replace(/\s+/g, '_');

    if (!value) {
      throw new BadRequestException('Codigo do modulo e obrigatorio.');
    }

    return value;
  }

  private normalizeNullable(value: string | null | undefined): string | null {
    if (value === null || value === undefined) return null;
    const normalized = String(value).trim();
    return normalized.length > 0 ? normalized : null;
  }

  private async assertCodeAvailable(code: string, ignoreId?: string) {
    const found = await this.prisma.modules.findUnique({ where: { code } });
    if (found && found.id !== ignoreId) {
      throw new BadRequestException('Ja existe um modulo com este codigo.');
    }
  }

  private normalizeMoney(value?: number): number {
    const money = Number(value ?? 0);
    if (!Number.isFinite(money) || money < 0) {
      throw new BadRequestException('Preco mensal invalido para modulo.');
    }
    return money;
  }
}
