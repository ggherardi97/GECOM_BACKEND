import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Req } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { Public } from '../auth/decorators/public.decorator';
import { ScarletDriveService } from './scarlet-drive.service';

@ApiTags('public-scarlet-drive')
@Public()
@Controller(['public/scarlet-drive', 'scarlet-drive'])
export class ScarletDriveController {
  constructor(private readonly service: ScarletDriveService) {}

  @Get('state')
  async getState(@Req() req: Request) {
    return this.service.getState(this.getRequestIp(req));
  }

  @Post('voter-access')
  async registerVoterAccess(@Req() req: Request, @Body() body: any) {
    return this.service.registerVoterAccess({
      voter: body?.voter,
      forceOverride: body?.forceOverride,
      ip: this.getRequestIp(req),
    });
  }

  @Post('guests')
  async createGuest(@Req() req: Request, @Body() body: any) {
    return this.service.createGuest(
      {
        name: body?.name,
        invitedBy: body?.invitedBy,
        isPaid: body?.isPaid ?? body?.pago,
        isConfirmed: body?.isConfirmed ?? body?.confirmed,
      },
      this.getRequestIp(req),
    );
  }

  @Patch('guests/:id')
  async updateGuest(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.service.updateGuest(
      id,
      {
        name: body?.name,
        invitedBy: body?.invitedBy,
        isPaid: body?.isPaid ?? body?.pago,
        isConfirmed: body?.isConfirmed ?? body?.confirmed,
      },
      this.getRequestIp(req),
    );
  }

  @Delete('guests/:id')
  async deleteGuest(@Req() req: Request, @Param('id') id: string) {
    return this.service.deleteGuest(id, this.getRequestIp(req));
  }

  @Post('songs')
  async createRepertoireSong(@Req() req: Request, @Body() body: any) {
    return this.service.createRepertoireSong(
      {
        name: body?.name,
        suggestedBy: body?.suggestedBy,
      },
      this.getRequestIp(req),
    );
  }

  @Patch('songs/:id')
  async updateRepertoireSong(@Req() req: Request, @Param('id') id: string, @Body() body: any) {
    return this.service.updateRepertoireSong(
      id,
      {
        name: body?.name,
        suggestedBy: body?.suggestedBy,
      },
      this.getRequestIp(req),
    );
  }

  @Delete('songs/:id')
  async deleteRepertoireSong(@Req() req: Request, @Param('id') id: string) {
    return this.service.deleteRepertoireSong(id, this.getRequestIp(req));
  }

  @Post('songs/reorder')
  async reorderRepertoireSongs(@Req() req: Request, @Body() body: any) {
    return this.service.reorderRepertoireSongs(body?.orderedIds, this.getRequestIp(req));
  }

  @Post('vote-sessions')
  async createVoteSession(@Req() req: Request, @Body() body: any) {
    return this.service.createVoteSession(
      {
        name: body?.name,
        songs: body?.songs,
        voter: body?.voter,
        answerMode: body?.answerMode,
        isSecret: body?.isSecret,
        maxPositiveVotesPerVoter: body?.maxPositiveVotesPerVoter,
        forceOverride: body?.forceOverride,
      },
      this.getRequestIp(req),
    );
  }

  @Post('vote-sessions/:sessionId/songs')
  async addVoteSessionSong(@Req() req: Request, @Param('sessionId') sessionId: string, @Body() body: any) {
    return this.service.addVoteSessionSong(
      {
        sessionId,
        name: body?.name,
        suggestedBy: body?.suggestedBy,
        voter: body?.voter,
        forceOverride: body?.forceOverride,
      },
      this.getRequestIp(req),
    );
  }

  @Patch('vote-sessions/:sessionId/settings')
  async updateVoteSessionSettings(@Req() req: Request, @Param('sessionId') sessionId: string, @Body() body: any) {
    return this.service.updateVoteSessionSettings(
      {
        sessionId,
        voter: body?.voter,
        answerMode: body?.answerMode,
        forceOverride: body?.forceOverride,
      },
      this.getRequestIp(req),
    );
  }

  @Delete('vote-sessions/:sessionId')
  async deleteVoteSession(@Req() req: Request, @Param('sessionId') sessionId: string, @Body() body: any) {
    return this.service.deleteVoteSession(
      {
        sessionId,
        voter: body?.voter,
        forceOverride: body?.forceOverride,
      },
      this.getRequestIp(req),
    );
  }

  @Delete('vote-sessions/:sessionId/songs/:songId')
  async deleteVoteSessionSong(
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Param('songId') songId: string,
    @Body() body: any,
  ) {
    return this.service.deleteVoteSessionSong(
      {
        sessionId,
        songId,
        voter: body?.voter,
        forceOverride: body?.forceOverride,
      },
      this.getRequestIp(req),
    );
  }

  @Put('vote-sessions/:sessionId/songs/:songId/vote')
  async voteOnSong(
    @Req() req: Request,
    @Param('sessionId') sessionId: string,
    @Param('songId') songId: string,
    @Body() body: any,
  ) {
    return this.service.voteOnSong(
      {
        sessionId,
        songId,
        voter: body?.voter,
        vote: body?.vote,
        forceOverride: body?.forceOverride,
      },
      this.getRequestIp(req),
    );
  }

  private getRequestIp(req: Request): string | null {
    const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
    const realIp = String(req.headers['x-real-ip'] || '').trim();
    const raw = forwarded || realIp || String(req.ip || req.socket?.remoteAddress || '').trim();
    const normalized = raw.replace(/^::ffff:/i, '').trim();
    return normalized || null;
  }
}
