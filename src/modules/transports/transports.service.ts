import { Injectable, NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { Prisma, transports } from '@prisma/client';
import { TransportsRepository } from './transports.repository';

type FindTransportsFilter = {
  process_id?: string;
  transport_type_id?: string;
  transport_status_id?: string;
};

@Injectable()
export class TransportsService {
  constructor(private readonly transportsRepository: TransportsRepository) {}

  async findMany(filter: FindTransportsFilter, tenantId: string, companyId?: string): Promise<transports[]> {
    return this.transportsRepository.findMany(filter, tenantId, companyId);
  }

  async findById(id: string, tenantId: string): Promise<any> {
    const found = await this.transportsRepository.findById(id, tenantId);
    if (!found) throw new NotFoundException('Transporte não encontrado.');
    return found;
  }

  async create(body: Prisma.transportsCreateInput, tenantId: string, companyId?: string): Promise<transports> {
    // If non-admin, validate process belongs to company
    if (companyId) {
      const processId = (body as any)?.processes?.connect?.id ?? (body as any)?.process_id;
      if (!processId) throw new BadRequestException('process_id is required.');

      const allowed = await this.transportsRepository.isProcessInCompany(processId, tenantId, companyId);
      if (!allowed) throw new ForbiddenException('Você não pode criar transporte para este processo.');
    }

    return this.transportsRepository.create(body, tenantId);
  }

  async patchById(
    id: string,
    body: Prisma.transportsUncheckedUpdateInput,
    tenantId: string,
    companyId?: string
  ): Promise<transports> {
    const found = await this.findById(id, tenantId);

    if (companyId && String((found as any)?.process_company_id ?? '') !== companyId) {
      throw new ForbiddenException('Você não tem permissão para alterar este transporte.');
    }

    const updated = await this.transportsRepository.updateById(id, tenantId, body);
    if (!updated) throw new NotFoundException('Transporte não encontrado.');
    return updated;
  }

  async deleteById(id: string, tenantId: string, companyId?: string): Promise<{ ok: true }> {
    const found = await this.findById(id, tenantId);

    if (companyId && String((found as any)?.process_company_id ?? '') !== companyId) {
      throw new ForbiddenException('Você não tem permissão para excluir este transporte.');
    }

    const ok = await this.transportsRepository.deleteById(id, tenantId);
    if (!ok) throw new NotFoundException('Transporte não encontrado.');

    return { ok: true };
  }

  async findAllTransportTypes() {
    return this.transportsRepository.findAllTransportTypes();
  }
}
