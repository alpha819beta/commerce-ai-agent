import { apiClient, ApiClientError } from './apiClient';

export interface ResolvedOrder {
  id: string;
  orderNumber: string;
  status: string;
  paymentStatus: string;
  fulfillmentStatus: string;
  grandTotal: number;
}

export interface ResolvedVariant {
  productId: string;
  productName: string;
  variantId: string;
  sku: string;
  price: number;
  description: string;
}

interface PaginatedResponse<T> {
  data: T[];
}

/**
 * Resolves an admin-provided order identifier — an order number like
 * "ORD-1043" or a raw order id — to the order. Order numbers are tried
 * first since that's what admins actually type; a raw id falls through to
 * the id lookup.
 */
export async function resolveOrder(identifier: string): Promise<ResolvedOrder> {
  const trimmed = identifier.trim();

  try {
    return await apiClient.get<ResolvedOrder>(`/orders/number/${encodeURIComponent(trimmed)}`);
  } catch (err) {
    if (!(err instanceof ApiClientError) || err.code !== 'ORDER_NOT_FOUND') {
      throw err;
    }
  }

  return apiClient.get<ResolvedOrder>(`/orders/${encodeURIComponent(trimmed)}`);
}

/**
 * Resolves an admin-provided product reference — a SKU like "SKU-001", a
 * raw product id, or a product name — to a specific product variant.
 * SKUs are matched case-insensitively against every variant on every
 * product returned by the search, since SKUs don't belong to a single
 * product lookup endpoint.
 */
export async function resolveProductVariant(identifier: string): Promise<ResolvedVariant> {
  const trimmed = identifier.trim();

  try {
    const product = await apiClient.get<any>(`/products/${encodeURIComponent(trimmed)}`);
    const variant = product.variants.find((v: any) => v.isDefault) || product.variants[0];
    return toResolvedVariant(product, variant);
  } catch (err) {
    if (!(err instanceof ApiClientError) || err.code !== 'PRODUCT_NOT_FOUND') {
      throw err;
    }
  }

  const { data: products } = await apiClient.get<PaginatedResponse<any>>(
    `/products?search=${encodeURIComponent(trimmed)}&limit=50`
  );

  const bySku = findVariantBySku(products, trimmed);
  if (bySku) {
    return bySku;
  }

  if (products.length === 1) {
    const product = products[0];
    const variant = product.variants.find((v: any) => v.isDefault) || product.variants[0];
    return toResolvedVariant(product, variant);
  }

  throw new ApiClientError(
    'PRODUCT_NOT_FOUND',
    products.length > 1
      ? `"${identifier}" matches multiple products. Please specify the exact SKU.`
      : `Could not find a product matching "${identifier}"`,
    404
  );
}

function findVariantBySku(products: any[], sku: string): ResolvedVariant | undefined {
  const target = sku.toLowerCase();
  for (const product of products) {
    const variant = product.variants.find((v: any) => v.sku.toLowerCase() === target);
    if (variant) {
      return toResolvedVariant(product, variant);
    }
  }
  return undefined;
}

function toResolvedVariant(product: any, variant: any): ResolvedVariant {
  return {
    productId: product.id,
    productName: product.name,
    variantId: variant.id,
    sku: variant.sku,
    price: variant.price,
    description: product.description,
  };
}
