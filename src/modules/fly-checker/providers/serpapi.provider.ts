import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import type { FlightOffer, FlightProvider, FlightQuery, Segment } from '../fly-checker.types';

@Injectable()
export class SerpApiProvider implements FlightProvider {
  readonly name = 'serpapi';
  readonly environment = 'production';
  constructor(private readonly config: ConfigService) {}
  configured() {
    return Boolean(this.config.get('SERPAPI_API_KEY'));
  }
  private location(code: string) {
    // Google Flights accepts airport codes, not every metropolitan IATA code.
    const cities = {
      NYC: 'JFK,EWR,LGA',
      SAO: 'GRU,CGH,VCP',
      RIO: 'GIG,SDU',
      LON: 'LHR,LGW,LCY,STN,LTN,SEN',
      PAR: 'CDG,ORY',
      TYO: 'HND,NRT',
    };
    return cities[code] || code;
  }
  private async request(params: URLSearchParams, signal: AbortSignal): Promise<any> {
    if (!this.configured()) throw new Error('SerpApi: configure SERPAPI_API_KEY no backend.');
    params.set('api_key', this.config.get<string>('SERPAPI_API_KEY')!);
    const response = await fetch(`https://serpapi.com/search.json?${params}`, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(45000)]),
      headers: { Accept: 'application/json' },
    });
    if (!response.ok)
      throw new Error(
        `SerpApi: consulta indisponível (HTTP ${response.status}). Confira a chave e a cota do plano.`
      );
    const body = await response.json();
    if (body.error) {
      // Empty searches may use an error message even though the search completed successfully.
      if (
        body.search_metadata?.status === 'Success' &&
        /hasn.t returned any results|no results/i.test(String(body.error))
      )
        return body;
      throw new Error(
        'SerpApi: não foi possível concluir a pesquisa. Confira os aeroportos, a chave e a cota do plano.'
      );
    }
    if (body.search_metadata?.status !== 'Success' || body.search_parameters?.currency !== 'BRL') {
      throw new Error('SerpApi: resposta inválida ou moeda diferente de BRL.');
    }
    return body;
  }
  private rows(body: any): any[] {
    return [
      ...(Array.isArray(body.best_flights) ? body.best_flights : []),
      ...(Array.isArray(body.other_flights) ? body.other_flights : []),
    ]
      .filter(
        (row) =>
          Number.isFinite(Number(row.price)) &&
          Number(row.price) > 0 &&
          Array.isArray(row.flights) &&
          row.flights.length
      )
      .sort((a, b) => Number(a.price) - Number(b.price));
  }
  private segments(row: any): Segment[] {
    return row.flights.map((f: any) => ({
      from: String(f.departure_airport?.id || ''),
      to: String(f.arrival_airport?.id || ''),
      departure: String(f.departure_airport?.time || '').replace(' ', 'T'),
      arrival: String(f.arrival_airport?.time || '').replace(' ', 'T'),
      carrier: String(f.airline || ''),
      flight: String(f.flight_number || ''),
    }));
  }
  async search(
    query: FlightQuery,
    signal: AbortSignal,
    beforeRequest?: () => Promise<void>
  ): Promise<FlightOffer[]> {
    const params = new URLSearchParams({
      engine: 'google_flights',
      type: '1',
      departure_id: this.location(query.origin),
      arrival_id: this.location(query.destination),
      outbound_date: query.departure,
      return_date: query.returning,
      travel_class: '1',
      adults: '1',
      currency: 'BRL',
      hl: 'en',
      gl: 'br',
      stops: query.nonStop ? '1' : '0',
      sort_by: '2',
      no_cache: 'true',
    });
    await beforeRequest?.();
    const outbound = this.rows(await this.request(params, signal));
    const offers = new Map<string, FlightOffer>();
    // Bound cost: one initial call plus at most three return lookups per date pair.
    const candidates = outbound
      .filter((row) => typeof row.departure_token === 'string')
      .slice(0, 3);
    if (outbound.length && !candidates.length)
      throw new Error(
        'SerpApi: não foi possível obter os voos de volta para confirmar o preço total.'
      );
    for (const out of candidates) {
      const returnParams = new URLSearchParams(params);
      returnParams.set('departure_token', out.departure_token);
      await beforeRequest?.();
      const returned = await this.request(returnParams, signal);
      for (const back of this.rows(returned)) {
        const itinerary = [this.segments(out), this.segments(back)];
        if (itinerary.some((it) => it.some((s) => !s.from || !s.to || !s.departure || !s.arrival)))
          continue;
        if (
          itinerary[0][0].departure.slice(0, 10) !== query.departure ||
          itinerary[1][0].departure.slice(0, 10) !== query.returning
        )
          continue;
        if (
          query.nonStop &&
          (itinerary.some((it) => it.length !== 1) ||
            [out, back].some(
              (r) => r.layovers?.length || r.flights.some((f: any) => f.stops?.length)
            ))
        )
          continue;
        if (
          [out, back].some((r) =>
            r.flights.some((f: any) => f.travel_class && f.travel_class !== 'Economy')
          )
        )
          continue;
        const price = Number(back.price);
        if (price >= 1e10) continue;
        const fare_details = [out, back].map((r) => ({
          cabin: 'ECONOMY',
          conditions: (r.extensions || []).filter((x: unknown) => typeof x === 'string'),
          checkedBags: {},
        }));
        const fingerprint = createHash('sha256')
          .update(JSON.stringify({ itinerary, fare_details, adults: 1, currency: 'BRL' }))
          .digest('hex');
        const offer: FlightOffer = {
          fingerprint,
          price: price.toFixed(2),
          currency: 'BRL',
          departure_date: query.departure,
          return_date: query.returning,
          airline: [...new Set(itinerary.flat().map((s) => s.carrier))].join(' / ').slice(0, 255),
          itinerary,
          fare_details,
        };
        if (!offers.has(fingerprint) || price < Number(offers.get(fingerprint)!.price))
          offers.set(fingerprint, offer);
      }
    }
    return [...offers.values()].sort((a, b) => Number(a.price) - Number(b.price));
  }
}
