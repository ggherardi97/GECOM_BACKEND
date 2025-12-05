import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, MinLength, IsUUID } from 'class-validator';

export class ResetPasswordDTO {
  @ApiProperty({
    description: 'User ID',
    example: '390517d6-6789-451c-81ee-1ad410695661',
  })
  @IsString()
  @IsNotEmpty({ message: 'User ID is required' })
  @IsUUID('4', { message: 'User ID must be a valid UUID' })
  user_id: string;

  @ApiProperty({
    description: 'Password reset token received via email',
    example: 'abc123def456',
  })
  @IsString()
  @IsNotEmpty({ message: 'Token is required' })
  token: string;

  @ApiProperty({
    description: 'User new password (minimum 8 characters)',
    example: 'newSecurePassword123',
    minLength: 8,
  })
  @IsString()
  @MinLength(8, { message: 'Password must be at least 8 characters long' })
  new_password: string;

  @ApiProperty({
    description: 'New password confirmation',
    example: 'newSecurePassword123',
  })
  @IsString()
  @MinLength(8, { message: 'Password confirmation must be at least 8 characters long' })
  confirm_password: string;
}
