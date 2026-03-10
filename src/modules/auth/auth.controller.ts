import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiBody, ApiCreatedResponse, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from './decorators/public.decorator';
import { SignInDTO } from './dtos/signin.dto';
import { RefreshTokenDTO } from './dtos/refresh-token.dto';
import { ForgotPasswordDTO } from './dtos/forgot-password.dto';
import { ResetPasswordDTO } from './dtos/reset-password.dto';
import { SignUpDTO, SignUpResponseDTO } from './dtos/signup.dto';
import {
  SignUpPaymentCompleteDTO,
  SignUpPaymentPrepareDTO,
  SignUpPaymentPrepareResponseDTO,
} from './dtos/signup-payment.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import type { Request, Response } from 'express';

@ApiTags('Authentication')
@UseGuards(JwtAuthGuard)
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('signup')
  @ApiOperation({
    summary: 'Public onboarding signup',
    description: 'Creates tenant, company and admin user in one transaction and returns auth tokens.',
  })
  @ApiBody({ type: SignUpDTO })
  @ApiCreatedResponse({ type: SignUpResponseDTO })
  async signup(@Body() dto: SignUpDTO, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const result = await this.authService.signup(dto, req);
    const isProd = !!process.env.NODE_ENV?.startsWith('prod');

    res.cookie('access_token', result.access_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 60 * 60 * 1000,
    });

    res.cookie('refresh_token', result.refresh_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return result;
  }

  @Public()
  @Post('signup/payment/prepare')
  @ApiOperation({
    summary: 'Prepare Stripe payment step for public onboarding',
    description:
      'Validates selected plan/custom modules and creates a Stripe SetupIntent + temporary signup payment session.',
  })
  @ApiBody({ type: SignUpPaymentPrepareDTO })
  @ApiCreatedResponse({ type: SignUpPaymentPrepareResponseDTO })
  async signupPaymentPrepare(@Body() dto: SignUpPaymentPrepareDTO): Promise<SignUpPaymentPrepareResponseDTO> {
    return this.authService.prepareSignupPayment(dto);
  }

  @Public()
  @Post('signup/payment/complete')
  @ApiOperation({
    summary: 'Complete public onboarding after Stripe card validation',
    description:
      'Finalizes signup using previously prepared payment session, creates Stripe subscription (trial) and returns auth tokens.',
  })
  @ApiBody({ type: SignUpPaymentCompleteDTO })
  @ApiCreatedResponse({ type: SignUpResponseDTO })
  async signupPaymentComplete(
    @Body() dto: SignUpPaymentCompleteDTO,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.completeSignupPayment(dto, req);
    const isProd = !!process.env.NODE_ENV?.startsWith('prod');

    res.cookie('access_token', result.access_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 60 * 60 * 1000,
    });

    res.cookie('refresh_token', result.refresh_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return result;
  }

  @Public()
  @Post()
  @ApiOperation({ summary: 'User sign in' })
  @ApiBody({ type: SignInDTO })
  @ApiResponse({
    status: 201,
    description: 'Successfully signed in, returns access and refresh tokens.',
  })
  @ApiResponse({ status: 401, description: 'Invalid credentials.' })
  async login(
    @Body() signInDto: SignInDTO,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response
  ) {
    const { email, password } = signInDto;

    const result = await this.authService.login(email, password, req);
    if (!result) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const { access_token, refresh_token } = result;

    const isProd = !!process.env.NODE_ENV?.startsWith('prod');

    console.log('isProd:', isProd);

    res.cookie('access_token', access_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 60 * 60 * 1000, // ✅ 1 hora (was 15 minutos)
    });

    res.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      secure: isProd,
      sameSite: isProd ? 'none' : 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 dias
    });

    return { message: 'Login successful' };
  }

  @Public()
  @Post('refresh-token')
  @ApiOperation({ summary: 'Refresh access token' })
  @ApiBody({ type: RefreshTokenDTO })
  @ApiResponse({
    status: 200,
    description: 'Returns new access and refresh tokens.',
  })
  @ApiResponse({ status: 401, description: 'Invalid or expired refresh token.' })
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const token = req.cookies['refresh_token'] as string;

    if (!token) {
      throw new UnauthorizedException('Refresh token not found');
    }
    const { access_token, refresh_token } = await this.authService.refreshToken(token, req);

    res.cookie('access_token', access_token, {
      httpOnly: true,
      secure: !!process.env.NODE_ENV?.startsWith('prod'),
      sameSite: 'strict',
       maxAge: 60 * 60 * 1000,
    });

    res.cookie('refresh_token', refresh_token, {
      httpOnly: true,
      secure: !!process.env.NODE_ENV?.startsWith('prod'),
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return { message: 'Tokens refreshed successfully' };
  }

  @Post('logout')
  @HttpCode(HttpStatus.OK)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Logs out the current user',
    description:
      'Removes the current refresh token from the active session, clears authentication cookies, and invalidates the login for this device.',
  })
  @ApiResponse({
    status: 200,
    description: 'Logout completed successfully.',
    schema: {
      example: { success: true, message: 'Logout successful' },
    },
  })
  @ApiResponse({
    status: 401,
    description: 'Invalid or expired JWT token.',
  })
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refresh_token =
      (req.cookies?.['refresh_token'] as string) || (req.headers?.['x-refresh-token'] as string);

    if (!refresh_token) {
      return { success: false, message: 'Refresh token not provided' };
    }

    await this.authService.logout(refresh_token);

    const is_prod = !!process.env.NODE_ENV?.startsWith('prod');

    res.clearCookie('access_token', {
      httpOnly: true,
      sameSite: is_prod ? 'none' : 'lax',
      secure: is_prod,
    });

    res.clearCookie('refresh_token', {
      httpOnly: true,
      sameSite: is_prod ? 'none' : 'lax',
      secure: is_prod,
    });

    return { success: true, message: 'Logout successful' };
  }

  @Public()
  @Post('forgot-password')
  @ApiOperation({ 
    summary: 'Solicitar reset de senha',
    description: 'Envia um email com link para redefinir a senha do usuário'
  })
  @ApiBody({ type: ForgotPasswordDTO })
  @ApiResponse({
    status: 200,
    description: 'Email de reset enviado se o usuário existir.',
    schema: {
      example: { 
        message: 'Se o email existir em nossa base, você receberá as instruções para redefinir sua senha.' 
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Dados inválidos.' })
  async forgotPassword(@Body() forgotPasswordDto: ForgotPasswordDTO, @Req() req: Request) {
    return this.authService.forgotPassword(forgotPasswordDto.email, req);
  }

  @Public()
  @Post('reset-password')
  @ApiOperation({ 
    summary: 'Redefinir senha',
    description: 'Redefine a senha do usuário usando o token recebido por email'
  })
  @ApiBody({ type: ResetPasswordDTO })
  @ApiResponse({
    status: 200,
    description: 'Senha redefinida com sucesso.',
    schema: {
      example: { 
        message: 'Senha redefinida com sucesso. Faça login com sua nova senha.' 
      }
    }
  })
  @ApiResponse({ status: 400, description: 'Token inválido ou dados incorretos.' })
  @ApiResponse({ status: 404, description: 'Usuário não encontrado.' })
  async resetPassword(@Body() resetPasswordDto: ResetPasswordDTO, @Req() req: Request) {
    return this.authService.resetPassword(
      resetPasswordDto.user_id,
      resetPasswordDto.token,
      resetPasswordDto.new_password,
      resetPasswordDto.confirm_password,
      req
    );
  }
}
