import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class CustomerResponseDTO {
  @ApiProperty({ example: 'e9a11fbb-0c7b-4b80-aad7-d692a8e438d6' })
  @IsString()
  id: string;

  @ApiProperty({ example: 'Paulo Silva' })
  @IsString()
  full_name: string;

  @ApiProperty({ example: 'customer@example.com' })
  @IsEmail()
  email: string;

  @ApiProperty({ example: 'CUSTOMER' })
  role: string;
}
