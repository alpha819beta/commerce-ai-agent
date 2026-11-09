import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Storage, paginate } from '../utils/storage';
import { ApiError, ErrorCode, sendSuccess, asyncHandler } from '../utils/errors';
import { validateRequired, parseQueryInt, parseQueryArray } from '../utils/validators';
import {
  Order,
  OrderStatus,
  PaymentStatus,
  FulfillmentStatus,
  OrderLineItem,
  OrderShipment,
  OrderRefund,
  OrderTransaction,
  OrderNote,
  OrderFilter,
  InventoryLevel,
  Product,
} from '../types';

const router = Router();

// Storage instances
const ordersStorage = new Storage<Order>('orders');
const shipmentsStorage = new Storage<OrderShipment>('shipments');
const refundsStorage = new Storage<OrderRefund>('refunds');
const transactionsStorage = new Storage<OrderTransaction>('transactions');
const notesStorage = new Storage<OrderNote>('order_notes');
const inventoryLevelsStorage = new Storage<InventoryLevel>('inventory_levels');
const productsStorage = new Storage<Product>('products');

// Counter for order numbers
let orderNumberCounter = 1000;

function generateOrderNumber(): string {
  orderNumberCounter++;
  return `ORD-${orderNumberCounter}`;
}

// Helper to calculate order totals
function calculateOrderTotals(lineItems: OrderLineItem[], discountTotal: number, shippingTotal: number) {
  const subtotal = lineItems.reduce((sum, item) => sum + item.totalPrice, 0);
  const taxTotal = lineItems.reduce((sum, item) => sum + item.tax, 0);
  const grandTotal = subtotal - discountTotal + shippingTotal + taxTotal;
  return { subtotal, taxTotal, grandTotal };
}

// ============================================================================
// ORDER ENDPOINTS
// ============================================================================

/**
 * GET /api/orders
 * List all orders with filtering, sorting, and pagination
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseQueryInt(req.query.page, 1);
    const limit = parseQueryInt(req.query.limit, 20);
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

    // Build filter
    const filter: OrderFilter = {
      status: parseQueryArray(req.query.status) as OrderStatus[] | undefined,
      paymentStatus: parseQueryArray(req.query.paymentStatus) as PaymentStatus[] | undefined,
      fulfillmentStatus: parseQueryArray(req.query.fulfillmentStatus) as FulfillmentStatus[] | undefined,
      customerId: req.query.customerId as string | undefined,
      customerEmail: req.query.customerEmail as string | undefined,
      minTotal: req.query.minTotal ? parseFloat(req.query.minTotal as string) : undefined,
      maxTotal: req.query.maxTotal ? parseFloat(req.query.maxTotal as string) : undefined,
      tags: parseQueryArray(req.query.tags),
      source: req.query.source as string | undefined,
      createdAfter: req.query.createdAfter as string | undefined,
      createdBefore: req.query.createdBefore as string | undefined,
    };

    let orders = ordersStorage.getAll();

    // Apply filters
    if (filter.status?.length) {
      orders = orders.filter((o) => filter.status!.includes(o.status));
    }
    if (filter.paymentStatus?.length) {
      orders = orders.filter((o) => filter.paymentStatus!.includes(o.paymentStatus));
    }
    if (filter.fulfillmentStatus?.length) {
      orders = orders.filter((o) => filter.fulfillmentStatus!.includes(o.fulfillmentStatus));
    }
    if (filter.customerId) {
      orders = orders.filter((o) => o.customerId === filter.customerId);
    }
    if (filter.customerEmail) {
      orders = orders.filter((o) => 
        o.customerEmail.toLowerCase().includes(filter.customerEmail!.toLowerCase())
      );
    }
    if (filter.minTotal !== undefined) {
      orders = orders.filter((o) => o.grandTotal >= filter.minTotal!);
    }
    if (filter.maxTotal !== undefined) {
      orders = orders.filter((o) => o.grandTotal <= filter.maxTotal!);
    }
    if (filter.tags?.length) {
      orders = orders.filter((o) => filter.tags!.some((t) => o.tags.includes(t)));
    }
    if (filter.source) {
      orders = orders.filter((o) => o.source === filter.source);
    }
    if (filter.createdAfter) {
      orders = orders.filter((o) => new Date(o.createdAt) >= new Date(filter.createdAfter!));
    }
    if (filter.createdBefore) {
      orders = orders.filter((o) => new Date(o.createdAt) <= new Date(filter.createdBefore!));
    }

    // Search by order number
    if (req.query.search) {
      const searchLower = (req.query.search as string).toLowerCase();
      orders = orders.filter(
        (o) =>
          o.orderNumber.toLowerCase().includes(searchLower) ||
          o.customerEmail.toLowerCase().includes(searchLower)
      );
    }

    const result = paginate(orders, { page, limit, sortBy, sortOrder });
    sendSuccess(res, result);
  })
);

/**
 * GET /api/orders/stats
 * Get order statistics
 */
router.get(
  '/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const orders = ordersStorage.getAll();

    // Date range filter
    let filteredOrders = orders;
    if (req.query.startDate) {
      filteredOrders = filteredOrders.filter(
        (o) => new Date(o.createdAt) >= new Date(req.query.startDate as string)
      );
    }
    if (req.query.endDate) {
      filteredOrders = filteredOrders.filter(
        (o) => new Date(o.createdAt) <= new Date(req.query.endDate as string)
      );
    }

    const stats = {
      totalOrders: filteredOrders.length,
      totalRevenue: filteredOrders.reduce((sum, o) => sum + o.grandTotal, 0),
      averageOrderValue: filteredOrders.length > 0 
        ? filteredOrders.reduce((sum, o) => sum + o.grandTotal, 0) / filteredOrders.length 
        : 0,
      ordersByStatus: {
        pending: filteredOrders.filter((o) => o.status === 'pending').length,
        confirmed: filteredOrders.filter((o) => o.status === 'confirmed').length,
        processing: filteredOrders.filter((o) => o.status === 'processing').length,
        shipped: filteredOrders.filter((o) => o.status === 'shipped').length,
        delivered: filteredOrders.filter((o) => o.status === 'delivered').length,
        completed: filteredOrders.filter((o) => o.status === 'completed').length,
        cancelled: filteredOrders.filter((o) => o.status === 'cancelled').length,
        refunded: filteredOrders.filter((o) => o.status === 'refunded').length,
      },
      ordersByPaymentStatus: {
        pending: filteredOrders.filter((o) => o.paymentStatus === 'pending').length,
        paid: filteredOrders.filter((o) => o.paymentStatus === 'paid').length,
        refunded: filteredOrders.filter((o) => o.paymentStatus === 'refunded').length,
        failed: filteredOrders.filter((o) => o.paymentStatus === 'failed').length,
      },
      ordersByFulfillmentStatus: {
        unfulfilled: filteredOrders.filter((o) => o.fulfillmentStatus === 'unfulfilled').length,
        partially_fulfilled: filteredOrders.filter((o) => o.fulfillmentStatus === 'partially_fulfilled').length,
        fulfilled: filteredOrders.filter((o) => o.fulfillmentStatus === 'fulfilled').length,
      },
    };

    sendSuccess(res, stats);
  })
);

/**
 * GET /api/orders/:id
 * Get a single order by ID
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    // Get related data
    const shipments = shipmentsStorage.find((s) => s.orderId === order.id);
    const refunds = refundsStorage.find((r) => r.orderId === order.id);
    const transactions = transactionsStorage.find((t) => t.orderId === order.id);
    const notes = notesStorage.find((n) => n.orderId === order.id);

    sendSuccess(res, {
      ...order,
      shipments,
      refunds,
      transactions,
      notes,
    });
  })
);

/**
 * GET /api/orders/number/:orderNumber
 * Get a single order by order number
 */
router.get(
  '/number/:orderNumber',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.findOne((o) => o.orderNumber === req.params.orderNumber);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderNumber: req.params.orderNumber });
    }

    const shipments = shipmentsStorage.find((s) => s.orderId === order.id);
    const refunds = refundsStorage.find((r) => r.orderId === order.id);
    const transactions = transactionsStorage.find((t) => t.orderId === order.id);
    const notes = notesStorage.find((n) => n.orderId === order.id);

    sendSuccess(res, {
      ...order,
      shipments,
      refunds,
      transactions,
      notes,
    });
  })
);

/**
 * POST /api/orders
 * Create a new order
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    validateRequired(req.body, ['customerEmail', 'billingAddress', 'shippingAddress', 'lineItems']);

    if (!req.body.lineItems.length) {
      throw ApiError.badRequest(ErrorCode.VALIDATION_ERROR, { message: 'At least one line item is required' });
    }

    const now = new Date().toISOString();
    const orderId = uuidv4();

    // Process line items
    const lineItems: OrderLineItem[] = req.body.lineItems.map((item: any) => {
      const lineItemId = uuidv4();
      const quantity = item.quantity || 1;
      const unitPrice = item.unitPrice || 0;
      const discount = item.discount || 0;
      const tax = item.tax || 0;
      const totalPrice = (unitPrice * quantity) - discount + tax;

      return {
        id: lineItemId,
        productId: item.productId,
        variantId: item.variantId,
        sku: item.sku || '',
        name: item.name || 'Product',
        variantName: item.variantName || 'Default',
        quantity,
        unitPrice,
        compareAtPrice: item.compareAtPrice,
        discount,
        tax,
        totalPrice,
        weight: item.weight,
        fulfillableQuantity: quantity,
        fulfilledQuantity: 0,
        refundedQuantity: 0,
        properties: item.properties,
        imageUrl: item.imageUrl,
        requiresShipping: item.requiresShipping ?? true,
        isTaxable: item.isTaxable ?? true,
      };
    });

    const discountTotal = (req.body.discounts || []).reduce(
      (sum: number, d: any) => sum + (d.appliedAmount || 0),
      0
    );
    const shippingTotal = req.body.shippingTotal || 0;
    const { subtotal, taxTotal, grandTotal } = calculateOrderTotals(lineItems, discountTotal, shippingTotal);

    const order: Order = {
      id: orderId,
      orderNumber: generateOrderNumber(),
      status: req.body.status || 'pending',
      paymentStatus: req.body.paymentStatus || 'pending',
      fulfillmentStatus: 'unfulfilled',
      customerId: req.body.customerId,
      customerEmail: req.body.customerEmail,
      customerPhone: req.body.customerPhone,
      billingAddress: req.body.billingAddress,
      shippingAddress: req.body.shippingAddress,
      lineItems,
      discounts: (req.body.discounts || []).map((d: any) => ({
        id: uuidv4(),
        code: d.code,
        type: d.type || 'fixed_amount',
        value: d.value || 0,
        appliedAmount: d.appliedAmount || 0,
        reason: d.reason,
      })),
      subtotal,
      discountTotal,
      shippingTotal,
      taxTotal,
      grandTotal,
      currency: req.body.currency || 'USD',
      shippingMethod: req.body.shippingMethod,
      shippingCarrier: req.body.shippingCarrier,
      notes: req.body.notes,
      tags: req.body.tags || [],
      source: req.body.source || 'web',
      sourceIdentifier: req.body.sourceIdentifier,
      ipAddress: req.body.ipAddress,
      userAgent: req.body.userAgent,
      createdAt: now,
      updatedAt: now,
    };

    ordersStorage.create(order);

    // Record initial transaction if payment info provided
    if (req.body.paymentStatus === 'paid' || req.body.paymentStatus === 'authorized') {
      const transaction: OrderTransaction = {
        id: uuidv4(),
        orderId: order.id,
        type: req.body.paymentStatus === 'paid' ? 'sale' : 'authorization',
        status: 'success',
        amount: grandTotal,
        currency: order.currency,
        gateway: req.body.gateway || 'manual',
        gatewayTransactionId: req.body.gatewayTransactionId,
        createdAt: now,
      };
      transactionsStorage.create(transaction);
    }

    sendSuccess(res, order, 201);
  })
);

/**
 * PUT /api/orders/:id
 * Update an order
 */
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    // Cannot update cancelled/completed orders
    if (['cancelled', 'completed'].includes(order.status)) {
      throw ApiError.badRequest(ErrorCode.INVALID_ORDER_STATUS, {
        message: `Cannot update ${order.status} orders`,
        currentStatus: order.status,
      });
    }

    const now = new Date().toISOString();

    const updates: Partial<Order> = {
      customerEmail: req.body.customerEmail ?? order.customerEmail,
      customerPhone: req.body.customerPhone ?? order.customerPhone,
      billingAddress: req.body.billingAddress ?? order.billingAddress,
      shippingAddress: req.body.shippingAddress ?? order.shippingAddress,
      shippingMethod: req.body.shippingMethod ?? order.shippingMethod,
      shippingCarrier: req.body.shippingCarrier ?? order.shippingCarrier,
      notes: req.body.notes ?? order.notes,
      tags: req.body.tags ?? order.tags,
      updatedAt: now,
    };

    // Handle shipping total change
    if (req.body.shippingTotal !== undefined && req.body.shippingTotal !== order.shippingTotal) {
      updates.shippingTotal = req.body.shippingTotal;
      const { grandTotal } = calculateOrderTotals(
        order.lineItems,
        order.discountTotal,
        req.body.shippingTotal
      );
      updates.grandTotal = grandTotal;
    }

    const updated = ordersStorage.update(order.id, updates);
    sendSuccess(res, updated);
  })
);

/**
 * POST /api/orders/:id/status
 * Update order status
 */
router.post(
  '/:id/status',
  asyncHandler(async (req: Request, res: Response) => {
    validateRequired(req.body, ['status']);

    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    const validStatuses: OrderStatus[] = [
      'pending', 'confirmed', 'processing', 'on_hold', 'shipped', 
      'partially_shipped', 'delivered', 'completed', 'cancelled', 
      'refunded', 'partially_refunded'
    ];

    if (!validStatuses.includes(req.body.status)) {
      throw ApiError.badRequest(ErrorCode.INVALID_ORDER_STATUS, {
        message: `Invalid status: ${req.body.status}`,
        validStatuses,
      });
    }

    const now = new Date().toISOString();
    const updates: Partial<Order> = {
      status: req.body.status,
      updatedAt: now,
    };

    // Handle specific status changes
    if (req.body.status === 'cancelled') {
      if (order.status === 'cancelled') {
        throw ApiError.badRequest(ErrorCode.ORDER_ALREADY_CANCELLED);
      }
      updates.cancelReason = req.body.reason;
      updates.cancelledAt = now;
    }

    if (req.body.status === 'completed') {
      updates.closedAt = now;
    }

    const updated = ordersStorage.update(order.id, updates);

    // Add a note about the status change
    const note: OrderNote = {
      id: uuidv4(),
      orderId: order.id,
      content: `Status changed from ${order.status} to ${req.body.status}${req.body.reason ? `: ${req.body.reason}` : ''}`,
      isPrivate: true,
      createdAt: now,
    };
    notesStorage.create(note);

    sendSuccess(res, updated);
  })
);

/**
 * POST /api/orders/:id/cancel
 * Cancel an order
 */
router.post(
  '/:id/cancel',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    if (order.status === 'cancelled') {
      throw ApiError.badRequest(ErrorCode.ORDER_ALREADY_CANCELLED);
    }

    if (['completed', 'refunded'].includes(order.status)) {
      throw ApiError.badRequest(ErrorCode.INVALID_ORDER_STATUS, {
        message: `Cannot cancel ${order.status} orders`,
        currentStatus: order.status,
      });
    }

    const now = new Date().toISOString();

    // Restore inventory if requested
    if (req.body.restockItems !== false) {
      for (const item of order.lineItems) {
        const level = inventoryLevelsStorage.findOne(
          (l) => l.variantId === item.variantId
        );
        if (level) {
          const newOnHand = level.onHand + (item.quantity - item.fulfilledQuantity);
          const newAvailable = Math.max(0, newOnHand - level.reserved - level.committed);
          inventoryLevelsStorage.update(level.id, {
            onHand: newOnHand,
            available: newAvailable,
            updatedAt: now,
          });
        }
      }
    }

    const updated = ordersStorage.update(order.id, {
      status: 'cancelled',
      cancelReason: req.body.reason || 'Cancelled by request',
      cancelledAt: now,
      updatedAt: now,
    });

    // Add note
    const note: OrderNote = {
      id: uuidv4(),
      orderId: order.id,
      content: `Order cancelled: ${req.body.reason || 'No reason provided'}`,
      isPrivate: true,
      createdAt: now,
    };
    notesStorage.create(note);

    sendSuccess(res, updated);
  })
);

// ============================================================================
// LINE ITEM ENDPOINTS
// ============================================================================

/**
 * POST /api/orders/:id/items
 * Add a line item to an order
 */
router.post(
  '/:id/items',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    if (['cancelled', 'completed', 'refunded'].includes(order.status)) {
      throw ApiError.badRequest(ErrorCode.INVALID_ORDER_STATUS, {
        message: `Cannot modify ${order.status} orders`,
      });
    }

    validateRequired(req.body, ['productId', 'variantId', 'name', 'quantity', 'unitPrice']);

    const now = new Date().toISOString();
    const quantity = req.body.quantity;
    const unitPrice = req.body.unitPrice;
    const discount = req.body.discount || 0;
    const tax = req.body.tax || 0;
    const totalPrice = (unitPrice * quantity) - discount + tax;

    const lineItem: OrderLineItem = {
      id: uuidv4(),
      productId: req.body.productId,
      variantId: req.body.variantId,
      sku: req.body.sku || '',
      name: req.body.name,
      variantName: req.body.variantName || 'Default',
      quantity,
      unitPrice,
      compareAtPrice: req.body.compareAtPrice,
      discount,
      tax,
      totalPrice,
      weight: req.body.weight,
      fulfillableQuantity: quantity,
      fulfilledQuantity: 0,
      refundedQuantity: 0,
      properties: req.body.properties,
      imageUrl: req.body.imageUrl,
      requiresShipping: req.body.requiresShipping ?? true,
      isTaxable: req.body.isTaxable ?? true,
    };

    const updatedLineItems = [...order.lineItems, lineItem];
    const { subtotal, taxTotal, grandTotal } = calculateOrderTotals(
      updatedLineItems,
      order.discountTotal,
      order.shippingTotal
    );

    ordersStorage.update(order.id, {
      lineItems: updatedLineItems,
      subtotal,
      taxTotal,
      grandTotal,
      updatedAt: now,
    });

    sendSuccess(res, lineItem, 201);
  })
);

/**
 * PUT /api/orders/:id/items/:itemId
 * Update a line item
 */
router.put(
  '/:id/items/:itemId',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    const itemIndex = order.lineItems.findIndex((i) => i.id === req.params.itemId);
    if (itemIndex === -1) {
      throw ApiError.notFound(ErrorCode.NOT_FOUND, { lineItemId: req.params.itemId });
    }

    if (['cancelled', 'completed', 'refunded'].includes(order.status)) {
      throw ApiError.badRequest(ErrorCode.INVALID_ORDER_STATUS, {
        message: `Cannot modify ${order.status} orders`,
      });
    }

    const now = new Date().toISOString();
    const item = order.lineItems[itemIndex];

    const quantity = req.body.quantity ?? item.quantity;
    const unitPrice = req.body.unitPrice ?? item.unitPrice;
    const discount = req.body.discount ?? item.discount;
    const tax = req.body.tax ?? item.tax;
    const totalPrice = (unitPrice * quantity) - discount + tax;

    const updatedItem: OrderLineItem = {
      ...item,
      quantity,
      unitPrice,
      discount,
      tax,
      totalPrice,
      fulfillableQuantity: quantity - item.fulfilledQuantity,
    };

    const updatedLineItems = [...order.lineItems];
    updatedLineItems[itemIndex] = updatedItem;

    const { subtotal, taxTotal, grandTotal } = calculateOrderTotals(
      updatedLineItems,
      order.discountTotal,
      order.shippingTotal
    );

    ordersStorage.update(order.id, {
      lineItems: updatedLineItems,
      subtotal,
      taxTotal,
      grandTotal,
      updatedAt: now,
    });

    sendSuccess(res, updatedItem);
  })
);

/**
 * DELETE /api/orders/:id/items/:itemId
 * Remove a line item from an order
 */
router.delete(
  '/:id/items/:itemId',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    const itemIndex = order.lineItems.findIndex((i) => i.id === req.params.itemId);
    if (itemIndex === -1) {
      throw ApiError.notFound(ErrorCode.NOT_FOUND, { lineItemId: req.params.itemId });
    }

    if (['cancelled', 'completed', 'refunded'].includes(order.status)) {
      throw ApiError.badRequest(ErrorCode.INVALID_ORDER_STATUS, {
        message: `Cannot modify ${order.status} orders`,
      });
    }

    if (order.lineItems.length <= 1) {
      throw ApiError.badRequest(ErrorCode.VALIDATION_ERROR, {
        message: 'Cannot remove the last line item. Cancel the order instead.',
      });
    }

    const now = new Date().toISOString();
    const updatedLineItems = order.lineItems.filter((i) => i.id !== req.params.itemId);

    const { subtotal, taxTotal, grandTotal } = calculateOrderTotals(
      updatedLineItems,
      order.discountTotal,
      order.shippingTotal
    );

    ordersStorage.update(order.id, {
      lineItems: updatedLineItems,
      subtotal,
      taxTotal,
      grandTotal,
      updatedAt: now,
    });

    sendSuccess(res, { deleted: true, lineItemId: req.params.itemId });
  })
);

// ============================================================================
// FULFILLMENT/SHIPMENT ENDPOINTS
// ============================================================================

/**
 * GET /api/orders/:id/shipments
 * Get all shipments for an order
 */
router.get(
  '/:id/shipments',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    const shipments = shipmentsStorage.find((s) => s.orderId === order.id);
    sendSuccess(res, shipments);
  })
);

/**
 * POST /api/orders/:id/shipments
 * Create a shipment for an order
 */
router.post(
  '/:id/shipments',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    if (order.fulfillmentStatus === 'fulfilled') {
      throw ApiError.badRequest(ErrorCode.ORDER_ALREADY_FULFILLED);
    }

    if (['cancelled', 'refunded'].includes(order.status)) {
      throw ApiError.badRequest(ErrorCode.INVALID_ORDER_STATUS, {
        message: `Cannot fulfill ${order.status} orders`,
      });
    }

    validateRequired(req.body, ['lineItems', 'shippingMethod']);

    const now = new Date().toISOString();

    // Validate and process line items
    const shipmentItems: { lineItemId: string; quantity: number }[] = [];
    for (const item of req.body.lineItems) {
      const lineItem = order.lineItems.find((li) => li.id === item.lineItemId);
      if (!lineItem) {
        throw ApiError.notFound(ErrorCode.NOT_FOUND, { lineItemId: item.lineItemId });
      }

      const maxFulfillable = lineItem.fulfillableQuantity;
      const quantity = Math.min(item.quantity || maxFulfillable, maxFulfillable);

      if (quantity <= 0) {
        throw ApiError.badRequest(ErrorCode.VALIDATION_ERROR, {
          message: `Line item ${item.lineItemId} has no fulfillable quantity`,
        });
      }

      shipmentItems.push({ lineItemId: item.lineItemId, quantity });
    }

    const shipment: OrderShipment = {
      id: uuidv4(),
      orderId: order.id,
      locationId: req.body.locationId || 'default',
      status: 'pending',
      trackingNumber: req.body.trackingNumber,
      trackingUrl: req.body.trackingUrl,
      carrier: req.body.carrier,
      carrierService: req.body.carrierService,
      shippingMethod: req.body.shippingMethod,
      lineItems: shipmentItems,
      estimatedDelivery: req.body.estimatedDelivery,
      createdAt: now,
      updatedAt: now,
    };

    shipmentsStorage.create(shipment);

    // Update line items fulfilled quantities
    const updatedLineItems = order.lineItems.map((li) => {
      const shipmentItem = shipmentItems.find((si) => si.lineItemId === li.id);
      if (shipmentItem) {
        return {
          ...li,
          fulfilledQuantity: li.fulfilledQuantity + shipmentItem.quantity,
          fulfillableQuantity: li.fulfillableQuantity - shipmentItem.quantity,
        };
      }
      return li;
    });

    // Update fulfillment status
    const allFulfilled = updatedLineItems.every((li) => li.fulfillableQuantity === 0);
    const partiallyFulfilled = updatedLineItems.some((li) => li.fulfilledQuantity > 0);

    let fulfillmentStatus: FulfillmentStatus = order.fulfillmentStatus;
    if (allFulfilled) {
      fulfillmentStatus = 'fulfilled';
    } else if (partiallyFulfilled) {
      fulfillmentStatus = 'partially_fulfilled';
    }

    ordersStorage.update(order.id, {
      lineItems: updatedLineItems,
      fulfillmentStatus,
      updatedAt: now,
    });

    sendSuccess(res, shipment, 201);
  })
);

/**
 * PUT /api/orders/:id/shipments/:shipmentId
 * Update a shipment
 */
router.put(
  '/:id/shipments/:shipmentId',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    const shipment = shipmentsStorage.getById(req.params.shipmentId);
    if (!shipment || shipment.orderId !== order.id) {
      throw ApiError.notFound(ErrorCode.SHIPMENT_NOT_FOUND, { shipmentId: req.params.shipmentId });
    }

    const now = new Date().toISOString();

    const updates: Partial<OrderShipment> = {
      trackingNumber: req.body.trackingNumber ?? shipment.trackingNumber,
      trackingUrl: req.body.trackingUrl ?? shipment.trackingUrl,
      carrier: req.body.carrier ?? shipment.carrier,
      carrierService: req.body.carrierService ?? shipment.carrierService,
      estimatedDelivery: req.body.estimatedDelivery ?? shipment.estimatedDelivery,
      updatedAt: now,
    };

    // Handle status changes
    if (req.body.status && req.body.status !== shipment.status) {
      updates.status = req.body.status;
      if (req.body.status === 'shipped') {
        updates.shippedAt = now;
      } else if (req.body.status === 'delivered') {
        updates.deliveredAt = now;
      }
    }

    const updated = shipmentsStorage.update(shipment.id, updates);

    // Update order status if all shipments delivered
    if (req.body.status === 'delivered') {
      const allShipments = shipmentsStorage.find((s) => s.orderId === order.id);
      const allDelivered = allShipments.every((s) => s.status === 'delivered');
      if (allDelivered) {
        ordersStorage.update(order.id, { status: 'delivered', updatedAt: now });
      }
    }

    sendSuccess(res, updated);
  })
);

/**
 * POST /api/orders/:id/shipments/:shipmentId/ship
 * Mark a shipment as shipped
 */
router.post(
  '/:id/shipments/:shipmentId/ship',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    const shipment = shipmentsStorage.getById(req.params.shipmentId);
    if (!shipment || shipment.orderId !== order.id) {
      throw ApiError.notFound(ErrorCode.SHIPMENT_NOT_FOUND, { shipmentId: req.params.shipmentId });
    }

    const now = new Date().toISOString();

    const updated = shipmentsStorage.update(shipment.id, {
      status: 'shipped',
      trackingNumber: req.body.trackingNumber ?? shipment.trackingNumber,
      trackingUrl: req.body.trackingUrl ?? shipment.trackingUrl,
      carrier: req.body.carrier ?? shipment.carrier,
      shippedAt: now,
      updatedAt: now,
    });

    // Update order status
    const allShipments = shipmentsStorage.find((s) => s.orderId === order.id);
    const allShipped = allShipments.every((s) => ['shipped', 'delivered'].includes(s.status));
    if (allShipped && order.status !== 'shipped') {
      ordersStorage.update(order.id, { status: 'shipped', updatedAt: now });
    }

    sendSuccess(res, updated);
  })
);

/**
 * POST /api/orders/:id/shipments/:shipmentId/deliver
 * Mark a shipment as delivered
 */
router.post(
  '/:id/shipments/:shipmentId/deliver',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    const shipment = shipmentsStorage.getById(req.params.shipmentId);
    if (!shipment || shipment.orderId !== order.id) {
      throw ApiError.notFound(ErrorCode.SHIPMENT_NOT_FOUND, { shipmentId: req.params.shipmentId });
    }

    const now = new Date().toISOString();

    const updated = shipmentsStorage.update(shipment.id, {
      status: 'delivered',
      deliveredAt: now,
      updatedAt: now,
    });

    // Update order status if all shipments delivered
    const allShipments = shipmentsStorage.find((s) => s.orderId === order.id);
    const allDelivered = allShipments.every((s) => s.status === 'delivered');
    if (allDelivered) {
      ordersStorage.update(order.id, { status: 'delivered', updatedAt: now });
    }

    sendSuccess(res, updated);
  })
);

// ============================================================================
// REFUND ENDPOINTS
// ============================================================================

/**
 * GET /api/orders/:id/refunds
 * Get all refunds for an order
 */
router.get(
  '/:id/refunds',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    const refunds = refundsStorage.find((r) => r.orderId === order.id);
    sendSuccess(res, refunds);
  })
);

/**
 * POST /api/orders/:id/refunds
 * Create a refund for an order
 */
router.post(
  '/:id/refunds',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    if (order.paymentStatus === 'pending') {
      throw ApiError.badRequest(ErrorCode.INVALID_PAYMENT_STATUS, {
        message: 'Cannot refund an unpaid order',
      });
    }

    validateRequired(req.body, ['reason']);

    const now = new Date().toISOString();

    // Calculate refund amounts
    let subtotalRefund = 0;
    let taxRefund = 0;
    const refundLineItems: OrderRefund['lineItems'] = [];

    if (req.body.lineItems && req.body.lineItems.length > 0) {
      for (const item of req.body.lineItems) {
        const lineItem = order.lineItems.find((li) => li.id === item.lineItemId);
        if (!lineItem) {
          throw ApiError.notFound(ErrorCode.NOT_FOUND, { lineItemId: item.lineItemId });
        }

        const maxRefundable = lineItem.quantity - lineItem.refundedQuantity;
        const quantity = Math.min(item.quantity || maxRefundable, maxRefundable);

        if (quantity <= 0) {
          throw ApiError.badRequest(ErrorCode.VALIDATION_ERROR, {
            message: `Line item ${item.lineItemId} has no refundable quantity`,
          });
        }

        const unitAmount = lineItem.unitPrice - (lineItem.discount / lineItem.quantity);
        const amount = item.amount ?? (unitAmount * quantity);
        const itemTax = (lineItem.tax / lineItem.quantity) * quantity;

        subtotalRefund += amount;
        taxRefund += itemTax;

        refundLineItems.push({
          lineItemId: item.lineItemId,
          quantity,
          amount,
          restockType: item.restockType || 'return',
        });
      }
    }

    const shippingRefund = req.body.shippingRefund || 0;
    const totalRefund = subtotalRefund + taxRefund + shippingRefund;

    // Calculate total already refunded
    const existingRefunds = refundsStorage.find((r) => r.orderId === order.id);
    const alreadyRefunded = existingRefunds.reduce((sum, r) => sum + r.totalRefund, 0);

    if (alreadyRefunded + totalRefund > order.grandTotal) {
      throw ApiError.badRequest(ErrorCode.REFUND_EXCEEDS_ORDER, {
        orderTotal: order.grandTotal,
        alreadyRefunded,
        requestedRefund: totalRefund,
      });
    }

    const refund: OrderRefund = {
      id: uuidv4(),
      orderId: order.id,
      reason: req.body.reason,
      note: req.body.note,
      lineItems: refundLineItems,
      shippingRefund,
      subtotalRefund,
      taxRefund,
      totalRefund,
      processedAt: now,
      createdAt: now,
    };

    refundsStorage.create(refund);

    // Update line items refunded quantities
    const updatedLineItems = order.lineItems.map((li) => {
      const refundItem = refundLineItems.find((ri) => ri.lineItemId === li.id);
      if (refundItem) {
        return {
          ...li,
          refundedQuantity: li.refundedQuantity + refundItem.quantity,
        };
      }
      return li;
    });

    // Update order payment status
    const totalRefunded = alreadyRefunded + totalRefund;
    let paymentStatus: PaymentStatus = order.paymentStatus;
    let orderStatus: OrderStatus = order.status;

    if (totalRefunded >= order.grandTotal) {
      paymentStatus = 'refunded';
      orderStatus = 'refunded';
    } else if (totalRefunded > 0) {
      paymentStatus = 'partially_refunded';
      orderStatus = 'partially_refunded';
    }

    ordersStorage.update(order.id, {
      lineItems: updatedLineItems,
      paymentStatus,
      status: orderStatus,
      updatedAt: now,
    });

    // Record refund transaction
    const transaction: OrderTransaction = {
      id: uuidv4(),
      orderId: order.id,
      type: 'refund',
      status: 'success',
      amount: totalRefund,
      currency: order.currency,
      gateway: 'manual',
      createdAt: now,
    };
    transactionsStorage.create(transaction);

    // Restore inventory if requested
    for (const item of refundLineItems) {
      if (item.restockType !== 'no_restock') {
        const lineItem = order.lineItems.find((li) => li.id === item.lineItemId);
        if (lineItem) {
          const level = inventoryLevelsStorage.findOne((l) => l.variantId === lineItem.variantId);
          if (level) {
            const newOnHand = level.onHand + item.quantity;
            const newAvailable = Math.max(0, newOnHand - level.reserved - level.committed);
            inventoryLevelsStorage.update(level.id, {
              onHand: newOnHand,
              available: newAvailable,
              updatedAt: now,
            });
          }
        }
      }
    }

    sendSuccess(res, refund, 201);
  })
);

// ============================================================================
// TRANSACTION ENDPOINTS
// ============================================================================

/**
 * GET /api/orders/:id/transactions
 * Get all transactions for an order
 */
router.get(
  '/:id/transactions',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    const transactions = transactionsStorage.find((t) => t.orderId === order.id);
    sendSuccess(res, transactions);
  })
);

/**
 * POST /api/orders/:id/transactions
 * Record a payment transaction
 */
router.post(
  '/:id/transactions',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    validateRequired(req.body, ['type', 'status', 'amount']);

    const now = new Date().toISOString();

    const transaction: OrderTransaction = {
      id: uuidv4(),
      orderId: order.id,
      type: req.body.type,
      status: req.body.status,
      amount: req.body.amount,
      currency: req.body.currency || order.currency,
      gateway: req.body.gateway || 'manual',
      gatewayTransactionId: req.body.gatewayTransactionId,
      errorCode: req.body.errorCode,
      errorMessage: req.body.errorMessage,
      createdAt: now,
    };

    transactionsStorage.create(transaction);

    // Update payment status based on transaction
    if (transaction.status === 'success') {
      let paymentStatus: PaymentStatus = order.paymentStatus;

      if (transaction.type === 'authorization') {
        paymentStatus = 'authorized';
      } else if (transaction.type === 'capture' || transaction.type === 'sale') {
        // Calculate total paid
        const allTransactions = transactionsStorage.find((t) => t.orderId === order.id);
        const totalPaid = allTransactions
          .filter((t) => ['capture', 'sale'].includes(t.type) && t.status === 'success')
          .reduce((sum, t) => sum + t.amount, 0);

        if (totalPaid >= order.grandTotal) {
          paymentStatus = 'paid';
        } else {
          paymentStatus = 'partially_paid';
        }
      } else if (transaction.type === 'void') {
        paymentStatus = 'voided';
      }

      if (paymentStatus !== order.paymentStatus) {
        ordersStorage.update(order.id, { paymentStatus, updatedAt: now });
      }
    } else if (transaction.status === 'failure' && order.paymentStatus === 'pending') {
      ordersStorage.update(order.id, { paymentStatus: 'failed', updatedAt: now });
    }

    sendSuccess(res, transaction, 201);
  })
);

// ============================================================================
// ORDER NOTES ENDPOINTS
// ============================================================================

/**
 * GET /api/orders/:id/notes
 * Get all notes for an order
 */
router.get(
  '/:id/notes',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    let notes = notesStorage.find((n) => n.orderId === order.id);

    // Filter private notes if requested
    if (req.query.includePrivate === 'false') {
      notes = notes.filter((n) => !n.isPrivate);
    }

    // Sort by creation date
    notes.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    sendSuccess(res, notes);
  })
);

/**
 * POST /api/orders/:id/notes
 * Add a note to an order
 */
router.post(
  '/:id/notes',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    validateRequired(req.body, ['content']);

    const now = new Date().toISOString();

    const note: OrderNote = {
      id: uuidv4(),
      orderId: order.id,
      content: req.body.content,
      isPrivate: req.body.isPrivate ?? true,
      createdBy: req.body.createdBy,
      createdAt: now,
    };

    notesStorage.create(note);
    sendSuccess(res, note, 201);
  })
);

/**
 * DELETE /api/orders/:id/notes/:noteId
 * Delete a note
 */
router.delete(
  '/:id/notes/:noteId',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    const note = notesStorage.getById(req.params.noteId);
    if (!note || note.orderId !== order.id) {
      throw ApiError.notFound(ErrorCode.NOT_FOUND, { noteId: req.params.noteId });
    }

    notesStorage.delete(note.id);
    sendSuccess(res, { deleted: true, noteId: note.id });
  })
);

// ============================================================================
// ORDER TAGS ENDPOINTS
// ============================================================================

/**
 * POST /api/orders/:id/tags
 * Add tags to an order
 */
router.post(
  '/:id/tags',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    validateRequired(req.body, ['tags']);

    const now = new Date().toISOString();
    const newTags = Array.isArray(req.body.tags) ? req.body.tags : [req.body.tags];
    const uniqueTags = [...new Set([...order.tags, ...newTags])];

    const updated = ordersStorage.update(order.id, {
      tags: uniqueTags,
      updatedAt: now,
    });

    sendSuccess(res, { tags: updated?.tags });
  })
);

/**
 * DELETE /api/orders/:id/tags/:tag
 * Remove a tag from an order
 */
router.delete(
  '/:id/tags/:tag',
  asyncHandler(async (req: Request, res: Response) => {
    const order = ordersStorage.getById(req.params.id);
    if (!order) {
      throw ApiError.notFound(ErrorCode.ORDER_NOT_FOUND, { orderId: req.params.id });
    }

    const now = new Date().toISOString();
    const updatedTags = order.tags.filter((t) => t !== req.params.tag);

    const updated = ordersStorage.update(order.id, {
      tags: updatedTags,
      updatedAt: now,
    });

    sendSuccess(res, { tags: updated?.tags });
  })
);

export default router;
