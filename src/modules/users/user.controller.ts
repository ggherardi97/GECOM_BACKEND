import { Body, Controller, Get, Param, Post, Patch, Delete } from '@nestjs/common';
import {
  ApiTags,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBearerAuth,
} from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDTO } from './dto/create.dto';
import { UpdateUserDTO } from './dto/update.dto';
import { users } from '@prisma/client';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UserController {
  constructor(private readonly service: UserService) {}

  @Post()
  @ApiBody({ type: CreateUserDTO })
  @ApiCreatedResponse({ description: 'User successfully created' })
  async create(@Body() data: CreateUserDTO) {
    return this.service.create(data);
  }

  @Get()
  @ApiOkResponse({ description: 'List of users' })
  async findAll(): Promise<Partial<users>[]> {
    return this.service.findAll();
  }

  @Get(':id')
  @ApiOkResponse({ description: 'User found' })
  async findById(@Param('id') id: string): Promise<Partial<users>> {
    return this.service.findById(id);
  }

  @Patch(':id')
  @ApiBody({ type: UpdateUserDTO })
  @ApiOkResponse({ description: 'User updated' })
  async update(@Param('id') id: string, @Body() data: UpdateUserDTO) {
    return this.service.update(id, data);
  }

  @Patch(':id/password')
  @ApiBody({ type: UpdateUserDTO })
  @ApiOkResponse({ description: 'Password updated' })
  async updatePassword(
    @Param('id') id: string,
    @Body('password') password: string
  ): Promise<Partial<users>> {
    return this.service.updatePassword(id, password);
  }

  @Patch(':id/status')
  @ApiBody({ schema: { type: 'object', properties: { status: { type: 'string' } } } })
  @ApiOkResponse({ description: 'Status updated' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string
  ): Promise<Partial<users>> {
    return this.service.updateStatus(id, status as any);
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'User removed' })
  async remove(@Param('id') id: string): Promise<Partial<users>> {
    return this.service.remove(id);
  }
}
