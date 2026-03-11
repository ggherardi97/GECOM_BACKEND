import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { CurrencyRepository } from './currency.repository';
import { CreateCurrencyDTO } from './dto/create.dto';
import { UpdateCurrencyDTO } from './dto/update.dto';

@Injectable()
export class CurrencyService {
  private readonly defaultCurrencies = [
    { code: 'BRL', name: 'Real', symbol: 'R$', decimals: 2 },
    { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
    { code: 'USD', name: 'Dolar', symbol: '$', decimals: 2 },
  ];

  constructor(private readonly repository: CurrencyRepository) {}

  private async ensureDefaultCurrencies(): Promise<void> {
    for (const item of this.defaultCurrencies) {
      const existing = await this.repository.findByCode(item.code);
      if (!existing) {
        await this.repository.create({
          code: item.code,
          name: item.name,
          symbol: item.symbol,
          decimals: item.decimals,
          is_active: true,
        });
        continue;
      }

      if (!existing.is_active) {
        await this.repository.update(String(existing.id), {
          is_active: true,
          updated_at: new Date(),
        });
      }
    }
  }

  async findAll(query?: { is_active?: string; q?: string }) {
    await this.ensureDefaultCurrencies();

    const is_active =
      query?.is_active !== undefined && String(query.is_active).trim().length > 0
        ? String(query.is_active).toLowerCase() === 'true'
        : undefined;

    return this.repository.findAll({
      is_active,
      q: query?.q,
    });
  }

  async findById(id: string) {
    const currency = await this.repository.findById(id);
    if (!currency) throw new NotFoundException('Currency not found');
    return currency;
  }

  async create(data: CreateCurrencyDTO) {
    const code = data.code.trim().toUpperCase();

    const exists = await this.repository.findByCode(code);
    if (exists) throw new BadRequestException('Currency code already exists');

    const created = await this.repository.create({
      code,
      name: data.name.trim(),
      symbol: data.symbol ?? null,
      decimals: data.decimals ?? 2,
      is_active: data.is_active ?? true,
    });

    if (!created) throw new BadRequestException('Failed to create currency');
    return created;
  }

  async update(id: string, data: UpdateCurrencyDTO) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Currency not found');

    return this.repository.update(id, {
      code: data.code !== undefined ? data.code.trim().toUpperCase() : undefined,
      name: data.name !== undefined ? data.name.trim() : undefined,
      symbol: data.symbol !== undefined ? data.symbol ?? null : undefined,
      decimals: data.decimals !== undefined ? data.decimals : undefined,
      is_active: data.is_active !== undefined ? data.is_active : undefined,
      updated_at: new Date(),
    });
  }

  async remove(id: string) {
    const existing = await this.repository.findById(id);
    if (!existing) throw new NotFoundException('Currency not found');
    return this.repository.remove(id);
  }
}
