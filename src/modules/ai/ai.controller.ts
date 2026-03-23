import { Body, Controller, Post, Req, UnauthorizedException, UseGuards } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AiService } from './ai.service';
import { AiGridFilterDto } from './dto/grid-filter.dto';
import { AiDashboardDto } from './dto/dashboard.dto';
import { AiHomeSearchDto } from './dto/home-search.dto';
import { AiChatDto } from './dto/chat.dto';
import { AuthUser } from './ai.types';

@ApiTags('ai')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@Controller('ai')
export class AiController {
  constructor(private readonly aiService: AiService) {}

  private getUser(req: Request): AuthUser {
    const user = ((req as any)?.user ?? {}) as any;

    const id = String(user.id ?? user.user_id ?? user.userId ?? user.sub ?? '').trim();
    const tenantId = String(user.tenant_id ?? user.tenantId ?? '').trim();

    if (!id || !tenantId) {
      throw new UnauthorizedException('Contexto de autenticacao ausente: req.user.id / req.user.tenant_id');
    }

    return {
      id,
      tenant_id: tenantId,
      role: user.role ? String(user.role) : undefined,
    };
  }

  @Post('grid-filter')
  @ApiOperation({ summary: 'Converte linguagem natural em definition_json de grid' })
  async gridFilter(@Req() req: Request, @Body() dto: AiGridFilterDto) {
    return this.aiService.generateGridFilter({
      user: this.getUser(req),
      entityName: dto.entityName,
      naturalLanguage: dto.naturalLanguage,
      currentViewDefinitionJson: dto.currentViewDefinitionJson,
    });
  }

  @Post('dashboard')
  @ApiOperation({ summary: 'Gera dashboardSpec e executa dados agregados' })
  async dashboard(@Req() req: Request, @Body() dto: AiDashboardDto) {
    return this.aiService.generateDashboard({
      user: this.getUser(req),
      naturalLanguage: dto.naturalLanguage,
      entityHints: dto.entityHints,
    });
  }

  @Post('home-search')
  @ApiOperation({ summary: 'Busca global com IA e sugere filtros estruturados' })
  async homeSearch(@Req() req: Request, @Body() dto: AiHomeSearchDto) {
    return this.aiService.homeSearch({
      user: this.getUser(req),
      query: dto.query,
      entities: dto.entities,
    });
  }

  @Post('chat')
  @ApiOperation({ summary: 'Chat amplo de IA para dashboards, relatorios, registros e consultas' })
  async chat(@Req() req: Request, @Body() dto: AiChatDto) {
    return this.aiService.chat({
      user: this.getUser(req),
      lang: dto.lang,
      confirmed: dto.confirmed,
      draft: dto.draft,
      messages: dto.messages,
    });
  }
}

