import { apiClient, ApiClientError } from '../apiClient';
import { resolveOrder, resolveProductVariant } from '../resolvers';

jest.mock('../apiClient', () => {
  const actual = jest.requireActual('../apiClient');
  return { ...actual, apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn() } };
});

const mockedGet = apiClient.get as jest.Mock;

function notFound(code: string, message = 'not found') {
  return new ApiClientError(code, message, 404);
}

describe('resolveOrder', () => {
  afterEach(() => jest.resetAllMocks());

  it('resolves directly by order number', async () => {
    mockedGet.mockResolvedValueOnce({ id: 'order-1', orderNumber: 'ORD-1043', status: 'pending' });

    const order = await resolveOrder('ORD-1043');

    expect(order.id).toBe('order-1');
    expect(mockedGet).toHaveBeenCalledWith('/orders/number/ORD-1043');
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('falls back to id lookup when the order-number lookup 404s', async () => {
    mockedGet
      .mockRejectedValueOnce(notFound('ORDER_NOT_FOUND'))
      .mockResolvedValueOnce({ id: 'raw-id-123', orderNumber: 'ORD-9999', status: 'pending' });

    const order = await resolveOrder('raw-id-123');

    expect(order.id).toBe('raw-id-123');
    expect(mockedGet).toHaveBeenNthCalledWith(1, '/orders/number/raw-id-123');
    expect(mockedGet).toHaveBeenNthCalledWith(2, '/orders/raw-id-123');
  });

  it('propagates a non-ORDER_NOT_FOUND error without falling back', async () => {
    mockedGet.mockRejectedValueOnce(new ApiClientError('NETWORK_ERROR', 'down', 0));

    await expect(resolveOrder('ORD-1')).rejects.toMatchObject({ code: 'NETWORK_ERROR' });
    expect(mockedGet).toHaveBeenCalledTimes(1);
  });

  it('propagates the id-lookup failure when both lookups fail', async () => {
    mockedGet
      .mockRejectedValueOnce(notFound('ORDER_NOT_FOUND'))
      .mockRejectedValueOnce(notFound('ORDER_NOT_FOUND', 'still not found'));

    await expect(resolveOrder('nope')).rejects.toMatchObject({ code: 'ORDER_NOT_FOUND', message: 'still not found' });
  });
});

describe('resolveProductVariant', () => {
  afterEach(() => jest.resetAllMocks());

  const variant = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'variant-1',
    sku: 'SKU-001',
    price: 49.99,
    isDefault: true,
    ...overrides,
  });

  const product = (overrides: Partial<Record<string, unknown>> = {}) => ({
    id: 'product-1',
    name: 'Headphones',
    description: 'Great headphones',
    variants: [variant()],
    ...overrides,
  });

  it('resolves directly when the identifier is a product id', async () => {
    mockedGet.mockResolvedValueOnce(product());

    const resolved = await resolveProductVariant('product-1');

    expect(resolved).toMatchObject({ productId: 'product-1', variantId: 'variant-1', sku: 'SKU-001' });
    expect(mockedGet).toHaveBeenCalledWith('/products/product-1');
  });

  it('falls back to search and matches a SKU case-insensitively', async () => {
    mockedGet
      .mockRejectedValueOnce(notFound('PRODUCT_NOT_FOUND'))
      .mockResolvedValueOnce({
        data: [product({ id: 'p1', variants: [variant({ sku: 'SKU-001' })] }), product({ id: 'p2', variants: [variant({ sku: 'SKU-002' })] })],
      });

    const resolved = await resolveProductVariant('sku-002');

    expect(resolved.productId).toBe('p2');
    expect(resolved.sku).toBe('SKU-002');
  });

  it('uses the default variant when search returns exactly one product and no SKU matches', async () => {
    mockedGet
      .mockRejectedValueOnce(notFound('PRODUCT_NOT_FOUND'))
      .mockResolvedValueOnce({ data: [product({ id: 'only-one' })] });

    const resolved = await resolveProductVariant('Headphones');

    expect(resolved.productId).toBe('only-one');
  });

  it('throws PRODUCT_NOT_FOUND when search returns nothing', async () => {
    mockedGet.mockRejectedValueOnce(notFound('PRODUCT_NOT_FOUND')).mockResolvedValueOnce({ data: [] });

    await expect(resolveProductVariant('does-not-exist')).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });

  it('throws PRODUCT_NOT_FOUND when search is ambiguous (multiple matches, no SKU hit)', async () => {
    mockedGet
      .mockRejectedValueOnce(notFound('PRODUCT_NOT_FOUND'))
      .mockResolvedValueOnce({ data: [product({ id: 'p1' }), product({ id: 'p2' })] });

    await expect(resolveProductVariant('phone')).rejects.toMatchObject({ code: 'PRODUCT_NOT_FOUND' });
  });
});
