import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import {
  ScarletDriveGuest,
  ScarletDriveRepertoireSong,
  ScarletDriveRepository,
  ScarletDriveVoteSession,
} from './scarlet-drive.repository';

const HOST_OPTIONS = Object.freeze(['Diogo', 'Gustavo', 'Gill', 'Renan', 'Leonardo', 'Natalie']);
const HOST_SET = new Set(HOST_OPTIONS);
const ANSWER_MODE_YES_NO = 'yes_no';
const ANSWER_MODE_RATING = 'rating_1_5';
const ANSWER_MODE_SET = new Set([ANSWER_MODE_YES_NO, ANSWER_MODE_RATING]);
const LIMIT_TOTAL = 120;
const LIMIT_PER_HOST = 24;
const DEFAULT_MAX_POSITIVE_VOTES_PER_VOTER = 5;
const MAX_ALLOWED_POSITIVE_VOTES_PER_VOTER = 99;
const IP_MISMATCH_MESSAGE = 'Você está em um IP diferente, está tentando votar em nome de outro seu safado?';

@Injectable()
export class ScarletDriveService {
  constructor(private readonly repository: ScarletDriveRepository) {}

  async getState(ip: string | null) {
    const [guests, songs, voteSessions, currentIpLock] = await Promise.all([
      this.repository.listGuests(),
      this.repository.listRepertoireSongs(),
      this.repository.listVoteSessions(),
      ip ? this.repository.findVoterIpLockByIp(ip) : Promise.resolve(null),
    ]);

    return this.buildPayload(guests, songs, voteSessions, currentIpLock?.voter ?? null);
  }

  async registerVoterAccess(input: { voter: unknown; ip: string | null; forceOverride?: boolean }) {
    const voter = this.parseHost(input.voter, 'Votante');
    await this.repository.transaction(async (tx) => {
      await this.registerOrValidateVoterIp(voter, input.ip, Boolean(input.forceOverride), tx);
    });
    return this.getState(input.ip);
  }

  async createGuest(input: { name: unknown; invitedBy: unknown; isPaid?: unknown; isConfirmed?: unknown }, ip: string | null) {
    const name = this.parseGuestName(input.name);
    const invitedBy = this.parseHost(input.invitedBy, 'Convidado por');
    const isPaid = this.parseBoolean(input.isPaid ?? false, 'isPaid');
    const isConfirmed = this.parseBoolean(input.isConfirmed ?? false, 'isConfirmed');

    await this.repository.transaction(async (tx) => {
      const guests = await this.repository.listGuests(tx);
      if (this.hasDuplicateGuestName(guests, name)) {
        throw new BadRequestException('Ja existe convidado com esse nome.');
      }
      this.enforceConfirmedLimit(guests, isConfirmed);
      await this.repository.createGuest({ name, invited_by: invitedBy, is_paid: isPaid, is_confirmed: isConfirmed }, tx);
    });

    return this.getState(ip);
  }

  async updateGuest(id: string, input: Record<string, unknown>, ip: string | null) {
    await this.repository.transaction(async (tx) => {
      const current = await this.repository.findGuestById(id, tx);
      if (!current) throw new NotFoundException('Convidado nao encontrado.');

      const guests = await this.repository.listGuests(tx);
      const nextName = Object.prototype.hasOwnProperty.call(input, 'name') ? this.parseGuestName(input.name) : current.name;
      const invitedBy = Object.prototype.hasOwnProperty.call(input, 'invitedBy')
        ? this.parseHost(input.invitedBy, 'Convidado por')
        : current.invited_by;
      const isPaid = Object.prototype.hasOwnProperty.call(input, 'isPaid')
        ? this.parseBoolean(input.isPaid, 'isPaid')
        : current.is_paid;
      const isConfirmed = Object.prototype.hasOwnProperty.call(input, 'isConfirmed')
        ? this.parseBoolean(input.isConfirmed, 'isConfirmed')
        : current.is_confirmed;

      if (this.hasDuplicateGuestName(guests, nextName, id)) {
        throw new BadRequestException('Ja existe convidado com esse nome.');
      }
      this.enforceConfirmedLimit(guests, isConfirmed, current.is_confirmed ? id : null);

      await this.repository.updateGuest(
        id,
        { name: nextName, invited_by: invitedBy, is_paid: isPaid, is_confirmed: isConfirmed },
        tx,
      );
    });

    return this.getState(ip);
  }

  async deleteGuest(id: string, ip: string | null) {
    const removed = await this.repository.deleteGuest(id);
    if (!removed) throw new NotFoundException('Convidado nao encontrado.');
    return this.getState(ip);
  }

  async createRepertoireSong(input: { name: unknown; suggestedBy: unknown }, ip: string | null) {
    const name = this.parseSongName(input.name);
    const suggestedBy = this.parseHost(input.suggestedBy, 'Sugerido por');

    await this.repository.transaction(async (tx) => {
      const songs = await this.repository.listRepertoireSongs(tx);
      if (this.hasDuplicateSongName(songs, name)) {
        throw new BadRequestException('Ja existe musica com esse nome no repertorio.');
      }
      await this.repository.createRepertoireSong(
        {
          name,
          suggested_by: suggestedBy,
          sort_order: songs.length + 1,
        },
        tx,
      );
    });

    return this.getState(ip);
  }

  async updateRepertoireSong(id: string, input: Record<string, unknown>, ip: string | null) {
    await this.repository.transaction(async (tx) => {
      const current = await this.repository.findRepertoireSongById(id, tx);
      if (!current) throw new NotFoundException('Musica nao encontrada.');

      const songs = await this.repository.listRepertoireSongs(tx);
      const nextName = Object.prototype.hasOwnProperty.call(input, 'name') ? this.parseSongName(input.name) : current.name;
      const suggestedBy = Object.prototype.hasOwnProperty.call(input, 'suggestedBy')
        ? this.parseHost(input.suggestedBy, 'Sugerido por')
        : current.suggested_by;

      if (this.hasDuplicateSongName(songs, nextName, id)) {
        throw new BadRequestException('Ja existe musica com esse nome no repertorio.');
      }

      await this.repository.updateRepertoireSong(id, { name: nextName, suggested_by: suggestedBy }, tx);
    });

    return this.getState(ip);
  }

  async deleteRepertoireSong(id: string, ip: string | null) {
    await this.repository.transaction(async (tx) => {
      const current = await this.repository.findRepertoireSongById(id, tx);
      if (!current) throw new NotFoundException('Musica nao encontrada.');
      await this.repository.deleteRepertoireSong(id, tx);
      const songs = await this.repository.listRepertoireSongs(tx);
      await this.repository.reorderRepertoireSongs(songs.map((song) => song.id), tx);
    });

    return this.getState(ip);
  }

  async reorderRepertoireSongs(orderedIds: unknown, ip: string | null) {
    await this.repository.transaction(async (tx) => {
      const songs = await this.repository.listRepertoireSongs(tx);
      const normalizedIds = Array.isArray(orderedIds) ? orderedIds.map((value) => String(value || '').trim()).filter(Boolean) : [];
      if (normalizedIds.length !== songs.length) {
        throw new BadRequestException('Ordenacao invalida do repertorio.');
      }
      const known = new Set(songs.map((song) => song.id));
      if (normalizedIds.some((id) => !known.has(id))) {
        throw new BadRequestException('Ordenacao invalida do repertorio.');
      }
      await this.repository.reorderRepertoireSongs(normalizedIds, tx);
    });

    return this.getState(ip);
  }

  async createVoteSession(
    input: {
      name: unknown;
      songs: unknown;
      voter: unknown;
      answerMode: unknown;
      isSecret: unknown;
      maxPositiveVotesPerVoter: unknown;
      forceOverride?: boolean;
    },
    ip: string | null,
  ) {
    const name = this.parseVoteSessionName(input.name);
    const voter = this.parseHost(input.voter, 'Votante');
    const parsedSongs = this.parseVoteSessionOptions(input.songs, voter);
    const answerMode = this.parseAnswerMode(input.answerMode);
    const isSecret = this.parseBoolean(input.isSecret ?? false, 'Voto secreto');
    const maxPositiveVotesPerVoter = this.parseMaxPositiveVotesPerVoter(input.maxPositiveVotesPerVoter);

    await this.repository.transaction(async (tx) => {
      await this.registerOrValidateVoterIp(voter, ip, Boolean(input.forceOverride), tx);

      const [sessions, repertoireSongs] = await Promise.all([
        this.repository.listVoteSessions(tx),
        this.repository.listRepertoireSongs(tx),
      ]);

      if (this.hasDuplicateVoteSessionName(sessions, name)) {
        throw new BadRequestException('Ja existe uma votacao com esse nome.');
      }

      parsedSongs.forEach((song) => {
        if (this.hasDuplicateSongName(repertoireSongs, song.name)) {
          throw new BadRequestException('Essa opcao ja esta no repertorio atual.');
        }
      });

      await this.repository.createVoteSession(
        {
          name,
          isActive: true,
          answerMode,
          isSecret,
          maxYesVotesPerVoter: maxPositiveVotesPerVoter,
          songs: parsedSongs.map((song, index) => ({
            name: song.name,
            suggestedBy: song.suggestedBy,
            sortOrder: index + 1,
          })),
        },
        tx,
      );
    });

    return this.getState(ip);
  }

  async addVoteSessionSong(
    input: { sessionId: string; name: unknown; suggestedBy: unknown; voter: unknown; forceOverride?: boolean },
    ip: string | null,
  ) {
    const name = this.parseVoteOptionName(input.name);
    const suggestedBy = this.parseHost(input.suggestedBy, 'Sugerido por');
    const voter = this.parseHost(input.voter, 'Votante');

    await this.repository.transaction(async (tx) => {
      await this.registerOrValidateVoterIp(voter, ip, Boolean(input.forceOverride), tx);
      const session = await this.repository.findVoteSessionById(input.sessionId, tx);
      if (!session) throw new NotFoundException('Votacao nao encontrada.');

      const repertoireSongs = await this.repository.listRepertoireSongs(tx);
      if (this.hasDuplicateSongName(session.songs, name)) {
        throw new BadRequestException('Ja existe uma opcao com esse nome nessa votacao.');
      }
      if (this.hasDuplicateSongName(repertoireSongs, name)) {
        throw new BadRequestException('Essa opcao ja esta no repertorio atual.');
      }

      await this.repository.createVoteSessionSong(
        {
          voteSessionId: session.id,
          name,
          suggestedBy,
          sortOrder: session.songs.length + 1,
        },
        tx,
      );
    });

    return this.getState(ip);
  }

  async deleteVoteSession(input: { sessionId: string; voter: unknown; forceOverride?: boolean }, ip: string | null) {
    const voter = this.parseHost(input.voter, 'Votante');

    await this.repository.transaction(async (tx) => {
      await this.registerOrValidateVoterIp(voter, ip, Boolean(input.forceOverride), tx);
      const session = await this.repository.findVoteSessionById(input.sessionId, tx);
      if (!session) throw new NotFoundException('Votacao nao encontrada.');
      await this.repository.deleteVoteSession(session.id, tx);
    });

    return this.getState(ip);
  }

  async updateVoteSessionSettings(
    input: { sessionId: string; voter: unknown; answerMode?: unknown; forceOverride?: boolean },
    ip: string | null,
  ) {
    const voter = this.parseHost(input.voter, 'Votante');

    await this.repository.transaction(async (tx) => {
      await this.registerOrValidateVoterIp(voter, ip, Boolean(input.forceOverride), tx);
      const session = await this.repository.findVoteSessionById(input.sessionId, tx);
      if (!session) throw new NotFoundException('Votacao nao encontrada.');

      const nextAnswerMode = Object.prototype.hasOwnProperty.call(input, 'answerMode')
        ? this.parseAnswerMode(input.answerMode)
        : session.answer_mode;

      if (nextAnswerMode !== session.answer_mode) {
        await this.repository.updateVoteSession(session.id, { answer_mode: nextAnswerMode }, tx);

        if (session.answer_mode === ANSWER_MODE_YES_NO && nextAnswerMode === ANSWER_MODE_RATING) {
          const existingVotes = session.songs.flatMap((song) => song.votes);
          await Promise.all(
            existingVotes.map((voteEntry) =>
              this.repository.updateVote(
                voteEntry.id,
                { vote: voteEntry.vote === 'yes' ? '5' : '1' },
                tx,
              ),
            ),
          );
        }
      }
    });

    return this.getState(ip);
  }

  async deleteVoteSessionSong(input: { sessionId: string; songId: string; voter: unknown; forceOverride?: boolean }, ip: string | null) {
    const voter = this.parseHost(input.voter, 'Votante');

    await this.repository.transaction(async (tx) => {
      await this.registerOrValidateVoterIp(voter, ip, Boolean(input.forceOverride), tx);
      const session = await this.repository.findVoteSessionById(input.sessionId, tx);
      if (!session) throw new NotFoundException('Votacao nao encontrada.');

      const song = session.songs.find((entry) => entry.id === input.songId);
      if (!song) throw new NotFoundException('Musica da votacao nao encontrada.');

      await this.repository.deleteVoteSong(input.songId, tx);
      await this.repository.reorderVoteSessionSongs(session.id, tx);
    });

    return this.getState(ip);
  }

  async voteOnSong(
    input: { sessionId: string; songId: string; voter: unknown; vote: unknown; forceOverride?: boolean },
    ip: string | null,
  ) {
    const voter = this.parseHost(input.voter, 'Votante');

    await this.repository.transaction(async (tx) => {
      await this.registerOrValidateVoterIp(voter, ip, Boolean(input.forceOverride), tx);
      const session = await this.repository.findVoteSessionById(input.sessionId, tx);
      if (!session) throw new NotFoundException('Votacao nao encontrada.');
      const vote = this.parseVoteValue(input.vote, session.answer_mode);

      const song = session.songs.find((entry) => entry.id === input.songId);
      if (!song) throw new NotFoundException('Musica da votacao nao encontrada.');

      await this.enforcePositiveVoteLimit(voter, vote, session, song.id, tx);
      await this.repository.upsertVote({ voteSongId: song.id, voter, vote }, tx);
    });

    return this.getState(ip);
  }

  private buildPayload(
    guests: ScarletDriveGuest[],
    songs: ScarletDriveRepertoireSong[],
    voteSessions: ScarletDriveVoteSession[],
    currentIpVoter: string | null,
  ) {
    const normalizedGuests = guests.map((guest) => ({
      id: guest.id,
      name: guest.name,
      invitedBy: guest.invited_by,
      isPaid: guest.is_paid,
      isConfirmed: guest.is_confirmed,
      createdAt: guest.created_at,
      updatedAt: guest.updated_at,
    }));

    const normalizedSongs = songs.map((song, index) => ({
      id: song.id,
      name: song.name,
      suggestedBy: song.suggested_by,
      order: song.sort_order || index + 1,
      createdAt: song.created_at,
      updatedAt: song.updated_at,
    }));

    const byHost = Object.fromEntries(HOST_OPTIONS.map((host) => [host, 0]));
    let paidYes = 0;
    let confirmedYes = 0;
    normalizedGuests.forEach((guest) => {
      byHost[guest.invitedBy] = (byHost[guest.invitedBy] || 0) + 1;
      if (guest.isPaid) paidYes += 1;
      if (guest.isConfirmed) confirmedYes += 1;
    });

    return {
      guests: normalizedGuests,
      counters: {
        total: normalizedGuests.length,
        byHost,
        paid: { yes: paidYes, no: normalizedGuests.length - paidYes },
        confirmed: { yes: confirmedYes, no: normalizedGuests.length - confirmedYes },
      },
      limits: {
        maxGuests: LIMIT_TOTAL,
        maxPerHost: LIMIT_PER_HOST,
        maxPositiveVotesPerVoter: DEFAULT_MAX_POSITIVE_VOTES_PER_VOTER,
      },
      hosts: HOST_OPTIONS,
      voters: HOST_OPTIONS,
      songs: normalizedSongs,
      voteSessions: voteSessions.map((session) => {
        const normalizedVoteSongs = session.songs.map((song, index) => ({
          id: song.id,
          name: song.name,
          suggestedBy: song.suggested_by,
          order: song.sort_order || index + 1,
          createdAt: song.created_at,
          updatedAt: song.updated_at,
        }));

        const stats = normalizedVoteSongs.map((song) => {
          const votes = session.songs
            .find((entry) => entry.id === song.id)
            ?.votes.map((voteEntry) => ({
              id: voteEntry.id,
              songId: voteEntry.vote_song_id,
              voter: voteEntry.voter,
              vote: voteEntry.vote,
              createdAt: voteEntry.created_at,
              updatedAt: voteEntry.updated_at,
            })) ?? [];
          const yes = votes.filter((voteEntry) => voteEntry.vote === 'yes').length;
          const no = votes.filter((voteEntry) => voteEntry.vote === 'no').length;
          const numericScores = votes
            .map((voteEntry) => Number(voteEntry.vote))
            .filter((score) => Number.isInteger(score) && score >= 1 && score <= 5);
          const scoreTotal = numericScores.reduce((total, score) => total + score, 0);
          const scoreAverage = numericScores.length ? Number((scoreTotal / numericScores.length).toFixed(2)) : 0;
          const percent = session.answer_mode === ANSWER_MODE_RATING
            ? Math.round((scoreTotal / (HOST_OPTIONS.length * 5)) * 100)
            : Math.round((yes / HOST_OPTIONS.length) * 100);
          return {
            songId: song.id,
            name: song.name,
            suggestedBy: song.suggestedBy,
            order: song.order,
            yes,
            no,
            scoreTotal,
            scoreAverage,
            ratingCount: numericScores.length,
            percent,
            voters: session.is_secret ? [] : votes.map((voteEntry) => ({ voter: voteEntry.voter, vote: voteEntry.vote })),
          };
        }).sort((a, b) => {
          const primaryDiff = session.answer_mode === ANSWER_MODE_RATING ? b.scoreTotal - a.scoreTotal : b.yes - a.yes;
          if (primaryDiff !== 0) return primaryDiff;
          if (session.answer_mode === ANSWER_MODE_RATING) {
            const byAverage = b.scoreAverage - a.scoreAverage;
            if (byAverage !== 0) return byAverage;
          }
          const byPercent = b.percent - a.percent;
          if (byPercent !== 0) return byPercent;
          return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
        });

        const flatVotes = session.songs.flatMap((song) =>
          song.votes.map((voteEntry) => ({
            id: voteEntry.id,
            songId: voteEntry.vote_song_id,
            voter: voteEntry.voter,
            vote: voteEntry.vote,
            createdAt: voteEntry.created_at,
            updatedAt: voteEntry.updated_at,
          })),
        );

        return {
          id: session.id,
          name: session.name,
          isActive: session.is_active,
          answerMode: session.answer_mode,
          isSecret: session.is_secret,
          maxPositiveVotesPerVoter: session.max_yes_votes_per_voter || DEFAULT_MAX_POSITIVE_VOTES_PER_VOTER,
          createdAt: session.created_at,
          updatedAt: session.updated_at,
          songs: normalizedVoteSongs,
          votes: flatVotes,
          songStats: stats,
          songCount: normalizedVoteSongs.length,
          yesVotes: flatVotes.filter((voteEntry) => voteEntry.vote === 'yes').length,
          scoreTotal: stats.reduce((total, song) => total + (song.scoreTotal || 0), 0),
        };
      }),
      currentIpVoter,
    };
  }

  private parseBoolean(value: unknown, fieldName: string): boolean {
    if (typeof value === 'boolean') return value;
    if (value === 1 || value === '1') return true;
    if (value === 0 || value === '0') return false;
    if (typeof value === 'string') {
      const normalized = value.trim().toLowerCase();
      if (['sim', 'true', 'yes', 'y'].includes(normalized)) return true;
      if (['nao', 'false', 'no', 'n'].includes(normalized)) return false;
    }
    throw new BadRequestException(`Campo invalido: ${fieldName}. Use Sim ou Nao.`);
  }

  private parseHost(value: unknown, fieldName: string): string {
    const host = String(value || '').trim();
    if (!HOST_SET.has(host)) throw new BadRequestException(`${fieldName} invalido.`);
    return host;
  }

  private parseGuestName(value: unknown): string {
    const name = String(value || '').trim();
    if (!name) throw new BadRequestException('Nome do convidado e obrigatorio.');
    if (name.length > 120) throw new BadRequestException('Nome do convidado muito grande (maximo 120 caracteres).');
    return name;
  }

  private parseSongName(value: unknown): string {
    const name = String(value || '').trim();
    if (!name) throw new BadRequestException('Nome da musica e obrigatorio.');
    if (name.length > 160) throw new BadRequestException('Nome da musica muito grande (maximo 160 caracteres).');
    return name;
  }

  private parseVoteOptionName(value: unknown): string {
    const name = String(value || '').trim();
    if (!name) throw new BadRequestException('Nome da opcao e obrigatorio.');
    if (name.length > 160) throw new BadRequestException('Nome da opcao muito grande (maximo 160 caracteres).');
    return name;
  }

  private parseVoteSessionName(value: unknown): string {
    const name = String(value || '').trim();
    if (!name) throw new BadRequestException('Nome da votacao e obrigatorio.');
    if (name.length > 120) throw new BadRequestException('Nome da votacao muito grande (maximo 120 caracteres).');
    return name;
  }

  private parseAnswerMode(value: unknown): string {
    const normalized = String(value || '').trim().toLowerCase();
    if (!normalized) return ANSWER_MODE_YES_NO;
    if (!ANSWER_MODE_SET.has(normalized)) {
      throw new BadRequestException('Tipo de resposta invalido.');
    }
    return normalized;
  }

  private parseVoteValue(value: unknown, answerMode: string): string {
    const normalized = String(value || '').trim().toLowerCase();
    if (answerMode === ANSWER_MODE_RATING) {
      if (['1', '2', '3', '4', '5'].includes(normalized)) return normalized;
      throw new BadRequestException('Nota invalida. Use uma nota de 1 a 5.');
    }
    if (['sim', 'yes', 'y', 'true', '1'].includes(normalized)) return 'yes';
    if (['nao', 'no', 'n', 'false', '0'].includes(normalized)) return 'no';
    throw new BadRequestException('Voto invalido. Use Sim ou Nao.');
  }

  private parseMaxPositiveVotesPerVoter(value: unknown): number {
    const parsed = Number(String(value ?? '').trim());
    if (!Number.isInteger(parsed) || parsed < 1 || parsed > MAX_ALLOWED_POSITIVE_VOTES_PER_VOTER) {
      throw new BadRequestException(
        `Limite de votos Sim invalido. Use um numero entre 1 e ${MAX_ALLOWED_POSITIVE_VOTES_PER_VOTER}.`,
      );
    }
    return parsed;
  }

  private normalizeComparable(value: unknown): string {
    return String(value || '')
      .trim()
      .toLocaleLowerCase('pt-BR')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');
  }

  private hasDuplicateGuestName(guests: Array<{ id: string; name: string }>, name: string, ignoreId?: string): boolean {
    const comparable = this.normalizeComparable(name);
    return guests.some((guest) => guest.id !== ignoreId && this.normalizeComparable(guest.name) === comparable);
  }

  private hasDuplicateSongName(songs: Array<{ id: string; name: string }>, name: string, ignoreId?: string): boolean {
    const comparable = this.normalizeComparable(name);
    return songs.some((song) => song.id !== ignoreId && this.normalizeComparable(song.name) === comparable);
  }

  private hasDuplicateVoteSessionName(sessions: Array<{ id: string; name: string }>, name: string, ignoreId?: string): boolean {
    const comparable = this.normalizeComparable(name);
    return sessions.some((session) => session.id !== ignoreId && this.normalizeComparable(session.name) === comparable);
  }

  private enforceConfirmedLimit(guests: ScarletDriveGuest[], shouldBeConfirmed: boolean, ignoreId?: string | null) {
    if (!shouldBeConfirmed) return;
    const confirmedCount = guests.reduce((total, guest) => {
      if (!guest.is_confirmed) return total;
      if (ignoreId && guest.id === ignoreId) return total;
      return total + 1;
    }, 0);
    if (confirmedCount >= LIMIT_TOTAL) {
      throw new BadRequestException(`Ja existem ${LIMIT_TOTAL} confirmados. Nao e possivel confirmar mais convidados.`);
    }
  }

  private parseVoteSessionOptions(inputSongs: unknown, fallbackSuggestedBy: string) {
    const songs = Array.isArray(inputSongs) ? inputSongs : [];
    if (!songs.length) throw new BadRequestException('Adicione pelo menos uma opcao na votacao.');
    const seen = new Set<string>();
    return songs.map((song) => {
      const name = this.parseVoteOptionName((song as any)?.name);
      const comparable = this.normalizeComparable(name);
      if (seen.has(comparable)) {
        throw new BadRequestException('Nao repita a mesma opcao dentro da mesma votacao.');
      }
      seen.add(comparable);
      const suggestedByRaw = String((song as any)?.suggestedBy || '').trim();
      const suggestedBy = HOST_SET.has(suggestedByRaw) ? suggestedByRaw : fallbackSuggestedBy;
      return { name, suggestedBy };
    });
  }

  private async enforcePositiveVoteLimit(
    voter: string,
    vote: string,
    voteSession: ScarletDriveVoteSession,
    songId: string,
    tx: Prisma.TransactionClient,
  ) {
    if (voteSession.answer_mode !== ANSWER_MODE_YES_NO) return;
    if (vote !== 'yes') return;
    const sessionLimit = voteSession.max_yes_votes_per_voter || DEFAULT_MAX_POSITIVE_VOTES_PER_VOTER;
    const yesCount = await this.repository.countYesVotesByVoter(voter, voteSession.id, songId, tx);
    if (yesCount >= sessionLimit) {
      throw new BadRequestException(`Cada pessoa pode marcar no maximo ${sessionLimit} opcoes com voto Sim nesta votacao.`);
    }
  }

  private async registerOrValidateVoterIp(
    voter: string,
    ip: string | null,
    forceOverride: boolean,
    tx: Prisma.TransactionClient,
  ) {
    const normalizedIp = String(ip || '').trim();
    if (!normalizedIp) throw new BadRequestException('Nao foi possivel identificar o IP do votante.');

    const [existingByVoter, existingByIp] = await Promise.all([
      this.repository.findVoterIpLockByVoter(voter, tx),
      this.repository.findVoterIpLockByIp(normalizedIp, tx),
    ]);

    const voterConflict = existingByVoter && existingByVoter.ip !== normalizedIp;
    const ipConflict = existingByIp && existingByIp.voter !== voter;

    if ((voterConflict || ipConflict) && !forceOverride) {
      throw new BadRequestException(IP_MISMATCH_MESSAGE);
    }

    if (existingByIp && existingByIp.voter !== voter) {
      await this.repository.deleteVoterIpLock(existingByIp.id, tx);
    }

    if (existingByVoter) {
      await this.repository.updateVoterIpLock(existingByVoter.id, { ip: normalizedIp }, tx);
      return;
    }

    await this.repository.createVoterIpLock({ voter, ip: normalizedIp }, tx);
  }
}
