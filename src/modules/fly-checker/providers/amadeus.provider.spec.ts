import { ConfigService } from '@nestjs/config';
import { AmadeusProvider } from './amadeus.provider';
const query = {
  origin: 'GRU',
  destination: 'NYC',
  departure: '2026-11-01',
  returning: '2026-11-10',
  nonStop: true,
};
const raw = () => ({
  id: 'ephemeral-id',
  price: { total: '4200.00', grandTotal: '4250.00', currency: 'BRL' },
  itineraries: [
    {
      segments: [
        {
          departure: { iataCode: 'GRU', at: '2026-11-01T12:00:00' },
          arrival: { iataCode: 'JFK', at: '2026-11-01T22:00:00' },
          carrierCode: 'LA',
          number: '8000',
          numberOfStops: 0,
        },
      ],
    },
    {
      segments: [
        {
          departure: { iataCode: 'JFK', at: '2026-11-10T12:00:00' },
          arrival: { iataCode: 'GRU', at: '2026-11-11T02:00:00' },
          carrierCode: 'LA',
          number: '8001',
          numberOfStops: 0,
        },
      ],
    },
  ],
  travelerPricings: [
    {
      travelerType: 'ADULT',
      fareDetailsBySegment: [1, 2].map(() => ({
        cabin: 'ECONOMY',
        fareBasis: 'ABC',
        class: 'Q',
        includedCheckedBags: { quantity: 1 },
      })),
    },
  ],
});
describe('Amadeus provider', () => {
  const config = new ConfigService({
    AMADEUS_CLIENT_ID: 'test-client',
    AMADEUS_CLIENT_SECRET: 'test-secret',
  });
  afterEach(() => jest.restoreAllMocks());
  it('normalizes round trips using the grand total and stable fare identity', () => {
    const provider = new AmadeusProvider(config);
    const original = raw();
    const offer = provider.normalize(
      { data: [original], dictionaries: { carriers: { LA: 'LATAM' } } },
      query
    )[0];
    expect(offer.price).toBe('4250.00');
    expect(offer.airline).toBe('LATAM');
    original.id = 'new-provider-id';
    original.price.grandTotal = '3200.00';
    expect(provider.normalize({ data: [original] }, query)[0].fingerprint).toBe(offer.fingerprint);
    original.travelerPricings[0].fareDetailsBySegment[0].includedCheckedBags.quantity = 0;
    expect(provider.normalize({ data: [original] }, query)[0].fingerprint).not.toBe(
      offer.fingerprint
    );
  });
  it('excludes a different currency, stopped flights and non-economy fares', () => {
    const provider = new AmadeusProvider(config);
    const currency = raw();
    currency.price.currency = 'USD';
    const stopped = raw();
    stopped.itineraries[0].segments[0].numberOfStops = 1;
    const cabin = raw();
    cabin.travelerPricings[0].fareDetailsBySegment[0].cabin = 'BUSINESS';
    expect(provider.normalize({ data: [currency, stopped, cabin] }, query)).toEqual([]);
  });
  it('caches OAuth token, refreshes once on 401, and requests the complete price range', async () => {
    const mock = jest
      .spyOn(global, 'fetch')
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'token1', expires_in: 1800 }))
      )
      .mockResolvedValueOnce(new Response('', { status: 401 }))
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: 'token2', expires_in: 1800 }))
      )
      .mockResolvedValue(new Response(JSON.stringify({ data: [raw()] })));
    const provider = new AmadeusProvider(config);
    expect(await provider.search(query, AbortSignal.timeout(1000))).toHaveLength(1);
    expect(mock).toHaveBeenCalledTimes(4);
    const url = new URL(String(mock.mock.calls[3][0]));
    expect(url.searchParams.get('maxPrice')).toBeNull();
    expect(url.searchParams.get('nonStop')).toBe('true');
    expect(url.searchParams.get('currencyCode')).toBe('BRL');
  });
  it('never includes API response bodies or credentials in authentication errors', async () => {
    jest
      .spyOn(global, 'fetch')
      .mockResolvedValue(new Response('sensitive-provider-response', { status: 401 }));
    await expect(
      new AmadeusProvider(config).search(query, AbortSignal.timeout(1000))
    ).rejects.toThrow('HTTP 401');
  });
});
