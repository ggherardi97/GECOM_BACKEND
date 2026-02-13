export interface DateRange {
  from: Date;
  to: Date;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function parseGmtOffsetToMs(offsetText: string): number {
  const normalized = offsetText.replace('UTC', 'GMT');
  const match = normalized.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/i);
  if (!match) return 0;

  const sign = match[1] === '-' ? -1 : 1;
  const hours = Number(match[2] ?? '0');
  const minutes = Number(match[3] ?? '0');

  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function getTimeZoneOffsetMs(date: Date, timeZone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    timeZoneName: 'shortOffset',
    hour: '2-digit',
  });

  const offsetName = formatter.formatToParts(date).find((part) => part.type === 'timeZoneName')?.value ?? 'GMT+0';
  return parseGmtOffsetToMs(offsetName);
}

function getZonedDateParts(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });

  const parts = formatter.formatToParts(date);
  const year = Number(parts.find((part) => part.type === 'year')?.value);
  const month = Number(parts.find((part) => part.type === 'month')?.value);
  const day = Number(parts.find((part) => part.type === 'day')?.value);

  return { year, month, day };
}

function toUtcFromZonedParts(
  parts: { year: number; month: number; day: number; hour: number; minute: number; second: number; millisecond: number },
  timeZone: string,
): Date {
  const utcGuess = new Date(
    Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond),
  );
  const offset = getTimeZoneOffsetMs(utcGuess, timeZone);
  return new Date(utcGuess.getTime() - offset);
}

function buildDayRange(year: number, month: number, day: number, timeZone: string): DateRange {
  return {
    from: toUtcFromZonedParts({ year, month, day, hour: 0, minute: 0, second: 0, millisecond: 0 }, timeZone),
    to: toUtcFromZonedParts({ year, month, day, hour: 23, minute: 59, second: 59, millisecond: 999 }, timeZone),
  };
}

function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function normalizeInput(input: string): string {
  return input
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function resolveRelativeDateRange(input: string, now = new Date(), timeZone = 'America/Sao_Paulo'): DateRange | null {
  const normalizedInput = normalizeInput(input);
  const todayParts = getZonedDateParts(now, timeZone);

  if (normalizedInput === 'hoje' || normalizedInput === 'today') {
    return buildDayRange(todayParts.year, todayParts.month, todayParts.day, timeZone);
  }

  if (normalizedInput === 'ontem' || normalizedInput === 'yesterday') {
    const yesterday = new Date(now.getTime() - DAY_MS);
    const yesterdayParts = getZonedDateParts(yesterday, timeZone);
    return buildDayRange(yesterdayParts.year, yesterdayParts.month, yesterdayParts.day, timeZone);
  }

  if (normalizedInput.includes('ultimos 30 dias') || normalizedInput.includes('last 30 days')) {
    const todayRange = buildDayRange(todayParts.year, todayParts.month, todayParts.day, timeZone);
    return {
      from: new Date(todayRange.from.getTime() - 29 * DAY_MS),
      to: todayRange.to,
    };
  }

  if (normalizedInput.includes('ultimo trimestre') || normalizedInput.includes('last quarter')) {
    const currentQuarter = Math.floor((todayParts.month - 1) / 3);
    let startMonth = currentQuarter * 3 - 2;
    let year = todayParts.year;

    if (startMonth <= 0) {
      startMonth += 12;
      year -= 1;
    }

    const endMonth = startMonth + 2;
    const endDay = daysInMonth(year, endMonth);

    return {
      from: toUtcFromZonedParts({ year, month: startMonth, day: 1, hour: 0, minute: 0, second: 0, millisecond: 0 }, timeZone),
      to: toUtcFromZonedParts(
        { year, month: endMonth, day: endDay, hour: 23, minute: 59, second: 59, millisecond: 999 },
        timeZone,
      ),
    };
  }

  return null;
}

