import { FunctionTool } from '@google/adk';
import { z } from 'zod';
import { cancelOrder, getOrderStatus, updateOrderStatus, VALID_ORDER_STATUSES } from '../tools/orders';
import { getProduct, updateProductDescription, updateProductPrice } from '../tools/products';

export const getOrderStatusTool = new FunctionTool({
  name: 'get_order_status',
  description:
    'Looks up an order by order number (e.g. "ORD-1043") or order id and reports its current status, payment status, fulfillment status, and total.',
  parameters: z.object({
    orderIdentifier: z.string().describe('The order number (e.g. "ORD-1043") or order id to look up.'),
  }),
  execute: async ({ orderIdentifier }) => getOrderStatus(orderIdentifier),
});

export const updateOrderStatusTool = new FunctionTool({
  name: 'update_order_status',
  description:
    `Changes an order's status (e.g. pending, confirmed, processing, shipped, delivered, completed). Valid statuses: ${VALID_ORDER_STATUSES.join(', ')}. Use cancel_order instead when the admin wants to cancel an order.`,
  parameters: z.object({
    orderIdentifier: z.string().describe('The order number (e.g. "ORD-1043") or order id.'),
    status: z.string().describe('The new status for the order.'),
    reason: z.string().optional().describe('Optional reason for the status change.'),
  }),
  execute: async ({ orderIdentifier, status, reason }) => updateOrderStatus(orderIdentifier, status, reason),
});

export const cancelOrderTool = new FunctionTool({
  name: 'cancel_order',
  description: 'Cancels an order and restocks its items. Use this when the admin asks to cancel an order.',
  parameters: z.object({
    orderIdentifier: z.string().describe('The order number (e.g. "ORD-1043") or order id.'),
    reason: z.string().optional().describe('Optional reason for the cancellation.'),
  }),
  execute: async ({ orderIdentifier, reason }) => cancelOrder(orderIdentifier, reason),
});

export const getProductTool = new FunctionTool({
  name: 'get_product',
  description:
    'Looks up a product by SKU (e.g. "SKU-001"), product id, or product name and reports its price and description.',
  parameters: z.object({
    productIdentifier: z.string().describe('The SKU, product id, or product name to look up.'),
  }),
  execute: async ({ productIdentifier }) => getProduct(productIdentifier),
});

export const updateProductPriceTool = new FunctionTool({
  name: 'update_product_price',
  description: 'Updates the price of a product variant. The price must be a non-negative number.',
  parameters: z.object({
    productIdentifier: z.string().describe('The SKU, product id, or product name.'),
    price: z.number().describe('The new price, e.g. 49.99.'),
  }),
  execute: async ({ productIdentifier, price }) => updateProductPrice(productIdentifier, price),
});

export const updateProductDescriptionTool = new FunctionTool({
  name: 'update_product_description',
  description: 'Updates the description of a product.',
  parameters: z.object({
    productIdentifier: z.string().describe('The SKU, product id, or product name.'),
    description: z.string().describe('The new description text.'),
  }),
  execute: async ({ productIdentifier, description }) => updateProductDescription(productIdentifier, description),
});

export const allTools = [
  getOrderStatusTool,
  updateOrderStatusTool,
  cancelOrderTool,
  getProductTool,
  updateProductPriceTool,
  updateProductDescriptionTool,
];
