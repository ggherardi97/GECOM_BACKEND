import { PartialType } from '@nestjs/mapped-types';
import { CreateUserDTO } from './create.dto';

export class UpdateUserDTO extends PartialType(CreateUserDTO) {}
