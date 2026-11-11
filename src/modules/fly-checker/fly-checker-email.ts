import type { FlightOffer } from './fly-checker.types';
const escapeHtml = (value: string) =>
  value.replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!
  );
export function opportunityEmail(
  search: { id: string; origin: string; destination: string; email: string },
  offer: FlightOffer,
  reasons: string[],
  stats: { average: number | null; low: number | null },
  baseUrl: string,
  test: boolean
) {
  const brl = (v: number | null) =>
    v === null
      ? 'Histórico ainda insuficiente'
      : v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  const date = (s: string) => s.split('-').reverse().join('/');
  const subject = `${test ? '[TESTE] ' : ''}FlyChecker: ${search.origin} → ${search.destination} por ${brl(Number(offer.price))}`;
  const url = new URL('/FlyCheckerView', baseUrl);
  url.searchParams.set('id', search.id);
  const text = [
    subject,
    `Ida: ${date(offer.departure_date)} | Volta: ${date(offer.return_date)}`,
    '1 adulto · econômica · preço total de ida e volta em BRL',
    `Companhia: ${offer.airline || 'Não informada'}`,
    `Média dos últimos 7 dias: ${brl(stats.average)}`,
    `Menor preço anterior: ${brl(stats.low)}`,
    `Motivo: ${reasons.join('; ')}`,
    `Observado em: ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })} (Brasília)`,
    'A disponibilidade e o preço podem mudar. Confira as condições da tarifa antes da compra.',
    test ? 'Dados do ambiente de testes da Amadeus.' : '',
    url.toString(),
  ]
    .filter(Boolean)
    .join('\n');
  return {
    to: search.email,
    subject,
    text,
    html: `<div style="font-family:Arial,sans-serif;max-width:680px;margin:auto;color:#203040"><h2>GECOM · FlyChecker</h2><p style="white-space:pre-line">${escapeHtml(text)}</p><p><a href="${escapeHtml(url.toString())}">Ver histórico da busca</a></p></div>`,
  };
}
