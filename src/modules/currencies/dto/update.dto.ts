import { PartialType } from '@nestjs/mapped-types';
import { CreateCurrencyDTO } from './create.dto';

export class UpdateCurrencyDTO extends PartialType(CreateCurrencyDTO) {}