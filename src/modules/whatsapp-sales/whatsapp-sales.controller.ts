import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { AccessResource } from '../access-control/decorators/access-resource.decorator';
import { Public } from '../auth/decorators/public.decorator';
import { WhatsappSalesService } from './whatsapp-sales.service';
import { CreateWhatsappIntegrationDto } from './dto/create-whatsapp-integration.dto';
import { UpdateWhatsappIntegrationDto } from './dto/update-whatsapp-integration.dto';
import { ListWhatsappConversationsDto } from './dto/list-whatsapp-conversations.dto';
import { SendWhatsappMessageDto } from './dto/send-whatsapp-message.dto';
import { ProvisionWhatsappIntegrationDto } from './dto/provision-whatsapp-integration.dto';
import { UpdateWhatsappConversationWorkflowDto } from './dto/update-whatsapp-conversation-workflow.dto';
import { CreateWhatsappConversationNoteDto } from './dto/create-whatsapp-conversation-note.dto';
import { UpdateWhatsappConversationConsentDto } from './dto/update-whatsapp-conversation-consent.dto';
import { CreateWhatsappTemplateDto } from './dto/create-whatsapp-template.dto';
import { UpdateWhatsappTemplateDto } from './dto/update-whatsapp-template.dto';
import { CreateWhatsappCampaignDto } from './dto/create-whatsapp-campaign.dto';
import { UpdateWhatsappCampaignDto } from './dto/update-whatsapp-campaign.dto';
import { LaunchWhatsappCampaignDto } from './dto/launch-whatsapp-campaign.dto';

@ApiTags('sales-whatsapp')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard, RolesGuard)
@AccessResource('whatsapp_conversations')
@Controller('sales/whatsapp')
export class WhatsappSalesController {
  constructor(private readonly service: WhatsappSalesService) {}

  private getUser(req: Request) {
    const user = ((req as any)?.user ?? {}) as any;
    const id = String(user.id ?? user.user_id ?? user.userId ?? user.sub ?? '').trim();
    const tenantId = String(user.tenant_id ?? user.tenantId ?? '').trim();

    if (!id || !tenantId) {
      throw new UnauthorizedException('Authentication context missing: req.user.id / req.user.tenant_id');
    }

    return {
      id,
      user_id: id,
      tenant_id: tenantId,
      role: user.role ? String(user.role) : undefined,
    };
  }

  @Get('meta')
  async getMeta(@Req() req: Request) {
    return this.service.getMeta(this.getUser(req));
  }

  @Get('integrations')
  async listIntegrations(@Req() req: Request) {
    return this.service.listIntegrations(this.getUser(req));
  }

  @Get('integrations/:id')
  async getIntegration(@Req() req: Request, @Param('id') id: string) {
    return this.service.getIntegration(this.getUser(req), id);
  }

  @Post('integrations')
  async createIntegration(@Req() req: Request, @Body() dto: CreateWhatsappIntegrationDto) {
    return this.service.createIntegration(this.getUser(req), dto);
  }

  @Post('integrations/provision')
  async provisionIntegration(@Req() req: Request, @Body() dto: ProvisionWhatsappIntegrationDto) {
    return this.service.provisionIntegration(this.getUser(req), dto);
  }

  @Patch('integrations/:id')
  async updateIntegration(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateWhatsappIntegrationDto) {
    return this.service.updateIntegration(this.getUser(req), id, dto);
  }

  @Post('integrations/:id/connect')
  async connectIntegration(@Req() req: Request, @Param('id') id: string, @Body() dto: SendWhatsappMessageDto) {
    return this.service.connectIntegration(this.getUser(req), id, dto);
  }

  @Post('integrations/:id/test-send')
  async sendTest(@Req() req: Request, @Param('id') id: string, @Body() dto: SendWhatsappMessageDto) {
    return this.service.sendTestMessage(this.getUser(req), id, dto);
  }

  @Get('integrations/:id/qrcode')
  async getQrCode(@Req() req: Request, @Param('id') id: string) {
    return this.service.getIntegrationQrCode(this.getUser(req), id);
  }

  @Get('conversations')
  async listConversations(@Req() req: Request, @Query() query: ListWhatsappConversationsDto) {
    return this.service.listConversations(this.getUser(req), query);
  }

  @Get('conversations/:id')
  async getConversation(@Req() req: Request, @Param('id') id: string) {
    return this.service.getConversation(this.getUser(req), id);
  }

  @Get('conversations/:id/messages')
  async listMessages(@Req() req: Request, @Param('id') id: string) {
    return this.service.listMessages(this.getUser(req), id);
  }

  @Patch('conversations/:id/workflow')
  async updateWorkflow(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateWhatsappConversationWorkflowDto,
  ) {
    return this.service.updateConversationWorkflow(this.getUser(req), id, dto);
  }

  @Post('conversations/:id/claim')
  async claimConversation(@Req() req: Request, @Param('id') id: string) {
    return this.service.claimConversation(this.getUser(req), id);
  }

  @Post('conversations/:id/release')
  async releaseConversation(@Req() req: Request, @Param('id') id: string) {
    return this.service.releaseConversation(this.getUser(req), id);
  }

  @Post('conversations/:id/reply')
  async reply(@Req() req: Request, @Param('id') id: string, @Body() dto: SendWhatsappMessageDto) {
    return this.service.replyToConversation(this.getUser(req), id, dto);
  }

  @Post('conversations/:id/reprocess')
  async reprocess(@Req() req: Request, @Param('id') id: string) {
    return this.service.reprocessConversation(this.getUser(req), id);
  }

  @Get('conversations/:id/notes')
  async listNotes(@Req() req: Request, @Param('id') id: string) {
    return this.service.listConversationNotes(this.getUser(req), id);
  }

  @Post('conversations/:id/notes')
  async addNote(@Req() req: Request, @Param('id') id: string, @Body() dto: CreateWhatsappConversationNoteDto) {
    return this.service.addConversationNote(this.getUser(req), id, dto);
  }

  @Patch('conversations/:id/consent')
  async updateConsent(
    @Req() req: Request,
    @Param('id') id: string,
    @Body() dto: UpdateWhatsappConversationConsentDto,
  ) {
    return this.service.updateConversationConsent(this.getUser(req), id, dto);
  }

  @Get('templates')
  async listTemplates(@Req() req: Request, @Query('integration_id') integrationId?: string) {
    return this.service.listTemplates(this.getUser(req), integrationId);
  }

  @Post('templates')
  async createTemplate(@Req() req: Request, @Body() dto: CreateWhatsappTemplateDto) {
    return this.service.createTemplate(this.getUser(req), dto);
  }

  @Patch('templates/:id')
  async updateTemplate(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateWhatsappTemplateDto) {
    return this.service.updateTemplate(this.getUser(req), id, dto);
  }

  @Get('campaigns')
  async listCampaigns(@Req() req: Request, @Query('integration_id') integrationId?: string) {
    return this.service.listCampaigns(this.getUser(req), integrationId);
  }

  @Get('campaigns/:id')
  async getCampaign(@Req() req: Request, @Param('id') id: string) {
    return this.service.getCampaign(this.getUser(req), id);
  }

  @Post('campaigns')
  async createCampaign(@Req() req: Request, @Body() dto: CreateWhatsappCampaignDto) {
    return this.service.createCampaign(this.getUser(req), dto);
  }

  @Patch('campaigns/:id')
  async updateCampaign(@Req() req: Request, @Param('id') id: string, @Body() dto: UpdateWhatsappCampaignDto) {
    return this.service.updateCampaign(this.getUser(req), id, dto);
  }

  @Post('campaigns/:id/launch')
  async launchCampaign(@Req() req: Request, @Param('id') id: string, @Body() dto: LaunchWhatsappCampaignDto) {
    return this.service.launchCampaign(this.getUser(req), id, dto);
  }

  @Public()
  @Post('webhook/:token')
  async handleWebhook(
    @Param('token') token: string,
    @Query('secret') secret: string | undefined,
    @Body() body: Record<string, unknown>,
  ) {
    return this.service.handleWebhook(token, secret, body || {});
  }
}
