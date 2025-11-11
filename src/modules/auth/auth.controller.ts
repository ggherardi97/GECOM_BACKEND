import { Body, Controller, Post } from '@nestjs/common';
import { ApiBody, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { SignInDTO } from './dtos/signin.dto';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  @ApiOperation({ summary: 'User sign in' })
  @ApiBody({ type: SignInDTO })
  @ApiResponse({
    status: 201,
    description: 'Successfully signed in, returns access and refresh tokens.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  async login(@Body() signInDto: SignInDTO) {
    return await this.authService.login(signInDto.email, signInDto.password);
  }
}
