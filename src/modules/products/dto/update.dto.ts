import { PartialType } from '@nestjs/mapped-types';
import { CreateProductDTO } from './create.dto';

export class UpdateProductDTO extends PartialType(CreateProductDTO) {}
