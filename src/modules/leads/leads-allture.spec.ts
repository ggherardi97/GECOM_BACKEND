import { LeadsService } from './leads.service';

describe('GECOM lead ingestion in Allture CRM', () => {
  const originalFetch = global.fetch;
  const originalApiKey = process.env.ALLTURE_API_KEY;
  const service = Object.create(LeadsService.prototype) as LeadsService;
  const send = (params: Record<string, string>) =>
    service['sendGecomLeadToAllture']({
      submissionId: 'lead-123',
      leadName: 'Maria Souza',
      companyName: '',
      phone: '5511999998888',
      operationMode: 'Planilha e WhatsApp',
      importVolume: '',
      formContext: '',
      ...params,
    });

  beforeEach(() => {
    process.env.ALLTURE_API_KEY = 'test-key';
  });

  afterEach(() => {
    global.fetch = originalFetch;
    if (originalApiKey === undefined) delete process.env.ALLTURE_API_KEY;
    else process.env.ALLTURE_API_KEY = originalApiKey;
  });

  it('sends text fields and accepts a complete confirmation', async () => {
    const fetchMock = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, ignored_fields: [] }),
    });
    global.fetch = fetchMock;

    await expect(send({})).resolves.toBeUndefined();

    expect(fetchMock).toHaveBeenCalledWith(
      'https://api.allturecrm.com/functions/v1/leads-ingest',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'X-Api-Key': 'test-key',
          'Idempotency-Key': 'gecom-lead-123',
        }),
      }),
    );
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(body).toEqual({
      name: 'Maria Souza',
      telefone: '5511999998888',
      origem: 'Portal Gecom',
      custom_fields: { como_opera_hoje: 'Planilha e WhatsApp' },
    });
  });

  it('rejects a response that ignored fields', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ ok: true, ignored_fields: ['telefone'] }),
    });

    await expect(send({})).rejects.toThrow('ignorou campos');
  });
});
