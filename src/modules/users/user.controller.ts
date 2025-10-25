import { Body, Controller, Get, Param, Post, Patch, Delete } from '@nestjs/common';
import { ApiTags, ApiBody, ApiCreatedResponse, ApiOkResponse } from '@nestjs/swagger';
import { UserService } from './user.service';
import { CreateUserDTO } from './dto/create.dto';
import { UpdateUserDTO } from './dto/update.dto';
import { users } from '@prisma/client';

@ApiTags('users')
@Controller('users')
export class UserController {
  constructor(private readonly service: UserService) {}

  @Post()
  @ApiBody({ type: CreateUserDTO })
  @ApiCreatedResponse({ description: 'User successfully created' })
  async create(@Body() data: CreateUserDTO) {
    return await this.service.create(data);
  }

  @Get()
  @ApiOkResponse({ description: 'List of users' })
  async findAll(): Promise<Partial<users>[]> {
    const users = await this.service.findAll();
    return users.map(({ password, ...rest }) => rest);
  }

  @Get(':id')
  @ApiOkResponse({ description: 'User found' })
  async findById(@Param('id') id: string): Promise<Partial<users>> {
    const user = await this.service.findById(id);
    const { password, ...result } = user;
    return result;
  }

  @Patch(':id')
  @ApiBody({ type: UpdateUserDTO })
  @ApiOkResponse({ description: 'User updated' })
  async update(@Param('id') id: string, @Body() data: UpdateUserDTO) {
    const user = await this.service.update(id, data);
    const { password, ...result } = user;
    return result;
  }

  @Patch(':id/password')
  @ApiBody({ type: UpdateUserDTO })
  @ApiOkResponse({ description: 'Password updated' })
  async updatePassword(
    @Param('id') id: string,
    @Body('password') password: string
  ): Promise<Partial<users>> {
    const user = await this.service.updatePassword(id, password);
    const { password: _, ...result } = user;
    return result;
  }

  @Patch(':id/status')
  @ApiBody({ schema: { type: 'object', properties: { status: { type: 'string' } } } })
  @ApiOkResponse({ description: 'Status updated' })
  async updateStatus(
    @Param('id') id: string,
    @Body('status') status: string
  ): Promise<Partial<users>> {
    const user = await this.service.updateStatus(id, status as any);
    const { password, ...result } = user;
    return result;
  }

  @Delete(':id')
  @ApiOkResponse({ description: 'User removed' })
  async remove(@Param('id') id: string): Promise<Partial<users>> {
    const user = await this.service.remove(id);
    const { password, ...result } = user;
    return result;
  }
}
