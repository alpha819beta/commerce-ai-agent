import { apiClient, ApiClientError } from '../../apiClient';
import { resolveOrder } from '../../resolvers';
import { cancelOrder, getOrderStatus, updateOrderStatus } from '../../tools/orders';

jest.mock('../../apiClient', () => {
  const actual = jest.requireActual('../../apiClient');
  return { ...actual, apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn() } };
});
jest.mock('../../resolvers');

const mockedResolveOrder = resolveOrder as jest.Mock;
const mockedPost = apiClient.post as jest.Mock;

const order = { id: 'order-1', orderNumber: 'ORD-1043', status: 'pending', paymentStatus: 'paid', fulfillmentStatus: 'unfulfilled', grandTotal: 99.98 };

describe('getOrderStatus', () => {
  afterEach(() => jest.resetAllMocks());

  it('reports the resolved order status', async () => {
    mockedResolveOrder.mockResolvedValueOnce(order);

    const result = await getOrderStatus('ORD-1043');

    expect(result.ok).toBe(true);
    expect(result.message).toContain('ORD-1043');
    expect(result.message).toContain('pending');
  });

  it('reports a friendly message when the order cannot be found', async () => {
    mockedResolveOrder.mockRejectedValueOnce(new ApiClientError('ORDER_NOT_FOUND', 'Order not found', 404));

    const result = await getOrderStatus('ORD-9999');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('ORD-9999');
  });
});

describe('updateOrderStatus', () => {
  afterEach(() => jest.resetAllMocks());

  it('rejects an invalid status without resolving the order or calling the API', async () => {
    const result = await updateOrderStatus('ORD-1043', 'not-a-real-status');

    expect(result).toMatchObject({ ok: false, code: 'INVALID_STATUS' });
    expect(mockedResolveOrder).not.toHaveBeenCalled();
    expect(mockedPost).not.toHaveBeenCalled();
  });

  it('normalizes status casing/spacing before calling the API', async () => {
    mockedResolveOrder.mockResolvedValueOnce(order);
    mockedPost.mockResolvedValueOnce({ ...order, status: 'on_hold' });

    const result = await updateOrderStatus('ORD-1043', 'On Hold');

    expect(result.ok).toBe(true);
    expect(mockedPost).toHaveBeenCalledWith('/orders/order-1/status', { status: 'on_hold', reason: undefined });
  });

  it('surfaces the Backend API error message on a failed transition', async () => {
    mockedResolveOrder.mockResolvedValueOnce({ ...order, status: 'cancelled' });
    mockedPost.mockRejectedValueOnce(new ApiClientError('ORDER_ALREADY_CANCELLED', 'Order already cancelled', 400));

    const result = await updateOrderStatus('ORD-1043', 'cancelled');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Order already cancelled');
  });

  it('reports a friendly message when the order cannot be resolved', async () => {
    mockedResolveOrder.mockRejectedValueOnce(new ApiClientError('ORDER_NOT_FOUND', 'Order not found', 404));

    const result = await updateOrderStatus('nonexistent', 'shipped');

    expect(result.ok).toBe(false);
    expect(mockedPost).not.toHaveBeenCalled();
  });
});

describe('cancelOrder', () => {
  afterEach(() => jest.resetAllMocks());

  it('cancels a resolved order', async () => {
    mockedResolveOrder.mockResolvedValueOnce(order);
    mockedPost.mockResolvedValueOnce({ ...order, status: 'cancelled' });

    const result = await cancelOrder('ORD-1043', 'customer request');

    expect(result.ok).toBe(true);
    expect(mockedPost).toHaveBeenCalledWith('/orders/order-1/cancel', { reason: 'customer request' });
    expect(result.message).toContain('customer request');
  });

  it('surfaces an already-cancelled error from the API', async () => {
    mockedResolveOrder.mockResolvedValueOnce(order);
    mockedPost.mockRejectedValueOnce(new ApiClientError('ORDER_ALREADY_CANCELLED', 'Order already cancelled', 400));

    const result = await cancelOrder('ORD-1043');

    expect(result.ok).toBe(false);
    expect(result.message).toBe('Order already cancelled');
  });
});
