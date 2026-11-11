import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'node:crypto';
import { setTimeout as delay } from 'node:timers/promises';
import type { FlightOffer, FlightProvider, FlightQuery, Segment } from '../fly-checker.types';

@Injectable()
export class AmadeusProvider implements FlightProvider {
  readonly name = 'amadeus';
  private token: { value: string; expires: number } | null = null;
  constructor(private readonly config: ConfigService) {}
  get environment() {
    return this.config.get('AMADEUS_ENVIRONMENT', 'test');
  }
  configured() {
    return (
      ['test', 'production'].includes(this.environment) &&
      Boolean(this.config.get('AMADEUS_CLIENT_ID') && this.config.get('AMADEUS_CLIENT_SECRET'))
    );
  }
  private get baseUrl() {
    if (!this.configured())
      throw new Error(
        'Configure AMADEUS_CLIENT_ID, AMADEUS_CLIENT_SECRET e AMADEUS_ENVIRONMENT no backend.'
      );
    return this.environment === 'production'
      ? 'https://api.amadeus.com'
      : 'https://test.api.amadeus.com';
  }
  private async accessToken(signal: AbortSignal) {
    if (this.token && this.token.expires > Date.now()) return this.token.value;
    const response = await fetch(`${this.baseUrl}/v1/security/oauth2/token`, {
      method: 'POST',
      signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: this.config.get<string>('AMADEUS_CLIENT_ID')!,
        client_secret: this.config.get<string>('AMADEUS_CLIENT_SECRET')!,
      }),
    });
    if (!response.ok)
      throw new Error(
        `Amadeus: falha na autenticação (HTTP ${response.status}). Confira as credenciais e o ambiente.`
      );
    const body = await response.json();
    if (!body.access_token || !Number.isFinite(Number(body.expires_in)))
      throw new Error('Amadeus: resposta de autenticação inválida.');
    this.token = {
      value: body.access_token,
      expires: Date.now() + Math.max(0, Number(body.expires_in) - 60) * 1000,
    };
    return this.token.value;
  }
  async search(
    query: FlightQuery,
    signal: AbortSignal,
    beforeRequest?: () => Promise<void>
  ): Promise<FlightOffer[]> {
    const params = new URLSearchParams({
      originLocationCode: query.origin,
      destinationLocationCode: query.destination,
      departureDate: query.departure,
      returnDate: query.returning,
      adults: '1',
      travelClass: 'ECONOMY',
      nonStop: String(query.nonStop),
      currencyCode: 'BRL',
      max: '50',
    });
    for (let attempt = 0; attempt < 3; attempt++) {
      await beforeRequest?.();
      const token = await this.accessToken(signal);
      await beforeRequest?.();
      const response = await fetch(`${this.baseUrl}/v2/shopping/flight-offers?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.any([signal, AbortSignal.timeout(20000)]),
      });
      if (response.status === 401 && attempt < 2) {
        this.token = null;
        await response.text();
        continue;
      }
      if ((response.status === 429 || response.status >= 500) && attempt < 2) {
        const retry = Number(response.headers.get('retry-after'));
        await response.text();
        await delay(
          Math.min(
            10000,
            Math.max(1000 * (attempt + 1), Number.isFinite(retry) ? retry * 1000 : 0)
          ),
          undefined,
          { signal }
        );
        continue;
      }
      if (!response.ok)
        throw new Error(`Amadeus: consulta indisponível (HTTP ${response.status}).`);
      const body = await response.json();
      if (!Array.isArray(body.data)) throw new Error('Amadeus: resposta de ofertas inválida.');
      return this.normalize(body, query);
    }
    throw new Error('Amadeus: limite de tentativas atingido.');
  }
  normalize(body: any, query: FlightQuery): FlightOffer[] {
    const offers = new Map<string, FlightOffer>();
    for (const raw of body.data) {
      const value = Number(raw.price?.grandTotal ?? raw.price?.total);
      if (!Number.isFinite(value) || value <= 0 || value >= 1e10 || raw.price?.currency !== 'BRL')
        continue;
      if (!Array.isArray(raw.itineraries) || raw.itineraries.length !== 2) continue;
      const itinerary: Segment[][] = raw.itineraries.map((it: any) =>
        (it.segments || []).map((s: any) => ({
          from: String(s.departure?.iataCode || ''),
          to: String(s.arrival?.iataCode || ''),
          departure: String(s.departure?.at || ''),
          arrival: String(s.arrival?.at || ''),
          carrier: String(s.carrierCode || ''),
          flight: String(s.number || ''),
        }))
      );
      if (
        itinerary.some(
          (it) => !it.length || it.some((s) => !s.from || !s.to || !s.departure || !s.arrival)
        )
      )
        continue;
      if (
        itinerary[0][0].departure.slice(0, 10) !== query.departure ||
        itinerary[1][0].departure.slice(0, 10) !== query.returning
      )
        continue;
      if (
        query.nonStop &&
        raw.itineraries.some(
          (it: any) =>
            it.segments.length !== 1 ||
            it.segments.some((s: any) => Number(s.numberOfStops || 0) !== 0)
        )
      )
        continue;
      const traveler = raw.travelerPricings;
      if (!Array.isArray(traveler) || traveler.length !== 1 || traveler[0].travelerType !== 'ADULT')
        continue;
      const fares = traveler[0].fareDetailsBySegment;
      if (
        !Array.isArray(fares) ||
        fares.length !== itinerary.flat().length ||
        fares.some((f: any) => f.cabin !== 'ECONOMY')
      )
        continue;
      const fare_details = fares.map((f: any) => ({
        cabin: f.cabin,
        fareBasis: f.fareBasis || '',
        class: f.class || '',
        brandedFare: f.brandedFare || '',
        checkedBags: f.includedCheckedBags || {},
        cabinBags: f.includedCabinBags || {},
      }));
      const fingerprint = createHash('sha256')
        .update(JSON.stringify({ itinerary, fare_details, adults: 1, currency: 'BRL' }))
        .digest('hex');
      const airline = [
        ...new Set(
          itinerary.flat().map((s) => String(body.dictionaries?.carriers?.[s.carrier] || s.carrier))
        ),
      ]
        .join(' / ')
        .slice(0, 255);
      const offer: FlightOffer = {
        fingerprint,
        price: value.toFixed(2),
        currency: 'BRL',
        departure_date: query.departure,
        return_date: query.returning,
        airline,
        itinerary,
        fare_details,
      };
      if (!offers.has(fingerprint) || value < Number(offers.get(fingerprint)!.price))
        offers.set(fingerprint, offer);
    }
    return [...offers.values()].sort((a, b) => Number(a.price) - Number(b.price));
  }
}
