import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { RefreshSessionGuard } from './guards/refresh-session.guard';
import { Public } from './decorators/public.decorator';

@Controller('auth')
export class AuthMeController {
  constructor(private readonly prisma: PrismaService) {}

  @Public()
  @UseGuards(RefreshSessionGuard)
  @Get('me')
  async me(@Req() req: any) {
    const userId: string | null = req.user?.userId ?? null;
    if (!userId) return null;

    return this.prisma.users.findUnique({
      where: { id: userId },
      select: {
        id: true,
        tenant_id: true,
        full_name: true,
        email: true,
        role: true,
        status: true,
        phonenumber: true,
        first_access: true,
        company_id: true,
        created_at: true,
        updated_at: true,
      },
    });
  }
}
