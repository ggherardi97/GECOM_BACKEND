import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes } from 'crypto';
import { PrismaService } from '../../prisma/prisma.service';

type AuthUser = {
  id: string;
  tenant_id: string;
  role?: string;
};

type GoogleCalendarConnectionRow = {
  id: string;
  tenant_id: string;
  user_id: string;
  google_email: string | null;
  google_account_sub: string | null;
  access_token_encrypted: string | null;
  refresh_token_encrypted: string | null;
  token_expires_at: Date | string | null;
  scope: string | null;
  google_calendar_id: string | null;
  google_calendar_name: string | null;
  sync_direction: string | null;
  lookback_days: number | null;
  auto_sync_enabled: boolean | null;
  auto_sync_interval_minutes: number | null;
  create_meet_link: boolean | null;
  import_guests: boolean | null;
  import_description: boolean | null;
  import_private_events: boolean | null;
  last_sync_at: Date | string | null;
  last_sync_token: string | null;
  is_active: boolean | null;
  created_at: Date | string | null;
  updated_at: Date | string | null;
};

type GoogleOAuthTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
};

type GoogleUserInfo = {
  sub?: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
};

type GoogleCalendarListItem = {
  id: string;
  summary?: string;
  primary?: boolean;
  accessRole?: string;
  backgroundColor?: string;
  foregroundColor?: string;
  colorId?: string;
};

type GoogleCalendarEvent = {
  id?: string;
  status?: string;
  summary?: string;
  description?: string;
  location?: string;
  htmlLink?: string;
  etag?: string;
  visibility?: string;
  organizer?: {
    email?: string;
    displayName?: string;
  };
  start?: {
    date?: string;
    dateTime?: string;
  };
  end?: {
    date?: string;
    dateTime?: string;
  };
  colorId?: string;
};

type GoogleColorsResponse = {
  calendar?: Record<string, { background?: string; foreground?: string }>;
  event?: Record<string, { background?: string; foreground?: string }>;
};

type GoogleCallbackResult = {
  ok: boolean;
  message: string;
  returnTo: string;
  targetOrigin: string;
};

type SyncSummary = {
  imported: number;
  removed: number;
  window_start: string;
  window_end: string;
};

const GOOGLE_SCOPES = [
  'openid',
  'email',
  'profile',
  'https://www.googleapis.com/auth/calendar.readonly',
  'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
];

@Injectable()
export class GoogleCalendarService {
  constructor(private readonly prisma: PrismaService) {}

  private get db(): any {
    return this.prisma.raw;
  }

  async getStatus(user: AuthUser) {
    const connection = await this.findConnection(user);
    if (!connection) {
      return {
        connected: false,
        provider: 'google_calendar',
      };
    }

    return {
      connected: true,
      provider: 'google_calendar',
      connection: this.mapConnectionForResponse(connection),
    };
  }

  async buildConnectUrl(user: AuthUser, req: Request, returnToRaw?: string) {
    const clientId = this.getRequiredEnv('GOOGLE_OAUTH_CLIENT_ID');
    const redirectUri = this.getRedirectUri(req);
    const state = this.buildSignedState(user, this.normalizeReturnTo(returnToRaw, req));

    const params = new URLSearchParams({
      client_id: clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      access_type: 'offline',
      include_granted_scopes: 'true',
      prompt: 'consent',
      scope: GOOGLE_SCOPES.join(' '),
      state,
    });

    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  async finalizeOAuthCallback(user: AuthUser, req: Request, query: Record<string, any>): Promise<GoogleCallbackResult> {
    const parsedState = this.parseSignedState(String(query?.state || ''), user, req);
    const returnTo = parsedState.returnTo;
    const targetOrigin = this.getOriginFromUrl(returnTo) || this.getRequestOrigin(req);

    if (query?.error) {
      throw new BadRequestException(String(query?.error_description || query?.error || 'Autorizacao recusada.'));
    }

    const code = String(query?.code || '').trim();
    if (!code) {
      throw new BadRequestException('Codigo OAuth nao retornado pelo Google.');
    }

    const existing = await this.findConnection(user);
    const tokens = await this.exchangeCodeForTokens(code, this.getRedirectUri(req));
    const accessToken = String(tokens.access_token || '').trim();
    if (!accessToken) {
      throw new BadRequestException('Google nao retornou access token.');
    }

    const profile = await this.fetchGoogleUserInfo(accessToken);
    const calendars = await this.fetchCalendars(accessToken);
    const currentCalendarId = String(existing?.google_calendar_id || '').trim();
    const selectedCalendar =
      calendars.find((item) => String(item?.id || '') === currentCalendarId) ||
      calendars.find((item) => item?.primary) ||
      calendars[0] ||
      null;

    const connection = await this.upsertConnection(user, {
      existing,
      google_email: String(profile?.email || '').trim() || existing?.google_email || null,
      google_account_sub: String(profile?.sub || '').trim() || existing?.google_account_sub || null,
      access_token_encrypted: this.encryptToken(accessToken),
      refresh_token_encrypted: tokens.refresh_token
        ? this.encryptToken(String(tokens.refresh_token))
        : existing?.refresh_token_encrypted || null,
      token_expires_at: this.computeTokenExpiry(tokens.expires_in),
      scope: String(tokens.scope || '').trim() || existing?.scope || GOOGLE_SCOPES.join(' '),
      google_calendar_id: String(selectedCalendar?.id || '').trim() || existing?.google_calendar_id || 'primary',
      google_calendar_name:
        String(selectedCalendar?.summary || '').trim() || existing?.google_calendar_name || 'Primario',
    });

    let syncMessage = 'Conexao concluida com sucesso.';
    try {
      await this.syncConnection(user, connection);
      syncMessage = 'Conexao concluida e agenda importada.';
    } catch (error: any) {
      syncMessage = `Conexao concluida, mas a primeira sincronizacao falhou: ${String(error?.message || 'erro interno')}`;
    }

    return {
      ok: true,
      message: syncMessage,
      returnTo,
      targetOrigin,
    };
  }

  async listCalendars(user: AuthUser) {
    const connection = await this.getActiveConnectionOrFail(user);
    const accessToken = await this.ensureValidAccessToken(connection);
    const items = await this.fetchCalendars(accessToken);

    return {
      items: items.map((item) => ({
        id: String(item?.id || ''),
        label: String(item?.summary || item?.id || ''),
        primary: Boolean(item?.primary),
        access_role: String(item?.accessRole || ''),
      })),
    };
  }

  async saveSettings(user: AuthUser, payload: any) {
    const connection = await this.getActiveConnectionOrFail(user);
    const accessToken = await this.ensureValidAccessToken(connection);
    const calendars = await this.fetchCalendars(accessToken);

    const googleCalendarId = this.normalizeOptionalText(payload?.google_calendar_id) || connection.google_calendar_id || 'primary';
    const selectedCalendar = calendars.find((item) => String(item?.id || '') === googleCalendarId);
    if (!selectedCalendar) {
      throw new BadRequestException('Calendario do Google nao encontrado.');
    }

    const lookbackDays = this.parseBoundedInteger(payload?.lookback_days, 30, 1, 180);
    const importDescription = this.parseBoolean(payload?.import_description, true);
    const importPrivateEvents = this.parseBoolean(payload?.import_private_events, false);

    const rows = (await this.db.$queryRawUnsafe(
      `
        UPDATE google_calendar_connections
           SET google_calendar_id = $3,
               google_calendar_name = $4,
               lookback_days = $5,
               import_description = $6,
               import_private_events = $7,
               sync_direction = 'IMPORT_ONLY',
               updated_at = now()
         WHERE tenant_id = CAST($1 AS uuid)
           AND user_id = CAST($2 AS uuid)
           AND is_active = true
        RETURNING *
      `,
      user.tenant_id,
      user.id,
      googleCalendarId,
      String(selectedCalendar?.summary || selectedCalendar?.id || ''),
      lookbackDays,
      importDescription,
      importPrivateEvents,
    )) as GoogleCalendarConnectionRow[];

    const updated = rows?.[0];
    if (!updated) throw new BadRequestException('Conexao Google Agenda nao encontrada.');

    return {
      ok: true,
      connection: this.mapConnectionForResponse(updated),
    };
  }

  async syncNow(user: AuthUser) {
    const connection = await this.getActiveConnectionOrFail(user);
    const summary = await this.syncConnection(user, connection);
    return {
      ok: true,
      ...summary,
      last_sync_at: new Date().toISOString(),
    };
  }

  async disconnect(user: AuthUser) {
    const connection = await this.findConnection(user);
    if (!connection) return { ok: true };

    await this.db.$executeRawUnsafe(
      `DELETE FROM google_calendar_cached_events WHERE tenant_id = CAST($1 AS uuid) AND connection_id = CAST($2 AS uuid)`,
      user.tenant_id,
      connection.id,
    );
    await this.db.$executeRawUnsafe(
      `DELETE FROM google_calendar_connections WHERE tenant_id = CAST($1 AS uuid) AND user_id = CAST($2 AS uuid)`,
      user.tenant_id,
      user.id,
    );

    return { ok: true };
  }

  async listCachedEventsForAgenda(user: AuthUser, start: Date, end: Date) {
    const rows = (await this.db.$queryRawUnsafe(
      `
        SELECT
          e.id,
          e.external_event_id,
          e.title,
          e.description,
          e.location,
          e.start_at,
          e.end_at,
          e.is_all_day,
          e.html_link,
          e.organizer_email,
          e.status,
          e.raw_json,
          c.google_calendar_name,
          c.google_email
        FROM google_calendar_cached_events e
        INNER JOIN google_calendar_connections c
          ON c.id = e.connection_id
         AND c.tenant_id = e.tenant_id
        WHERE e.tenant_id = CAST($1 AS uuid)
          AND e.user_id = CAST($2 AS uuid)
          AND e.deleted_at IS NULL
          AND c.is_active = true
          AND e.start_at < $4::timestamptz
          AND COALESCE(e.end_at, e.start_at) >= $3::timestamptz
        ORDER BY e.start_at ASC
      `,
      user.tenant_id,
      user.id,
      start.toISOString(),
      end.toISOString(),
    )) as any[];

    const items = (rows || []).reduce<any[]>((acc, row) => {
        const startAt = this.toDate(row?.start_at);
        if (!startAt) return acc;

        acc.push({
          id: `google_calendar_events:${row.id}`,
          title: String(row?.title || 'Evento Google'),
          start: startAt.toISOString(),
          end: this.toDate(row?.end_at)?.toISOString() || null,
          allDay: Boolean(row?.is_all_day),
          color: row?.raw_json?.gecom_color_background || '#4285f4',
          textColor: row?.raw_json?.gecom_color_foreground || '#ffffff',
          activity_type: 'google_calendar_events',
          activity_label: 'Google Agenda',
          source_id: String(row?.external_event_id || row?.id || ''),
          source_data: {
            provider: 'google_calendar',
            status: row?.status || null,
            description: row?.description || null,
            location: row?.location || null,
            html_link: row?.html_link || null,
            organizer_email: row?.organizer_email || null,
            calendar_name: row?.google_calendar_name || null,
            google_email: row?.google_email || null,
            raw_json: row?.raw_json || null,
          },
        });
        return acc;
      }, []);

    return items;
  }

  private async syncConnection(user: AuthUser, connection: GoogleCalendarConnectionRow): Promise<SyncSummary> {
    const accessToken = await this.ensureValidAccessToken(connection);
    const calendarId = String(connection.google_calendar_id || 'primary').trim() || 'primary';
    const calendars = await this.fetchCalendars(accessToken);
    const calendarMeta = calendars.find((item) => String(item?.id || '').trim() === calendarId) || null;
    const colors = await this.fetchColors(accessToken);
    const lookbackDays = this.parseBoundedInteger(connection.lookback_days, 30, 1, 180);
    const start = new Date();
    start.setDate(start.getDate() - lookbackDays);
    start.setHours(0, 0, 0, 0);
    const end = new Date();
    end.setDate(end.getDate() + 365);
    end.setHours(23, 59, 59, 999);

    const items = await this.fetchCalendarEvents(accessToken, calendarId, start, end);
    const syncStamp = new Date();
    const touchedIds: string[] = [];
    let imported = 0;

    for (const item of items) {
      const normalized = this.normalizeGoogleEvent(item, connection, calendarMeta, colors);
      if (!normalized) continue;
      touchedIds.push(normalized.externalEventId);

      if (normalized.deleted) {
        await this.db.$executeRawUnsafe(
          `
            UPDATE google_calendar_cached_events
               SET status = $5,
                   deleted_at = now(),
                   synced_at = $6::timestamptz,
                   updated_at = now()
             WHERE tenant_id = CAST($1 AS uuid)
               AND connection_id = CAST($2 AS uuid)
               AND google_calendar_id = $3
               AND external_event_id = $4
          `,
          user.tenant_id,
          connection.id,
          calendarId,
          normalized.externalEventId,
          normalized.status,
          syncStamp.toISOString(),
        );
        continue;
      }

      imported += 1;
      await this.db.$queryRawUnsafe(
        `
          INSERT INTO google_calendar_cached_events (
            tenant_id,
            user_id,
            connection_id,
            google_calendar_id,
            external_event_id,
            status,
            title,
            description,
            location,
            start_at,
            end_at,
            is_all_day,
            html_link,
            organizer_email,
            etag,
            raw_json,
            synced_at,
            deleted_at,
            updated_at
          )
          VALUES (
            CAST($1 AS uuid),
            CAST($2 AS uuid),
            CAST($3 AS uuid),
            $4,
            $5,
            $6,
            $7,
            $8,
            $9,
            $10::timestamptz,
            $11::timestamptz,
            $12,
            $13,
            $14,
            $15,
            $16::jsonb,
            $17::timestamptz,
            NULL,
            now()
          )
          ON CONFLICT (tenant_id, connection_id, external_event_id)
          DO UPDATE SET
            status = EXCLUDED.status,
            title = EXCLUDED.title,
            description = EXCLUDED.description,
            location = EXCLUDED.location,
            start_at = EXCLUDED.start_at,
            end_at = EXCLUDED.end_at,
            is_all_day = EXCLUDED.is_all_day,
            html_link = EXCLUDED.html_link,
            organizer_email = EXCLUDED.organizer_email,
            etag = EXCLUDED.etag,
            raw_json = EXCLUDED.raw_json,
            synced_at = EXCLUDED.synced_at,
            deleted_at = NULL,
            updated_at = now()
        `,
        user.tenant_id,
        user.id,
        connection.id,
        calendarId,
        normalized.externalEventId,
        normalized.status,
        normalized.title,
        normalized.description,
        normalized.location,
        normalized.startAt.toISOString(),
        normalized.endAt.toISOString(),
        normalized.isAllDay,
        normalized.htmlLink,
        normalized.organizerEmail,
        normalized.etag,
        JSON.stringify(normalized.raw),
        syncStamp.toISOString(),
      );
    }

    let removed = 0;
    const deleteRows = (await this.db.$queryRawUnsafe(
      `
        SELECT external_event_id
          FROM google_calendar_cached_events
         WHERE tenant_id = CAST($1 AS uuid)
           AND connection_id = CAST($2 AS uuid)
           AND google_calendar_id = $3
           AND deleted_at IS NULL
      `,
      user.tenant_id,
      connection.id,
      calendarId,
    )) as Array<{ external_event_id: string }>;

    const staleIds = (deleteRows || [])
      .map((row) => String(row?.external_event_id || '').trim())
      .filter((id) => id && !touchedIds.includes(id));

    if (staleIds.length) {
      removed = staleIds.length;
      await this.db.$executeRawUnsafe(
        `
          UPDATE google_calendar_cached_events
             SET deleted_at = now(),
                 synced_at = $4::timestamptz,
                 updated_at = now()
           WHERE tenant_id = CAST($1 AS uuid)
             AND connection_id = CAST($2 AS uuid)
             AND google_calendar_id = $3
             AND external_event_id = ANY($5::text[])
        `,
        user.tenant_id,
        connection.id,
        calendarId,
        syncStamp.toISOString(),
        staleIds,
      );
    }

    await this.db.$executeRawUnsafe(
      `
        UPDATE google_calendar_connections
           SET last_sync_at = $3::timestamptz,
               updated_at = now()
         WHERE tenant_id = CAST($1 AS uuid)
           AND user_id = CAST($2 AS uuid)
      `,
      user.tenant_id,
      user.id,
      syncStamp.toISOString(),
    );

    return {
      imported,
      removed,
      window_start: start.toISOString(),
      window_end: end.toISOString(),
    };
  }

  private normalizeGoogleEvent(
    item: GoogleCalendarEvent,
    connection: GoogleCalendarConnectionRow,
    calendarMeta: GoogleCalendarListItem | null,
    colors: GoogleColorsResponse | null,
  ) {
    const externalEventId = String(item?.id || '').trim();
    if (!externalEventId) return null;

    const visibility = String(item?.visibility || '').trim().toLowerCase();
    const includePrivate = this.parseBoolean(connection.import_private_events, false);
    if (visibility === 'private' && !includePrivate) return null;

    const startMeta = this.parseGoogleEventDate(item?.start);
    if (!startMeta) return null;
    const endMeta = this.parseGoogleEventDate(item?.end);
    const isAllDay = startMeta.isAllDay;
    const fallbackEnd = new Date(startMeta.date.getTime() + (isAllDay ? 24 * 60 * 60 * 1000 : 60 * 60 * 1000));

    const resolvedColors = this.resolveEventColors(item, calendarMeta, colors);

    return {
      externalEventId,
      status: String(item?.status || 'confirmed').trim(),
      deleted: String(item?.status || '').trim().toLowerCase() === 'cancelled',
      title: String(item?.summary || 'Evento sem titulo').trim() || 'Evento sem titulo',
      description: this.parseBoolean(connection.import_description, true)
        ? this.normalizeOptionalText(item?.description)
        : null,
      location: this.normalizeOptionalText(item?.location),
      startAt: startMeta.date,
      endAt: endMeta?.date || fallbackEnd,
      isAllDay,
      htmlLink: this.normalizeOptionalText(item?.htmlLink),
      organizerEmail: this.normalizeOptionalText(item?.organizer?.email),
      etag: this.normalizeOptionalText(item?.etag),
      raw: {
        ...(item || {}),
        gecom_color_background: resolvedColors.background,
        gecom_color_foreground: resolvedColors.foreground,
      },
    };
  }

  private parseGoogleEventDate(value: GoogleCalendarEvent['start'] | GoogleCalendarEvent['end']) {
    const dateTime = String(value?.dateTime || '').trim();
    if (dateTime) {
      const parsed = new Date(dateTime);
      if (!Number.isNaN(parsed.getTime())) {
        return { date: parsed, isAllDay: false };
      }
    }

    const dateOnly = String(value?.date || '').trim();
    if (dateOnly) {
      const parsed = new Date(`${dateOnly}T00:00:00`);
      if (!Number.isNaN(parsed.getTime())) {
        return { date: parsed, isAllDay: true };
      }
    }

    return null;
  }

  private async findConnection(user: AuthUser) {
    const rows = (await this.db.$queryRawUnsafe(
      `
        SELECT *
          FROM google_calendar_connections
         WHERE tenant_id = CAST($1 AS uuid)
           AND user_id = CAST($2 AS uuid)
         ORDER BY created_at DESC
         LIMIT 1
      `,
      user.tenant_id,
      user.id,
    )) as GoogleCalendarConnectionRow[];

    return rows?.[0] || null;
  }

  private async getActiveConnectionOrFail(user: AuthUser) {
    const connection = await this.findConnection(user);
    if (!connection || connection.is_active === false) {
      throw new BadRequestException('Google Agenda ainda nao esta conectada para este usuario.');
    }
    return connection;
  }

  private async upsertConnection(
    user: AuthUser,
    input: {
      existing: GoogleCalendarConnectionRow | null;
      google_email: string | null;
      google_account_sub: string | null;
      access_token_encrypted: string | null;
      refresh_token_encrypted: string | null;
      token_expires_at: Date | null;
      scope: string | null;
      google_calendar_id: string | null;
      google_calendar_name: string | null;
    },
  ) {
    const rows = (await this.db.$queryRawUnsafe(
      `
        INSERT INTO google_calendar_connections (
          tenant_id,
          user_id,
          google_email,
          google_account_sub,
          access_token_encrypted,
          refresh_token_encrypted,
          token_expires_at,
          scope,
          google_calendar_id,
          google_calendar_name,
          sync_direction,
          lookback_days,
          auto_sync_enabled,
          import_guests,
          import_description,
          import_private_events,
          is_active
        )
        VALUES (
          CAST($1 AS uuid),
          CAST($2 AS uuid),
          $3,
          $4,
          $5,
          $6,
          $7::timestamptz,
          $8,
          $9,
          $10,
          'IMPORT_ONLY',
          $11,
          false,
          false,
          $12,
          $13,
          true
        )
        ON CONFLICT (tenant_id, user_id)
        DO UPDATE SET
          google_email = EXCLUDED.google_email,
          google_account_sub = EXCLUDED.google_account_sub,
          access_token_encrypted = EXCLUDED.access_token_encrypted,
          refresh_token_encrypted = COALESCE(EXCLUDED.refresh_token_encrypted, google_calendar_connections.refresh_token_encrypted),
          token_expires_at = EXCLUDED.token_expires_at,
          scope = EXCLUDED.scope,
          google_calendar_id = COALESCE(EXCLUDED.google_calendar_id, google_calendar_connections.google_calendar_id),
          google_calendar_name = COALESCE(EXCLUDED.google_calendar_name, google_calendar_connections.google_calendar_name),
          is_active = true,
          updated_at = now()
        RETURNING *
      `,
      user.tenant_id,
      user.id,
      input.google_email,
      input.google_account_sub,
      input.access_token_encrypted,
      input.refresh_token_encrypted,
      input.token_expires_at?.toISOString() || null,
      input.scope,
      input.google_calendar_id,
      input.google_calendar_name,
      this.parseBoundedInteger(input.existing?.lookback_days, 30, 1, 180),
      this.parseBoolean(input.existing?.import_description, true),
      this.parseBoolean(input.existing?.import_private_events, false),
    )) as GoogleCalendarConnectionRow[];

    const connection = rows?.[0];
    if (!connection) {
      throw new BadRequestException('Nao foi possivel persistir a conexao do Google Agenda.');
    }
    return connection;
  }

  private async ensureValidAccessToken(connection: GoogleCalendarConnectionRow) {
    const accessToken = this.normalizeOptionalText(connection.access_token_encrypted)
      ? this.decryptToken(String(connection.access_token_encrypted))
      : null;
    const expiry = this.toDate(connection.token_expires_at);
    const stillValid = accessToken && expiry && expiry.getTime() > Date.now() + 60_000;
    if (stillValid) return accessToken;

    const refreshTokenEncrypted = this.normalizeOptionalText(connection.refresh_token_encrypted);
    if (!refreshTokenEncrypted) {
      throw new UnauthorizedException('A sessao do Google expirou. Reconecte a conta.');
    }

    const refreshed = await this.refreshAccessToken(this.decryptToken(refreshTokenEncrypted));
    const nextAccessToken = String(refreshed.access_token || '').trim();
    if (!nextAccessToken) {
      throw new UnauthorizedException('Google nao retornou um novo access token.');
    }

    await this.db.$executeRawUnsafe(
      `
        UPDATE google_calendar_connections
           SET access_token_encrypted = $3,
               token_expires_at = $4::timestamptz,
               scope = COALESCE($5, scope),
               updated_at = now()
         WHERE id = CAST($1 AS uuid)
           AND tenant_id = CAST($2 AS uuid)
      `,
      connection.id,
      connection.tenant_id,
      this.encryptToken(nextAccessToken),
      this.computeTokenExpiry(refreshed.expires_in)?.toISOString() || null,
      this.normalizeOptionalText(refreshed.scope),
    );

    return nextAccessToken;
  }

  private async exchangeCodeForTokens(code: string, redirectUri: string) {
    return this.requestGoogleToken({
      code,
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    });
  }

  private async refreshAccessToken(refreshToken: string) {
    return this.requestGoogleToken({
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    });
  }

  private async requestGoogleToken(extraParams: Record<string, string>) {
    const params = new URLSearchParams({
      client_id: this.getRequiredEnv('GOOGLE_OAUTH_CLIENT_ID'),
      client_secret: this.getRequiredEnv('GOOGLE_OAUTH_CLIENT_SECRET'),
      ...extraParams,
    });

    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const data = await this.readJsonSafe(response);
    if (!response.ok) {
      throw new BadRequestException(String(data?.error_description || data?.error || 'Falha ao autenticar no Google.'));
    }

    return (data || {}) as GoogleOAuthTokenResponse;
  }

  private async fetchGoogleUserInfo(accessToken: string) {
    const response = await fetch('https://openidconnect.googleapis.com/v1/userinfo', {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
    const data = await this.readJsonSafe(response);
    if (!response.ok) {
      throw new BadRequestException(String(data?.error_description || data?.message || 'Falha ao consultar perfil Google.'));
    }
    return (data || {}) as GoogleUserInfo;
  }

  private async fetchCalendars(accessToken: string) {
    const items: GoogleCalendarListItem[] = [];
    let pageToken = '';

    do {
      const params = new URLSearchParams();
      params.set('minAccessRole', 'reader');
      params.set('showDeleted', 'false');
      if (pageToken) params.set('pageToken', pageToken);

      const response = await fetch(`https://www.googleapis.com/calendar/v3/users/me/calendarList?${params.toString()}`, {
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = await this.readJsonSafe(response);
      if (!response.ok) {
        throw new BadRequestException(String(data?.error?.message || data?.message || 'Falha ao listar calendarios Google.'));
      }

      items.push(...((Array.isArray(data?.items) ? data.items : []) as GoogleCalendarListItem[]));
      pageToken = String(data?.nextPageToken || '').trim();
    } while (pageToken);

    return items;
  }

  private async fetchColors(accessToken: string) {
    const response = await fetch('https://www.googleapis.com/calendar/v3/colors', {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const data = await this.readJsonSafe(response);
    if (!response.ok) {
      throw new BadRequestException(String(data?.error?.message || data?.message || 'Falha ao listar paleta de cores do Google Calendar.'));
    }

    return (data || {}) as GoogleColorsResponse;
  }

  private async fetchCalendarEvents(accessToken: string, calendarId: string, start: Date, end: Date) {
    const items: GoogleCalendarEvent[] = [];
    let pageToken = '';

    do {
      const params = new URLSearchParams({
        timeMin: start.toISOString(),
        timeMax: end.toISOString(),
        singleEvents: 'true',
        orderBy: 'startTime',
        showDeleted: 'true',
        maxResults: '2500',
      });
      if (pageToken) params.set('pageToken', pageToken);

      const response = await fetch(
        `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events?${params.toString()}`,
        {
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${accessToken}`,
          },
        },
      );

      const data = await this.readJsonSafe(response);
      if (!response.ok) {
        throw new BadRequestException(String(data?.error?.message || data?.message || 'Falha ao listar eventos Google.'));
      }

      items.push(...((Array.isArray(data?.items) ? data.items : []) as GoogleCalendarEvent[]));
      pageToken = String(data?.nextPageToken || '').trim();
    } while (pageToken);

    return items;
  }

  private resolveEventColors(
    item: GoogleCalendarEvent,
    calendarMeta: GoogleCalendarListItem | null,
    colors: GoogleColorsResponse | null,
  ) {
    const eventColorId = String(item?.colorId || '').trim();
    if (eventColorId && colors?.event?.[eventColorId]) {
      return {
        background: String(colors.event[eventColorId]?.background || '#4285f4'),
        foreground: String(colors.event[eventColorId]?.foreground || '#ffffff'),
      };
    }

    const calendarColorId = String(calendarMeta?.colorId || '').trim();
    if (calendarColorId && colors?.calendar?.[calendarColorId]) {
      return {
        background: String(colors.calendar[calendarColorId]?.background || '#4285f4'),
        foreground: String(colors.calendar[calendarColorId]?.foreground || '#ffffff'),
      };
    }

    const calendarBackground = this.normalizeOptionalText(calendarMeta?.backgroundColor);
    const calendarForeground = this.normalizeOptionalText(calendarMeta?.foregroundColor);
    return {
      background: calendarBackground || '#4285f4',
      foreground: calendarForeground || '#ffffff',
    };
  }

  private mapConnectionForResponse(connection: GoogleCalendarConnectionRow) {
    return {
      id: connection.id,
      google_email: connection.google_email,
      google_calendar_id: connection.google_calendar_id,
      google_calendar_name: connection.google_calendar_name,
      sync_direction: connection.sync_direction || 'IMPORT_ONLY',
      lookback_days: this.parseBoundedInteger(connection.lookback_days, 30, 1, 180),
      import_description: this.parseBoolean(connection.import_description, true),
      import_private_events: this.parseBoolean(connection.import_private_events, false),
      last_sync_at: this.toDate(connection.last_sync_at)?.toISOString() || null,
      token_expires_at: this.toDate(connection.token_expires_at)?.toISOString() || null,
      is_active: connection.is_active !== false,
    };
  }

  private buildSignedState(user: AuthUser, returnTo: string) {
    const payload = JSON.stringify({
      uid: user.id,
      tid: user.tenant_id,
      return_to: returnTo,
      ts: Date.now(),
    });
    const encoded = Buffer.from(payload, 'utf8').toString('base64url');
    const signature = createHmac('sha256', this.getStateSecret()).update(payload).digest('base64url');
    return `${encoded}.${signature}`;
  }

  private parseSignedState(stateRaw: string, user: AuthUser, req: Request) {
    const [payloadEncoded, signature] = String(stateRaw || '').split('.');
    if (!payloadEncoded || !signature) {
      throw new BadRequestException('State OAuth ausente ou invalido.');
    }

    const payload = Buffer.from(payloadEncoded, 'base64url').toString('utf8');
    const expected = createHmac('sha256', this.getStateSecret()).update(payload).digest('base64url');
    if (expected !== signature) {
      throw new BadRequestException('State OAuth invalido.');
    }

    let parsed: any = {};
    try {
      parsed = JSON.parse(payload);
    } catch {
      throw new BadRequestException('State OAuth invalido.');
    }

    if (String(parsed?.uid || '') !== user.id || String(parsed?.tid || '') !== user.tenant_id) {
      throw new UnauthorizedException('State OAuth nao pertence ao usuario atual.');
    }

    const ts = Number(parsed?.ts || 0);
    if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 15 * 60 * 1000) {
      throw new BadRequestException('State OAuth expirado.');
    }

    return {
      returnTo: this.normalizeReturnTo(parsed?.return_to, req),
    };
  }

  private normalizeReturnTo(raw: unknown, req: Request) {
    const fallback = '/servico/agenda';
    const value = String(raw || '').trim();
    if (!value) return fallback;

    try {
      const requestUrl = new URL(this.getRequestOrigin(req));
      const candidate = new URL(value, requestUrl.origin);
      if (candidate.hostname !== requestUrl.hostname) {
        return fallback;
      }
      return candidate.toString();
    } catch {
      return fallback;
    }
  }

  private getOriginFromUrl(value: string) {
    try {
      return new URL(value).origin;
    } catch {
      return '';
    }
  }

  private getRequestOrigin(req: Request) {
    const proto = String((req.headers['x-forwarded-proto'] as string) || req.protocol || 'http').split(',')[0].trim();
    const host = String(req.headers['x-forwarded-host'] || req.get('host') || '').split(',')[0].trim();
    return `${proto}://${host}`;
  }

  private getRedirectUri(req: Request) {
    const explicit = this.normalizeOptionalText(process.env.GOOGLE_OAUTH_REDIRECT_URI);
    if (explicit) return explicit;
    return `${this.getRequestOrigin(req)}/api/google-calendar/callback`;
  }

  private getRequiredEnv(name: string) {
    const value = String(process.env[name] || '').trim();
    if (!value) {
      throw new BadRequestException(`Env obrigatorio ausente: ${name}`);
    }
    return value;
  }

  private getStateSecret() {
    return (
      this.normalizeOptionalText(process.env.GOOGLE_OAUTH_STATE_SECRET) ||
      this.normalizeOptionalText(process.env.APP_ENCRYPTION_KEY) ||
      this.normalizeOptionalText(process.env.JWT_SECRET) ||
      'gecom-google-calendar-state'
    );
  }

  private getEncryptionKey() {
    const secret =
      this.normalizeOptionalText(process.env.GOOGLE_CALENDAR_TOKEN_SECRET) ||
      this.normalizeOptionalText(process.env.APP_ENCRYPTION_KEY) ||
      this.normalizeOptionalText(process.env.JWT_SECRET);
    if (!secret) {
      throw new BadRequestException('Env obrigatoria ausente para criptografar tokens do Google.');
    }
    return createHash('sha256').update(secret).digest();
  }

  private encryptToken(value: string) {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.getEncryptionKey(), iv);
    const encrypted = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
    const tag = cipher.getAuthTag();
    return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
  }

  private decryptToken(value: string) {
    const [ivRaw, tagRaw, contentRaw] = String(value || '').split('.');
    if (!ivRaw || !tagRaw || !contentRaw) {
      throw new BadRequestException('Token Google armazenado em formato invalido.');
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.getEncryptionKey(),
      Buffer.from(ivRaw, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagRaw, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(contentRaw, 'base64url')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  }

  private computeTokenExpiry(expiresIn: unknown) {
    const seconds = Number(expiresIn);
    if (!Number.isFinite(seconds) || seconds <= 0) return null;
    return new Date(Date.now() + Math.max(30, Math.trunc(seconds) - 30) * 1000);
  }

  private parseBoundedInteger(value: unknown, fallback: number, min: number, max: number) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(min, Math.min(max, Math.trunc(parsed)));
  }

  private parseBoolean(value: unknown, fallback: boolean) {
    if (typeof value === 'boolean') return value;
    const raw = String(value ?? '').trim().toLowerCase();
    if (!raw) return fallback;
    if (['1', 'true', 'yes', 'sim', 'on'].includes(raw)) return true;
    if (['0', 'false', 'no', 'nao', 'não', 'off'].includes(raw)) return false;
    return fallback;
  }

  private normalizeOptionalText(value: unknown) {
    const text = String(value ?? '').trim();
    return text || null;
  }

  private toDate(value: unknown) {
    if (!value) return null;
    const date = value instanceof Date ? value : new Date(String(value));
    return Number.isNaN(date.getTime()) ? null : date;
  }

  private async readJsonSafe(response: Response) {
    const text = await response.text().catch(() => '');
    if (!text) return {};
    try {
      return JSON.parse(text);
    } catch {
      return { message: text };
    }
  }
}
