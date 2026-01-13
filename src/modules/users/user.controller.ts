import { Body, Controller, Get, Param, Post, Patch, Delete, UseGuards } from '@nestjs/common';
import {
  ApiTags,
  ApiBody,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiBearerAuth,
  ApiOperation,
} from '@nestjs/swagger';
import { Roles } from '../auth/decorators/roles.decorator';
import { RolesGuard } from '../auth/guards/roles.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { UserService } from './user.service';
import { CreateUserDTO } from './dto/create.dto';
import { UpdateUserDTO } from './dto/update.dto';
import { users } from '@prisma/client';
import { CustomerResponseDTO } from './dto/customer-response.dto';
import { UserRole } from './enums/user.role';
import { Public } from '../auth/decorators/public.decorator';

@ApiTags('users')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('users')
export class UserController {
  constructor(private readonly service: UserService) {}

  @Public()
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

  @Get('/customers')
  @Roles(UserRole.ADMIN)
  @ApiOperation({
    summary: 'List all customers (Admin only)',
    description: 'Returns all users with role CUSTOMER, including their related customer data. Requires ADMIN role.',
  })
  @ApiOkResponse({
    description: 'List of customers returned successfully.',
    type: CustomerResponseDTO,
    isArray: true,
  })
  async findAllCustomers() {
    return this.service.findAllCustomers();
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

  @Patch('/reset-password/:id/:token')
  @ApiBody({ type: UpdateUserDTO })
  @ApiOkResponse({ description: 'Password updated' })
  async resetPassword(
    @Param('id') id: string,
    @Param('token') token: string,
    @Body('password') password: string
  ): Promise<any> {
    return this.service.resetPassword(id, token, password);
  }
  //
  // @Patch(':id/status')
  // @ApiBody({ schema: { type: 'object', properties: { status: { type: 'string' } } } })
  // @ApiOkResponse({ description: 'Status updated' })
  // async updateStatus(
  //   @Param('id') id: string,
  //   @Body('status') status: string
  // ): Promise<Partial<users>> {
  //   return this.service.updateStatus(id, status as any);
  // }

  @Delete(':id')
  @ApiOkResponse({ description: 'User removed' })
  async remove(@Param('id') id: string): Promise<Partial<users>> {
    return this.service.remove(id);
  }
}
