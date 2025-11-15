import { PartialType } from '@nestjs/swagger';
import { CreateCustomerDTO } from './create-customer.dto';

export class UpdateCustomerDTO extends PartialType(CreateCustomerDTO) {}
