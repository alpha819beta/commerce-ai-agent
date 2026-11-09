import { apiClient, ApiClientError } from '../apiClient';

function mockFetchOnce(status: number, body: unknown) {
  (global as any).fetch = jest.fn().mockResolvedValue({
    status,
    json: async () => body,
  });
}

describe('apiClient', () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('unwraps data on a successful envelope', async () => {
    mockFetchOnce(200, { success: true, data: { id: '123' } });

    const result = await apiClient.get<{ id: string }>('/orders/123');

    expect(result).toEqual({ id: '123' });
  });

  it('throws ApiClientError with the API error code/message/status on a failure envelope', async () => {
    mockFetchOnce(404, {
      success: false,
      error: { code: 'ORDER_NOT_FOUND', message: 'Order not found' },
    });

    await expect(apiClient.get('/orders/missing')).rejects.toMatchObject({
      code: 'ORDER_NOT_FOUND',
      message: 'Order not found',
      status: 404,
    });
    await expect(apiClient.get('/orders/missing')).rejects.toBeInstanceOf(ApiClientError);
  });

  it('wraps a network failure as a NETWORK_ERROR ApiClientError', async () => {
    (global as any).fetch = jest.fn().mockRejectedValue(new Error('ECONNREFUSED'));

    await expect(apiClient.get('/orders/123')).rejects.toMatchObject({
      code: 'NETWORK_ERROR',
    });
  });

  it('sends POST bodies as JSON', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ status: 200, json: async () => ({ success: true, data: {} }) });
    (global as any).fetch = fetchMock;

    await apiClient.post('/orders/123/cancel', { reason: 'test' });

    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/orders/123/cancel'),
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ reason: 'test' }),
      })
    );
  });
});
