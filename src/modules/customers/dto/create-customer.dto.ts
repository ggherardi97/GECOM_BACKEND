import { ApiProperty } from '@nestjs/swagger';
import { IsNotEmpty, IsString } from 'class-validator';

export class CreateCustomerDTO {
  @ApiProperty({ example: 'Paulo Silva' })
  @IsString()
  @IsNotEmpty()
  full_name: string;

  @ApiProperty({ example: 'paulo@email.com' })
  @IsString()
  @IsNotEmpty()
  email: string;
}
