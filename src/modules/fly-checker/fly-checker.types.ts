export type Scope = { tenantId: string; userId: string };
export type DatePair = { departure: string; returning: string };
export type Segment = {
  from: string;
  to: string;
  departure: string;
  arrival: string;
  carrier: string;
  flight: string;
};
export type FlightOffer = {
  fingerprint: string;
  price: string;
  currency: string;
  departure_date: string;
  return_date: string;
  airline: string;
  itinerary: Segment[][];
  fare_details: Record<string, unknown>[];
};
export type FlightQuery = DatePair & { origin: string; destination: string; nonStop: boolean };
export const FLIGHT_PROVIDER = 'FLY_CHECKER_FLIGHT_PROVIDER';
export interface FlightProvider {
  readonly name: string;
  readonly environment: string;
  configured(): boolean;
  search(
    query: FlightQuery,
    signal: AbortSignal,
    beforeRequest?: () => Promise<void>
  ): Promise<FlightOffer[]>;
}
export function settingNumber(value: unknown, fallback: number, min: number, max: number): number {
  const n = value === undefined || value === '' ? fallback : Number(value);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
}
