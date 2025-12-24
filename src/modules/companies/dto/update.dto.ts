import { PartialType } from '@nestjs/mapped-types';
import { CreateCompanyDTO } from './create.dto';

export class UpdateCompanyDTO extends PartialType(CreateCompanyDTO) {}
