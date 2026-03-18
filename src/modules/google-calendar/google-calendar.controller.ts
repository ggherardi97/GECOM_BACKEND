import {
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { GoogleCalendarService } from './google-calendar.service';

type AuthUser = {
  id: string;
  tenant_id: string;
  role?: string;
};

@ApiTags('google-calendar')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('google-calendar')
export class GoogleCalendarController {
  constructor(private readonly service: GoogleCalendarService) {}

  private getUser(req: Request): AuthUser {
    const user = ((req as any)?.user ?? {}) as any;
    const id = String(user.id ?? user.user_id ?? user.userId ?? user.sub ?? '').trim();
    const tenantId = String(user.tenant_id ?? user.tenantId ?? '').trim();
    const role = String(user.role ?? '').trim();
    if (!id || !tenantId) {
      throw new UnauthorizedException('Authentication context missing: req.user.id / req.user.tenant_id');
    }
    return { id, tenant_id: tenantId, role };
  }

  @Get('connect')
  async connect(@Req() req: Request, @Res() res: Response, @Query('return_to') returnTo?: string) {
    const url = await this.service.buildConnectUrl(this.getUser(req), req, returnTo);
    return res.redirect(url);
  }

  @Get('callback')
  async callback(@Req() req: Request, @Res() res: Response, @Query() query: Record<string, any>) {
    try {
      const result = await this.service.finalizeOAuthCallback(this.getUser(req), req, query);
      return res
        .status(200)
        .type('html')
        .send(this.renderPopupResponse(result.ok, result.message, result.returnTo, result.targetOrigin));
    } catch (error: any) {
      const message = String(error?.message || 'Falha ao conectar Google Agenda.');
      return res
        .status(200)
        .type('html')
        .send(this.renderPopupResponse(false, message, '/servico/agenda', '*'));
    }
  }

  @Get('status')
  async status(@Req() req: Request) {
    return this.service.getStatus(this.getUser(req));
  }

  @Get('calendars')
  async calendars(@Req() req: Request) {
    return this.service.listCalendars(this.getUser(req));
  }

  @Post('settings')
  async settings(@Req() req: Request, @Body() body: any) {
    return this.service.saveSettings(this.getUser(req), body || {});
  }

  @Post('sync-now')
  async syncNow(@Req() req: Request) {
    return this.service.syncNow(this.getUser(req));
  }

  @Post('disconnect')
  async disconnect(@Req() req: Request) {
    return this.service.disconnect(this.getUser(req));
  }

  private renderPopupResponse(ok: boolean, message: string, returnTo: string, targetOrigin: string) {
    const safeMessage = JSON.stringify(String(message || ''));
    const safeReturnTo = JSON.stringify(String(returnTo || '/servico/agenda'));
    const safeOrigin = JSON.stringify(String(targetOrigin || '*'));

    return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Google Agenda</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        background: linear-gradient(160deg, #edf7ff 0%, #f6fbff 45%, #ffffff 100%);
        font-family: "Segoe UI", Arial, sans-serif;
        color: #213547;
      }
      .card {
        width: min(440px, calc(100vw - 32px));
        border: 1px solid rgba(64, 92, 136, 0.12);
        border-radius: 20px;
        background: rgba(255,255,255,0.96);
        box-shadow: 0 18px 40px rgba(42, 66, 110, 0.14);
        padding: 28px 26px;
      }
      .badge {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        padding: 8px 12px;
        border-radius: 999px;
        font-size: 12px;
        font-weight: 700;
        letter-spacing: .02em;
        background: ${ok ? '#e8f7ef' : '#fff1f0'};
        color: ${ok ? '#16794b' : '#b42318'};
      }
      h1 {
        margin: 16px 0 10px;
        font-size: 24px;
      }
      p {
        margin: 0 0 20px;
        line-height: 1.55;
        color: #526476;
      }
      a {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        padding: 10px 14px;
        border-radius: 12px;
        text-decoration: none;
        font-weight: 700;
        color: #ffffff;
        background: #1f7aec;
      }
    </style>
  </head>
  <body>
    <div class="card">
      <span class="badge">${ok ? 'Conectado' : 'Falha na conexão'}</span>
      <h1>${ok ? 'Google Agenda conectada' : 'Não foi possível concluir a conexão'}</h1>
      <p id="popupMessage"></p>
      <a id="popupLink" href="#">Voltar para a agenda</a>
    </div>
    <script>
      (function () {
        var message = ${safeMessage};
        var returnTo = ${safeReturnTo};
        var targetOrigin = ${safeOrigin};
        document.getElementById("popupMessage").textContent = message;
        document.getElementById("popupLink").setAttribute("href", returnTo);

        try {
          if (window.opener && !window.opener.closed) {
            window.opener.postMessage({
              type: "gecom:google-calendar-connection",
              ok: ${ok ? 'true' : 'false'},
              message: message
            }, targetOrigin === "*" ? "*" : targetOrigin);
            window.close();
            return;
          }
        } catch (_) {}

        setTimeout(function () {
          window.location.href = returnTo;
        }, 1600);
      })();
    </script>
  </body>
</html>`;
  }
}
