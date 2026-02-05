import { PartialType } from '@nestjs/swagger';
import { CreateDocumentDTO } from './create.dto';

export class UpdateDocumentDTO extends PartialType(CreateDocumentDTO) {}
