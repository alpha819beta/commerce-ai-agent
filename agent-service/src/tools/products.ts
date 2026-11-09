import { apiClient, ApiClientError } from '../apiClient';
import { resolveProductVariant } from '../resolvers';
import { ToolResult } from './types';

export async function getProduct(productIdentifier: string): Promise<ToolResult> {
  try {
    const variant = await resolveProductVariant(productIdentifier);
    return {
      ok: true,
      message: `${variant.productName} (SKU ${variant.sku}) is priced at $${variant.price.toFixed(2)}. Description: ${variant.description}`,
      data: { ...variant },
    };
  } catch (err) {
    return toFailure(err, productIdentifier);
  }
}

export async function updateProductPrice(productIdentifier: string, price: number): Promise<ToolResult> {
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0) {
    return {
      ok: false,
      message: `"${price}" is not a valid price. Price must be a non-negative number.`,
      code: 'INVALID_PRICE',
    };
  }

  try {
    const variant = await resolveProductVariant(productIdentifier);
    await apiClient.put(`/products/${variant.productId}/variants/${variant.variantId}`, { price });
    return {
      ok: true,
      message: `Updated ${variant.productName} (SKU ${variant.sku}) price from $${variant.price.toFixed(2)} to $${price.toFixed(2)}.`,
      data: { productId: variant.productId, variantId: variant.variantId, price },
    };
  } catch (err) {
    return toFailure(err, productIdentifier);
  }
}

export async function updateProductDescription(
  productIdentifier: string,
  description: string
): Promise<ToolResult> {
  if (typeof description !== 'string' || description.trim().length === 0) {
    return { ok: false, message: 'Description cannot be empty.', code: 'INVALID_DESCRIPTION' };
  }

  try {
    const variant = await resolveProductVariant(productIdentifier);
    await apiClient.put(`/products/${variant.productId}`, { description });
    return {
      ok: true,
      message: `Updated the description for ${variant.productName} (SKU ${variant.sku}).`,
      data: { productId: variant.productId, description },
    };
  } catch (err) {
    return toFailure(err, productIdentifier);
  }
}

function toFailure(err: unknown, identifier: string): ToolResult {
  if (err instanceof ApiClientError) {
    if (err.code === 'PRODUCT_NOT_FOUND') {
      return { ok: false, message: err.message || `Could not find a product matching "${identifier}".`, code: err.code };
    }
    return { ok: false, message: err.message, code: err.code };
  }
  return { ok: false, message: `Unexpected error while looking up product "${identifier}".` };
}
