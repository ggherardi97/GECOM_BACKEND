import { Injectable } from '@nestjs/common';
import { TransportsRepository } from './transports.repository';

@Injectable()
export class TransportsService {
  constructor(private readonly transportsRepository: TransportsRepository) {}

  async findAllTransportTypes() {
    return this.transportsRepository.findAllTransportTypes();
  }
}
