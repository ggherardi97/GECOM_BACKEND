import { Injectable } from '@nestjs/common';
@Injectable()
export class OpportunityService {
  evaluate(
    price: number,
    max: number,
    historical: { average: number | null; low: number | null; samples: number; days: number }
  ) {
    const reasons: string[] = [];
    if (price < max) reasons.push('Preço abaixo do limite configurado');
    // Multiple days prevent a few rapid manual checks from becoming a misleading baseline.
    if (
      historical.average !== null &&
      historical.samples >= 3 &&
      historical.days >= 2 &&
      price <= historical.average * 0.8
    ) {
      reasons.push(
        `Preço ${((1 - price / historical.average) * 100).toFixed(1)}% abaixo da média dos últimos 7 dias`
      );
    }
    if (historical.low !== null && price < historical.low)
      reasons.push('Novo menor preço encontrado para esta busca');
    return reasons;
  }
  shouldNotify(
    price: number,
    sameFareLow: number | null,
    last: { price: number; sentAt: Date } | null,
    now = new Date()
  ) {
    // Once a fare was notified, only a >=5% improvement over its best alerted price qualifies.
    if (sameFareLow !== null && price > sameFareLow * 0.95) return false;
    // At most one message per search per 24h, except for >=5% improvement.
    if (last && now.getTime() - last.sentAt.getTime() < 86400000 && price > last.price * 0.95)
      return false;
    return true;
  }
}
