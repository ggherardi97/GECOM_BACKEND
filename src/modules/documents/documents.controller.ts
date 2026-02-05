import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Patch,
  Delete,
  UseGuards,
  Query,
} from '@nestjs/common';
import {
  ApiTags,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBearerAuth,
  ApiOperation,
  ApiParam,
  ApiQuery,
} from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { DocumentsService } from './documents.service';
import { CreateDocumentDTO } from './dto/create.dto';
import { UpdateDocumentDTO } from './dto/update.dto';

@ApiTags('documents')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly service: DocumentsService) {}

  @Post()
  @ApiOperation({
    summary: 'Create a document (file or folder)',
    description: 'Creates a document record (metadata only). Upload to R2 will be added later.',
  })
  @ApiBody({ type: CreateDocumentDTO })
  @ApiCreatedResponse({ description: 'Document successfully created' })
  async create(@Body() data: CreateDocumentDTO) {
    return this.service.create(data);
  }

  @Get()
async findAll(
  @Query('account_id') account_id?: string,
  @Query('path') path?: string, 
  @Query('related_table') related_table?: string, 
  @Query('related_id') related_id?: string, 
  @Query('item_type') item_type?: string,
  @Query('is_folder') is_folder?: string,
  @Query('is_link') is_link?: string,
  @Query('q') q?: string,
  @Query('take') take?: string,
  @Query('skip') skip?: string,
) {
  const parsedPath =
    path === undefined ? undefined : (path === 'null' || path === '' ? null : path);

  const parsedIsFolder = is_folder === undefined ? undefined : String(is_folder).toLowerCase() === 'true';
  const parsedIsLink = is_link === undefined ? undefined : String(is_link).toLowerCase() === 'true';
return this.service.findAll({
  account_id,
  parent_id: parsedPath as any, // <-- era "path"
  related_table,
  related_id,
  item_type,
  q,
  take: take ? Number(take) : undefined,
  skip: skip ? Number(skip) : undefined,
});
}


  @Get(':id')
  async findById(
    @Param('id') id: string,
    @Query('includeChildren') includeChildren?: string,
  ) {
    const include = String(includeChildren).toLowerCase() === 'true';
    return this.service.findById(id, include);
  }

  @Patch(':id')
  @ApiOperation({
    summary: 'Update a document',
    description: 'Updates document metadata (does not upload any file)',
  })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiBody({ type: UpdateDocumentDTO })
  @ApiOkResponse({ description: 'Document updated' })
  async update(@Param('id') id: string, @Body() data: UpdateDocumentDTO) {
    return this.service.update(id, data);
  }

  @Delete(':id')
  @ApiOperation({
    summary: 'Delete a document',
    description: 'Soft deletes a document (marks as deleted)',
  })
  @ApiParam({ name: 'id', description: 'Document ID' })
  @ApiOkResponse({ description: 'Document removed' })
  async remove(@Param('id') id: string) {
    return this.service.remove(id);
  }
}
