import { apiClient, ApiClientError } from '../apiClient';
import { resolveOrder } from '../resolvers';
import { ToolResult } from './types';

/** Mirrors the OrderStatus union enforced by the Backend API (src/types/index.ts). */
export const VALID_ORDER_STATUSES = [
  'pending',
  'confirmed',
  'processing',
  'on_hold',
  'shipped',
  'partially_shipped',
  'delivered',
  'completed',
  'cancelled',
  'refunded',
  'partially_refunded',
] as const;

export type OrderStatus = (typeof VALID_ORDER_STATUSES)[number];

function normalizeStatus(input: string): string {
  return input.trim().toLowerCase().replace(/[\s-]+/g, '_');
}

export async function getOrderStatus(orderIdentifier: string): Promise<ToolResult> {
  try {
    const order = await resolveOrder(orderIdentifier);
    return {
      ok: true,
      message: `Order ${order.orderNumber} is currently "${order.status}" (payment: ${order.paymentStatus}, fulfillment: ${order.fulfillmentStatus}), total $${order.grandTotal.toFixed(2)}.`,
      data: { ...order },
    };
  } catch (err) {
    return toFailure(err, orderIdentifier);
  }
}

export async function updateOrderStatus(
  orderIdentifier: string,
  status: string,
  reason?: string
): Promise<ToolResult> {
  const normalized = normalizeStatus(status);
  if (!VALID_ORDER_STATUSES.includes(normalized as OrderStatus)) {
    return {
      ok: false,
      message: `"${status}" is not a valid order status. Valid statuses are: ${VALID_ORDER_STATUSES.join(', ')}.`,
      code: 'INVALID_STATUS',
    };
  }

  try {
    const order = await resolveOrder(orderIdentifier);
    await apiClient.post(`/orders/${order.id}/status`, { status: normalized, reason });
    return {
      ok: true,
      message: `Order ${order.orderNumber} status changed from "${order.status}" to "${normalized}".`,
      data: { orderId: order.id, orderNumber: order.orderNumber, status: normalized },
    };
  } catch (err) {
    return toFailure(err, orderIdentifier);
  }
}

export async function cancelOrder(orderIdentifier: string, reason?: string): Promise<ToolResult> {
  try {
    const order = await resolveOrder(orderIdentifier);
    await apiClient.post(`/orders/${order.id}/cancel`, { reason });
    return {
      ok: true,
      message: `Order ${order.orderNumber} has been cancelled${reason ? ` (reason: ${reason})` : ''}.`,
      data: { orderId: order.id, orderNumber: order.orderNumber },
    };
  } catch (err) {
    return toFailure(err, orderIdentifier);
  }
}

function toFailure(err: unknown, identifier: string): ToolResult {
  if (err instanceof ApiClientError) {
    if (err.code === 'ORDER_NOT_FOUND') {
      return { ok: false, message: `Could not find an order matching "${identifier}".`, code: err.code };
    }
    return { ok: false, message: err.message, code: err.code };
  }
  return { ok: false, message: `Unexpected error while looking up order "${identifier}".` };
}
