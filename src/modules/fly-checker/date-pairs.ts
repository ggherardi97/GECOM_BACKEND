import { BadRequestException } from '@nestjs/common';
const DAY = 86400000;
export function dateOnly(value: string | Date): string {
  return new Date(value).toISOString().slice(0, 10);
}
export function datePairs(
  input: {
    departure_start: string | Date;
    departure_end: string | Date;
    return_start: string | Date;
    return_end: string | Date;
  },
  max = 25,
  now = new Date()
) {
  const dates = ['departure_start', 'departure_end', 'return_start', 'return_end'].map((key) => {
    const raw = input[key];
    const d = new Date(raw);
    if (!Number.isFinite(d.getTime()) || (typeof raw === 'string' && dateOnly(d) !== raw)) {
      throw new BadRequestException('Data inválida.');
    }
    return d.getTime();
  });
  const [start, end, retStart, retEnd] = dates;
  if (
    start > end ||
    retStart > retEnd ||
    retEnd <= start ||
    end - start > 30 * DAY ||
    retEnd - retStart > 30 * DAY
  ) {
    throw new BadRequestException(
      'Intervalos inválidos. Cada período pode ter até 31 dias; a volta deve ocorrer depois da ida.'
    );
  }
  const pairs: { departure: string; returning: string }[] = [];
  const tomorrow = Date.parse(now.toISOString().slice(0, 10)) + DAY;
  for (let d = Math.max(start, tomorrow); d <= end; d += DAY) {
    for (let r = retStart; r <= retEnd; r += DAY) {
      if (r <= d) continue;
      pairs.push({ departure: dateOnly(new Date(d)), returning: dateOnly(new Date(r)) });
      if (pairs.length > max)
        throw new BadRequestException(
          `Use períodos menores: máximo de ${max} combinações válidas de ida e volta por busca.`
        );
    }
  }
  return pairs;
}
