import { ConfigService } from '@nestjs/config';
import { SerpApiProvider } from './serpapi.provider';
describe('SerpApi round trip search', () => {
  const query = {
    origin: 'GRU',
    destination: 'NYC',
    departure: '2026-11-01',
    returning: '2026-11-10',
    nonStop: true,
  };
  const leg = (back = false) => ({
    price: back ? 3200 : 3100,
    departure_token: back ? undefined : 'out-token',
    type: 'Round trip',
    flights: [
      {
        departure_airport: {
          id: back ? 'JFK' : 'GRU',
          time: back ? '2026-11-10 10:00' : '2026-11-01 10:00',
        },
        arrival_airport: {
          id: back ? 'GRU' : 'JFK',
          time: back ? '2026-11-11 00:00' : '2026-11-01 22:00',
        },
        airline: 'LATAM',
        flight_number: back ? 'LA 8001' : 'LA 8000',
        travel_class: 'Economy',
      },
    ],
  });
  const response = (rows: any[]) =>
    new Response(
      JSON.stringify({
        search_metadata: { status: 'Success' },
        search_parameters: { currency: 'BRL' },
        other_flights: rows,
      })
    );
  afterEach(() => jest.restoreAllMocks());
  it('does not spend further requests on returns after monitoring stops', async () => {
    const mock = jest.spyOn(global, 'fetch').mockResolvedValueOnce(response([leg()]));
    const beforeRequest = jest
      .fn()
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error('Monitoring stopped'));
    const provider = new SerpApiProvider(new ConfigService({ SERPAPI_API_KEY: 'test-key' }));
    await expect(provider.search(query, AbortSignal.timeout(5000), beforeRequest)).rejects.toThrow(
      'Monitoring stopped'
    );
    expect(mock).toHaveBeenCalledTimes(1);
  });
  it('fetches return details and uses the final round-trip price, not the outbound preview', async () => {
    const mock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(response([leg()]))
      .mockResolvedValueOnce(response([leg(true)]));
    const provider = new SerpApiProvider(new ConfigService({ SERPAPI_API_KEY: 'test-key' }));
    const offers = await provider.search(query, AbortSignal.timeout(5000));
    expect(offers).toHaveLength(1);
    expect(offers[0].price).toBe('3200.00');
    expect(offers[0].itinerary).toHaveLength(2);
    const first = new URL(String(mock.mock.calls[0][0]));
    const second = new URL(String(mock.mock.calls[1][0]));
    expect(first.searchParams.get('arrival_id')).toBe('JFK,EWR,LGA');
    expect(first.searchParams.get('no_cache')).toBe('true');
    expect(first.searchParams.get('stops')).toBe('1');
    expect(first.searchParams.get('max_price')).toBeNull();
    expect(second.searchParams.get('departure_token')).toBe('out-token');
  });
  it('refuses a different currency instead of labelling it BRL', async () => {
    jest.spyOn(global, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          search_metadata: { status: 'Success' },
          search_parameters: { currency: 'USD' },
          best_flights: [leg()],
        })
      )
    );
    const provider = new SerpApiProvider(new ConfigService({ SERPAPI_API_KEY: 'test-key' }));
    await expect(provider.search(query, AbortSignal.timeout(5000))).rejects.toThrow(
      'moeda diferente'
    );
  });
  it('does not report an incomplete itinerary as a usable fare', async () => {
    const row = leg();
    row.departure_token = undefined;
    jest.spyOn(global, 'fetch').mockResolvedValue(response([row]));
    await expect(
      new SerpApiProvider(new ConfigService({ SERPAPI_API_KEY: 'test-key' })).search(
        query,
        AbortSignal.timeout(5000)
      )
    ).rejects.toThrow('confirmar o preço total');
  });
});
