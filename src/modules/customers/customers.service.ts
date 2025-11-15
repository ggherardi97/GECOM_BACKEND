import { Injectable } from '@nestjs/common';
import { CreateCustomerDTO } from './dto/create-customer.dto';
import { UpdateCustomerDTO } from './dto/update-customer.dto';
import { CustomersRepository } from './customers.repository';

@Injectable()
export class CustomersService {
  constructor(private readonly customersRepository: CustomersRepository) {}
  async create(createCustomerDTO: CreateCustomerDTO) {
    return this.customersRepository.create(createCustomerDTO);
  }

  async findAll(page: number, limit: number) {
    return this.customersRepository.findAll(page, limit);
  }

  async findOne(id: string) {
    return this.customersRepository.findOne(id);
  }

  async update(id: string, updateCustomerDTO: UpdateCustomerDTO) {
    return this.customersRepository.update(id, updateCustomerDTO);
  }

  async remove(id: string) {
    return this.customersRepository.remove(id);
  }
}
