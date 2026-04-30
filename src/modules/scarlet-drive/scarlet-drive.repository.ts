import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

const guestSelect = {
  id: true,
  name: true,
  invited_by: true,
  is_paid: true,
  is_confirmed: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.scarlet_drive_guestsSelect;

const repertoireSongSelect = {
  id: true,
  name: true,
  suggested_by: true,
  sort_order: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.scarlet_drive_repertoire_songsSelect;

const voteSelect = {
  id: true,
  vote_song_id: true,
  voter: true,
  vote: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.scarlet_drive_votesSelect;

const voteSongSelect = {
  id: true,
  vote_session_id: true,
  name: true,
  suggested_by: true,
  sort_order: true,
  created_at: true,
  updated_at: true,
  votes: {
    select: voteSelect,
    orderBy: [{ voter: 'asc' }],
  },
} satisfies Prisma.scarlet_drive_vote_session_songsSelect;

const voteSessionSelect = {
  id: true,
  name: true,
  is_active: true,
  answer_mode: true,
  is_secret: true,
  max_yes_votes_per_voter: true,
  created_at: true,
  updated_at: true,
  songs: {
    select: voteSongSelect,
    orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
  },
} satisfies Prisma.scarlet_drive_vote_sessionsSelect;

const voterIpLockSelect = {
  id: true,
  voter: true,
  ip: true,
  created_at: true,
  updated_at: true,
} satisfies Prisma.scarlet_drive_voter_ip_locksSelect;

type ScarletTransactionClient = Prisma.TransactionClient;

export type ScarletDriveGuest = Prisma.scarlet_drive_guestsGetPayload<{ select: typeof guestSelect }>;
export type ScarletDriveRepertoireSong = Prisma.scarlet_drive_repertoire_songsGetPayload<{ select: typeof repertoireSongSelect }>;
export type ScarletDriveVote = Prisma.scarlet_drive_votesGetPayload<{ select: typeof voteSelect }>;
export type ScarletDriveVoteSong = Prisma.scarlet_drive_vote_session_songsGetPayload<{ select: typeof voteSongSelect }>;
export type ScarletDriveVoteSession = Prisma.scarlet_drive_vote_sessionsGetPayload<{ select: typeof voteSessionSelect }>;
export type ScarletDriveVoterIpLock = Prisma.scarlet_drive_voter_ip_locksGetPayload<{ select: typeof voterIpLockSelect }>;

@Injectable()
export class ScarletDriveRepository {
  constructor(private readonly prisma: PrismaService) {}

  async transaction<T>(fn: (tx: ScarletTransactionClient) => Promise<T>): Promise<T> {
    return this.prisma.transaction(fn as any);
  }

  private db(client?: ScarletTransactionClient) {
    return client ?? this.prisma;
  }

  async listGuests(client?: ScarletTransactionClient): Promise<ScarletDriveGuest[]> {
    return this.db(client).scarlet_drive_guests.findMany({
      orderBy: [{ name: 'asc' }],
      select: guestSelect,
    });
  }

  async findGuestById(id: string, client?: ScarletTransactionClient): Promise<ScarletDriveGuest | null> {
    return this.db(client).scarlet_drive_guests.findUnique({
      where: { id },
      select: guestSelect,
    });
  }

  async createGuest(data: Prisma.scarlet_drive_guestsCreateInput, client?: ScarletTransactionClient): Promise<ScarletDriveGuest> {
    return this.db(client).scarlet_drive_guests.create({
      data,
      select: guestSelect,
    });
  }

  async updateGuest(id: string, data: Prisma.scarlet_drive_guestsUpdateInput, client?: ScarletTransactionClient): Promise<ScarletDriveGuest | null> {
    const result = await this.db(client).scarlet_drive_guests.updateMany({
      where: { id },
      data: {
        ...(data as any),
        updated_at: new Date(),
      },
    });
    if (!result.count) return null;
    return this.findGuestById(id, client);
  }

  async deleteGuest(id: string, client?: ScarletTransactionClient): Promise<boolean> {
    const result = await this.db(client).scarlet_drive_guests.deleteMany({
      where: { id },
    });
    return result.count > 0;
  }

  async listRepertoireSongs(client?: ScarletTransactionClient): Promise<ScarletDriveRepertoireSong[]> {
    return this.db(client).scarlet_drive_repertoire_songs.findMany({
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      select: repertoireSongSelect,
    });
  }

  async findRepertoireSongById(id: string, client?: ScarletTransactionClient): Promise<ScarletDriveRepertoireSong | null> {
    return this.db(client).scarlet_drive_repertoire_songs.findUnique({
      where: { id },
      select: repertoireSongSelect,
    });
  }

  async createRepertoireSong(
    data: Prisma.scarlet_drive_repertoire_songsCreateInput,
    client?: ScarletTransactionClient,
  ): Promise<ScarletDriveRepertoireSong> {
    return this.db(client).scarlet_drive_repertoire_songs.create({
      data,
      select: repertoireSongSelect,
    });
  }

  async updateRepertoireSong(
    id: string,
    data: Prisma.scarlet_drive_repertoire_songsUpdateInput,
    client?: ScarletTransactionClient,
  ): Promise<ScarletDriveRepertoireSong | null> {
    const result = await this.db(client).scarlet_drive_repertoire_songs.updateMany({
      where: { id },
      data: {
        ...(data as any),
        updated_at: new Date(),
      },
    });
    if (!result.count) return null;
    return this.findRepertoireSongById(id, client);
  }

  async deleteRepertoireSong(id: string, client?: ScarletTransactionClient): Promise<boolean> {
    const result = await this.db(client).scarlet_drive_repertoire_songs.deleteMany({
      where: { id },
    });
    return result.count > 0;
  }

  async reorderRepertoireSongs(orderedIds: string[], client: ScarletTransactionClient): Promise<void> {
    await Promise.all(
      orderedIds.map((id, index) =>
        this.db(client).scarlet_drive_repertoire_songs.update({
          where: { id },
          data: {
            sort_order: index + 1,
            updated_at: new Date(),
          },
        }),
      ),
    );
  }

  async listVoteSessions(client?: ScarletTransactionClient): Promise<ScarletDriveVoteSession[]> {
    return this.db(client).scarlet_drive_vote_sessions.findMany({
      orderBy: [{ is_active: 'desc' }, { updated_at: 'desc' }],
      select: voteSessionSelect,
    });
  }

  async findVoteSessionById(id: string, client?: ScarletTransactionClient): Promise<ScarletDriveVoteSession | null> {
    return this.db(client).scarlet_drive_vote_sessions.findUnique({
      where: { id },
      select: voteSessionSelect,
    });
  }

  async createVoteSession(
    input: {
      name: string;
      isActive: boolean;
      answerMode: string;
      isSecret: boolean;
      maxYesVotesPerVoter: number;
      songs: Array<{ name: string; suggestedBy: string; sortOrder: number }>;
    },
    client: ScarletTransactionClient,
  ): Promise<ScarletDriveVoteSession> {
    const session = await this.db(client).scarlet_drive_vote_sessions.create({
      data: {
        name: input.name,
        is_active: input.isActive,
        answer_mode: input.answerMode,
        is_secret: input.isSecret,
        max_yes_votes_per_voter: input.maxYesVotesPerVoter,
      },
      select: { id: true },
    });

    if (input.songs.length) {
      await this.db(client).scarlet_drive_vote_session_songs.createMany({
        data: input.songs.map((song) => ({
          vote_session_id: session.id,
          name: song.name,
          suggested_by: song.suggestedBy,
          sort_order: song.sortOrder,
        })),
      });
    }

    return (await this.findVoteSessionById(session.id, client)) as ScarletDriveVoteSession;
  }

  async deleteVoteSession(id: string, client?: ScarletTransactionClient): Promise<boolean> {
    const result = await this.db(client).scarlet_drive_vote_sessions.deleteMany({
      where: { id },
    });
    return result.count > 0;
  }

  async updateVoteSession(
    id: string,
    data: Prisma.scarlet_drive_vote_sessionsUpdateInput,
    client?: ScarletTransactionClient,
  ): Promise<ScarletDriveVoteSession | null> {
    const result = await this.db(client).scarlet_drive_vote_sessions.updateMany({
      where: { id },
      data: {
        ...(data as any),
        updated_at: new Date(),
      },
    });
    if (!result.count) return null;
    return this.findVoteSessionById(id, client);
  }

  async createVoteSessionSong(
    input: { voteSessionId: string; name: string; suggestedBy: string; sortOrder: number },
    client?: ScarletTransactionClient,
  ): Promise<ScarletDriveVoteSong> {
    return this.db(client).scarlet_drive_vote_session_songs.create({
      data: {
        vote_session: { connect: { id: input.voteSessionId } },
        name: input.name,
        suggested_by: input.suggestedBy,
        sort_order: input.sortOrder,
      },
      select: voteSongSelect,
    });
  }

  async findVoteSongById(id: string, client?: ScarletTransactionClient): Promise<ScarletDriveVoteSong | null> {
    return this.db(client).scarlet_drive_vote_session_songs.findUnique({
      where: { id },
      select: voteSongSelect,
    });
  }

  async deleteVoteSong(id: string, client?: ScarletTransactionClient): Promise<boolean> {
    const result = await this.db(client).scarlet_drive_vote_session_songs.deleteMany({
      where: { id },
    });
    return result.count > 0;
  }

  async listVoteSessionSongsBySession(voteSessionId: string, client?: ScarletTransactionClient): Promise<ScarletDriveVoteSong[]> {
    return this.db(client).scarlet_drive_vote_session_songs.findMany({
      where: { vote_session_id: voteSessionId },
      orderBy: [{ sort_order: 'asc' }, { name: 'asc' }],
      select: voteSongSelect,
    });
  }

  async reorderVoteSessionSongs(voteSessionId: string, client: ScarletTransactionClient): Promise<void> {
    const songs = await this.listVoteSessionSongsBySession(voteSessionId, client);
    await Promise.all(
      songs.map((song, index) =>
        this.db(client).scarlet_drive_vote_session_songs.update({
          where: { id: song.id },
          data: {
            sort_order: index + 1,
            updated_at: new Date(),
          },
        }),
      ),
    );
  }

  async upsertVote(
    input: { voteSongId: string; voter: string; vote: string },
    client: ScarletTransactionClient,
  ): Promise<ScarletDriveVote> {
    const existing = await this.db(client).scarlet_drive_votes.findFirst({
      where: {
        vote_song_id: input.voteSongId,
        voter: input.voter,
      },
      select: voteSelect,
    });

    if (existing) {
      return this.db(client).scarlet_drive_votes.update({
        where: { id: existing.id },
        data: {
          vote: input.vote,
          updated_at: new Date(),
        },
        select: voteSelect,
      });
    }

    return this.db(client).scarlet_drive_votes.create({
      data: {
        vote_song: { connect: { id: input.voteSongId } },
        voter: input.voter,
        vote: input.vote,
      },
      select: voteSelect,
    });
  }

  async updateVote(id: string, data: Prisma.scarlet_drive_votesUpdateInput, client?: ScarletTransactionClient): Promise<ScarletDriveVote> {
    return this.db(client).scarlet_drive_votes.update({
      where: { id },
      data: {
        ...(data as any),
        updated_at: new Date(),
      },
      select: voteSelect,
    });
  }

  async countYesVotesByVoter(voter: string, voteSessionId: string, ignoreVoteSongId?: string, client?: ScarletTransactionClient): Promise<number> {
    return this.db(client).scarlet_drive_votes.count({
      where: {
        voter,
        vote: 'yes',
        vote_song: {
          vote_session_id: voteSessionId,
        },
        ...(ignoreVoteSongId ? { vote_song_id: { not: ignoreVoteSongId } } : {}),
      },
    });
  }

  async findVoterIpLockByVoter(voter: string, client?: ScarletTransactionClient): Promise<ScarletDriveVoterIpLock | null> {
    return this.db(client).scarlet_drive_voter_ip_locks.findUnique({
      where: { voter },
      select: voterIpLockSelect,
    });
  }

  async findVoterIpLockByIp(ip: string, client?: ScarletTransactionClient): Promise<ScarletDriveVoterIpLock | null> {
    return this.db(client).scarlet_drive_voter_ip_locks.findUnique({
      where: { ip },
      select: voterIpLockSelect,
    });
  }

  async createVoterIpLock(input: { voter: string; ip: string }, client?: ScarletTransactionClient): Promise<ScarletDriveVoterIpLock> {
    return this.db(client).scarlet_drive_voter_ip_locks.create({
      data: input,
      select: voterIpLockSelect,
    });
  }

  async updateVoterIpLock(id: string, data: Prisma.scarlet_drive_voter_ip_locksUpdateInput, client?: ScarletTransactionClient): Promise<ScarletDriveVoterIpLock> {
    return this.db(client).scarlet_drive_voter_ip_locks.update({
      where: { id },
      data: {
        ...(data as any),
        updated_at: new Date(),
      },
      select: voterIpLockSelect,
    });
  }

  async deleteVoterIpLock(id: string, client?: ScarletTransactionClient): Promise<void> {
    await this.db(client).scarlet_drive_voter_ip_locks.delete({
      where: { id },
    });
  }
}
