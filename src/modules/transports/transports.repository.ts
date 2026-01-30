import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class TransportsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async findAllTransportTypes() {
    return this.prisma.transport_types.findMany();
  }
}
