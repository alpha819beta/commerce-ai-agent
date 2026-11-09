import { apiClient, ApiClientError } from '../../apiClient';
import { resolveProductVariant } from '../../resolvers';
import { getProduct, updateProductDescription, updateProductPrice } from '../../tools/products';

jest.mock('../../apiClient', () => {
  const actual = jest.requireActual('../../apiClient');
  return { ...actual, apiClient: { get: jest.fn(), post: jest.fn(), put: jest.fn() } };
});
jest.mock('../../resolvers');

const mockedResolve = resolveProductVariant as jest.Mock;
const mockedPut = apiClient.put as jest.Mock;

const resolved = {
  productId: 'product-1',
  productName: 'Headphones',
  variantId: 'variant-1',
  sku: 'SKU-001',
  price: 49.99,
  description: 'Great headphones',
};

describe('getProduct', () => {
  afterEach(() => jest.resetAllMocks());

  it('reports the resolved product details', async () => {
    mockedResolve.mockResolvedValueOnce(resolved);

    const result = await getProduct('SKU-001');

    expect(result.ok).toBe(true);
    expect(result.message).toContain('Headphones');
    expect(result.message).toContain('49.99');
  });

  it('reports a friendly message when the product cannot be found', async () => {
    mockedResolve.mockRejectedValueOnce(new ApiClientError('PRODUCT_NOT_FOUND', 'Could not find a product matching "nope"', 404));

    const result = await getProduct('nope');

    expect(result.ok).toBe(false);
    expect(result.message).toContain('nope');
  });
});

describe('updateProductPrice', () => {
  afterEach(() => jest.resetAllMocks());

  it.each([-1, NaN, Infinity])('rejects an invalid price (%p) without resolving the product', async (price) => {
    const result = await updateProductPrice('SKU-001', price as number);

    expect(result).toMatchObject({ ok: false, code: 'INVALID_PRICE' });
    expect(mockedResolve).not.toHaveBeenCalled();
    expect(mockedPut).not.toHaveBeenCalled();
  });

  it('updates the price of the resolved variant', async () => {
    mockedResolve.mockResolvedValueOnce(resolved);
    mockedPut.mockResolvedValueOnce({ ...resolved, price: 39.99 });

    const result = await updateProductPrice('SKU-001', 39.99);

    expect(result.ok).toBe(true);
    expect(mockedPut).toHaveBeenCalledWith('/products/product-1/variants/variant-1', { price: 39.99 });
    expect(result.message).toContain('39.99');
  });

  it('allows a price of exactly zero', async () => {
    mockedResolve.mockResolvedValueOnce(resolved);
    mockedPut.mockResolvedValueOnce({ ...resolved, price: 0 });

    const result = await updateProductPrice('SKU-001', 0);

    expect(result.ok).toBe(true);
  });

  it('surfaces a not-found error from resolution', async () => {
    mockedResolve.mockRejectedValueOnce(new ApiClientError('PRODUCT_NOT_FOUND', 'not found', 404));

    const result = await updateProductPrice('bad-sku', 10);

    expect(result.ok).toBe(false);
    expect(mockedPut).not.toHaveBeenCalled();
  });
});

describe('updateProductDescription', () => {
  afterEach(() => jest.resetAllMocks());

  it('rejects an empty description without resolving the product', async () => {
    const result = await updateProductDescription('SKU-001', '   ');

    expect(result).toMatchObject({ ok: false, code: 'INVALID_DESCRIPTION' });
    expect(mockedResolve).not.toHaveBeenCalled();
    expect(mockedPut).not.toHaveBeenCalled();
  });

  it('updates the description of the resolved product', async () => {
    mockedResolve.mockResolvedValueOnce(resolved);
    mockedPut.mockResolvedValueOnce({ ...resolved, description: 'New description' });

    const result = await updateProductDescription('SKU-001', 'New description');

    expect(result.ok).toBe(true);
    expect(mockedPut).toHaveBeenCalledWith('/products/product-1', { description: 'New description' });
  });
});
