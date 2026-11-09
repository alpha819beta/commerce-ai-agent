import request from 'supertest';
import app from './app';
import { clearTestData } from './setup';

describe('Orders API', () => {
  beforeEach(() => {
    clearTestData();
  });

  // Helper to create a basic order
  const createOrder = async (overrides: any = {}) => {
    const orderData = {
      customerEmail: 'test@example.com',
      billingAddress: {
        firstName: 'John',
        lastName: 'Doe',
        address1: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        postalCode: '90210',
        country: 'US',
      },
      shippingAddress: {
        firstName: 'John',
        lastName: 'Doe',
        address1: '123 Main St',
        city: 'Anytown',
        state: 'CA',
        postalCode: '90210',
        country: 'US',
      },
      lineItems: [
        {
          productId: 'prod-1',
          variantId: 'var-1',
          sku: 'SKU-001',
          name: 'Test Product',
          variantName: 'Default',
          quantity: 2,
          unitPrice: 49.99,
          tax: 8.00,
        },
      ],
      ...overrides,
    };

    return request(app).post('/api/orders').send(orderData);
  };

  // ============================================================================
  // ORDER CRUD TESTS
  // ============================================================================

  describe('POST /api/orders', () => {
    it('should create a new order', async () => {
      const response = await createOrder();

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.orderNumber).toMatch(/^ORD-/);
      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.paymentStatus).toBe('pending');
      expect(response.body.data.fulfillmentStatus).toBe('unfulfilled');
      expect(response.body.data.lineItems).toHaveLength(1);
      expect(response.body.data.grandTotal).toBeGreaterThan(0);
    });

    it('should calculate order totals correctly', async () => {
      const response = await createOrder({
        lineItems: [
          { productId: 'p1', variantId: 'v1', name: 'Item 1', quantity: 2, unitPrice: 50, tax: 8 },
          { productId: 'p2', variantId: 'v2', name: 'Item 2', quantity: 1, unitPrice: 30, tax: 2.4 },
        ],
        shippingTotal: 9.99,
      });

      expect(response.body.data.subtotal).toBe(130); // (50*2) + (30*1)
      expect(response.body.data.taxTotal).toBe(10.4);
      expect(response.body.data.shippingTotal).toBe(9.99);
      expect(response.body.data.grandTotal).toBe(150.39); // 130 + 10.4 + 9.99
    });

    it('should fail when missing required fields', async () => {
      const response = await request(app)
        .post('/api/orders')
        .send({ customerEmail: 'test@example.com' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should require at least one line item', async () => {
      const response = await request(app)
        .post('/api/orders')
        .send({
          customerEmail: 'test@example.com',
          billingAddress: { firstName: 'John', lastName: 'Doe', address1: '123 St', city: 'City', state: 'CA', postalCode: '90210', country: 'US' },
          shippingAddress: { firstName: 'John', lastName: 'Doe', address1: '123 St', city: 'City', state: 'CA', postalCode: '90210', country: 'US' },
          lineItems: [],
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should create with paid status and record transaction', async () => {
      const response = await createOrder({
        paymentStatus: 'paid',
        gateway: 'stripe',
      });

      expect(response.body.data.paymentStatus).toBe('paid');

      // Check transaction was created
      const transRes = await request(app)
        .get(`/api/orders/${response.body.data.id}/transactions`);
      
      expect(transRes.body.data).toHaveLength(1);
      expect(transRes.body.data[0].type).toBe('sale');
    });
  });

  describe('GET /api/orders', () => {
    beforeEach(async () => {
      await createOrder({ customerEmail: 'a@test.com', tags: ['vip'] });
      await createOrder({ customerEmail: 'b@test.com', status: 'confirmed', paymentStatus: 'paid' });
      await createOrder({ customerEmail: 'c@test.com', source: 'mobile' });
    });

    it('should list all orders with pagination', async () => {
      const response = await request(app)
        .get('/api/orders')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data).toHaveLength(3);
      expect(response.body.data.pagination.totalItems).toBe(3);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/orders?status=pending')
        .expect(200);

      expect(response.body.data.data).toHaveLength(2);
    });

    it('should filter by payment status', async () => {
      const response = await request(app)
        .get('/api/orders?paymentStatus=paid')
        .expect(200);

      expect(response.body.data.data).toHaveLength(1);
    });

    it('should filter by customer email', async () => {
      const response = await request(app)
        .get('/api/orders?customerEmail=a@test.com')
        .expect(200);

      expect(response.body.data.data).toHaveLength(1);
    });

    it('should filter by tags', async () => {
      const response = await request(app)
        .get('/api/orders?tags=vip')
        .expect(200);

      expect(response.body.data.data).toHaveLength(1);
    });

    it('should filter by source', async () => {
      const response = await request(app)
        .get('/api/orders?source=mobile')
        .expect(200);

      expect(response.body.data.data).toHaveLength(1);
    });

    it('should search by order number', async () => {
      const orderRes = await createOrder();
      const orderNumber = orderRes.body.data.orderNumber;

      const response = await request(app)
        .get(`/api/orders?search=${orderNumber}`)
        .expect(200);

      expect(response.body.data.data).toHaveLength(1);
      expect(response.body.data.data[0].orderNumber).toBe(orderNumber);
    });
  });

  describe('GET /api/orders/stats', () => {
    beforeEach(async () => {
      await createOrder({ paymentStatus: 'paid' });
      await createOrder({ paymentStatus: 'paid', status: 'shipped' });
      await createOrder({ status: 'cancelled' });
    });

    it('should return order statistics', async () => {
      const response = await request(app)
        .get('/api/orders/stats')
        .expect(200);

      expect(response.body.data.totalOrders).toBe(3);
      expect(response.body.data.totalRevenue).toBeGreaterThan(0);
      expect(response.body.data.ordersByStatus.pending).toBe(1);
      expect(response.body.data.ordersByStatus.shipped).toBe(1);
      expect(response.body.data.ordersByStatus.cancelled).toBe(1);
    });
  });

  describe('GET /api/orders/:id', () => {
    it('should get an order by ID with related data', async () => {
      const createRes = await createOrder();
      const orderId = createRes.body.data.id;

      const response = await request(app)
        .get(`/api/orders/${orderId}`)
        .expect(200);

      expect(response.body.data.id).toBe(orderId);
      expect(response.body.data.shipments).toBeDefined();
      expect(response.body.data.refunds).toBeDefined();
      expect(response.body.data.transactions).toBeDefined();
      expect(response.body.data.notes).toBeDefined();
    });

    it('should return 404 for non-existent order', async () => {
      const response = await request(app)
        .get('/api/orders/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(response.body.error.code).toBe('ORDER_NOT_FOUND');
    });
  });

  describe('GET /api/orders/number/:orderNumber', () => {
    it('should get an order by order number', async () => {
      const createRes = await createOrder();
      const orderNumber = createRes.body.data.orderNumber;

      const response = await request(app)
        .get(`/api/orders/number/${orderNumber}`)
        .expect(200);

      expect(response.body.data.orderNumber).toBe(orderNumber);
    });
  });

  describe('PUT /api/orders/:id', () => {
    it('should update order details', async () => {
      const createRes = await createOrder();
      const orderId = createRes.body.data.id;

      const response = await request(app)
        .put(`/api/orders/${orderId}`)
        .send({
          customerPhone: '555-1234',
          notes: 'Updated notes',
          tags: ['updated'],
        })
        .expect(200);

      expect(response.body.data.customerPhone).toBe('555-1234');
      expect(response.body.data.notes).toBe('Updated notes');
      expect(response.body.data.tags).toContain('updated');
    });

    it('should not update cancelled orders', async () => {
      const createRes = await createOrder();
      const orderId = createRes.body.data.id;

      // Cancel the order
      await request(app)
        .post(`/api/orders/${orderId}/cancel`)
        .send({ reason: 'Test' });

      const response = await request(app)
        .put(`/api/orders/${orderId}`)
        .send({ notes: 'Should fail' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_ORDER_STATUS');
    });
  });

  // ============================================================================
  // ORDER STATUS TESTS
  // ============================================================================

  describe('POST /api/orders/:id/status', () => {
    it('should update order status', async () => {
      const createRes = await createOrder();
      const orderId = createRes.body.data.id;

      const response = await request(app)
        .post(`/api/orders/${orderId}/status`)
        .send({ status: 'confirmed' })
        .expect(200);

      expect(response.body.data.status).toBe('confirmed');
    });

    it('should reject invalid status', async () => {
      const createRes = await createOrder();
      const orderId = createRes.body.data.id;

      const response = await request(app)
        .post(`/api/orders/${orderId}/status`)
        .send({ status: 'invalid_status' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_ORDER_STATUS');
    });

    it('should add note when status changes', async () => {
      const createRes = await createOrder();
      const orderId = createRes.body.data.id;

      await request(app)
        .post(`/api/orders/${orderId}/status`)
        .send({ status: 'processing', reason: 'In fulfillment' });

      const notesRes = await request(app).get(`/api/orders/${orderId}/notes`);
      expect(notesRes.body.data.length).toBeGreaterThan(0);
    });
  });

  describe('POST /api/orders/:id/cancel', () => {
    it('should cancel an order', async () => {
      const createRes = await createOrder();
      const orderId = createRes.body.data.id;

      const response = await request(app)
        .post(`/api/orders/${orderId}/cancel`)
        .send({ reason: 'Customer request' })
        .expect(200);

      expect(response.body.data.status).toBe('cancelled');
      expect(response.body.data.cancelReason).toBe('Customer request');
      expect(response.body.data.cancelledAt).toBeDefined();
    });

    it('should not cancel already cancelled order', async () => {
      const createRes = await createOrder();
      const orderId = createRes.body.data.id;

      await request(app)
        .post(`/api/orders/${orderId}/cancel`)
        .send({ reason: 'First cancel' });

      const response = await request(app)
        .post(`/api/orders/${orderId}/cancel`)
        .send({ reason: 'Second cancel' })
        .expect(400);

      expect(response.body.error.code).toBe('ORDER_ALREADY_CANCELLED');
    });
  });

  // ============================================================================
  // LINE ITEM TESTS
  // ============================================================================

  describe('Order Line Items', () => {
    let orderId: string;

    beforeEach(async () => {
      const createRes = await createOrder();
      orderId = createRes.body.data.id;
    });

    it('should add a line item', async () => {
      const response = await request(app)
        .post(`/api/orders/${orderId}/items`)
        .send({
          productId: 'new-prod',
          variantId: 'new-var',
          name: 'New Product',
          quantity: 1,
          unitPrice: 29.99,
        })
        .expect(201);

      expect(response.body.data.name).toBe('New Product');

      // Verify totals updated
      const orderRes = await request(app).get(`/api/orders/${orderId}`);
      expect(orderRes.body.data.lineItems).toHaveLength(2);
    });

    it('should update a line item', async () => {
      const orderRes = await request(app).get(`/api/orders/${orderId}`);
      const itemId = orderRes.body.data.lineItems[0].id;

      const response = await request(app)
        .put(`/api/orders/${orderId}/items/${itemId}`)
        .send({ quantity: 5 })
        .expect(200);

      expect(response.body.data.quantity).toBe(5);
    });

    it('should remove a line item', async () => {
      // Add another item first
      await request(app)
        .post(`/api/orders/${orderId}/items`)
        .send({
          productId: 'extra-prod',
          variantId: 'extra-var',
          name: 'Extra Product',
          quantity: 1,
          unitPrice: 19.99,
        });

      const orderRes = await request(app).get(`/api/orders/${orderId}`);
      const itemId = orderRes.body.data.lineItems[1].id;

      const response = await request(app)
        .delete(`/api/orders/${orderId}/items/${itemId}`)
        .expect(200);

      expect(response.body.data.deleted).toBe(true);
    });

    it('should not remove the last line item', async () => {
      const orderRes = await request(app).get(`/api/orders/${orderId}`);
      const itemId = orderRes.body.data.lineItems[0].id;

      const response = await request(app)
        .delete(`/api/orders/${orderId}/items/${itemId}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ============================================================================
  // SHIPMENT TESTS
  // ============================================================================

  describe('Order Shipments', () => {
    let orderId: string;
    let lineItemId: string;

    beforeEach(async () => {
      const createRes = await createOrder({ paymentStatus: 'paid' });
      orderId = createRes.body.data.id;
      lineItemId = createRes.body.data.lineItems[0].id;
    });

    it('should create a shipment', async () => {
      const response = await request(app)
        .post(`/api/orders/${orderId}/shipments`)
        .send({
          shippingMethod: 'Ground',
          lineItems: [{ lineItemId, quantity: 2 }],
        })
        .expect(201);

      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.lineItems).toHaveLength(1);
    });

    it('should mark shipment as shipped', async () => {
      const shipmentRes = await request(app)
        .post(`/api/orders/${orderId}/shipments`)
        .send({
          shippingMethod: 'Ground',
          lineItems: [{ lineItemId, quantity: 2 }],
        });

      const shipmentId = shipmentRes.body.data.id;

      const response = await request(app)
        .post(`/api/orders/${orderId}/shipments/${shipmentId}/ship`)
        .send({ trackingNumber: 'TRK123', carrier: 'UPS' })
        .expect(200);

      expect(response.body.data.status).toBe('shipped');
      expect(response.body.data.trackingNumber).toBe('TRK123');
      expect(response.body.data.shippedAt).toBeDefined();
    });

    it('should mark shipment as delivered', async () => {
      const shipmentRes = await request(app)
        .post(`/api/orders/${orderId}/shipments`)
        .send({
          shippingMethod: 'Ground',
          lineItems: [{ lineItemId, quantity: 2 }],
        });

      const shipmentId = shipmentRes.body.data.id;

      await request(app)
        .post(`/api/orders/${orderId}/shipments/${shipmentId}/ship`);

      const response = await request(app)
        .post(`/api/orders/${orderId}/shipments/${shipmentId}/deliver`)
        .expect(200);

      expect(response.body.data.status).toBe('delivered');
      expect(response.body.data.deliveredAt).toBeDefined();
    });

    it('should update fulfillment status when fully shipped', async () => {
      await request(app)
        .post(`/api/orders/${orderId}/shipments`)
        .send({
          shippingMethod: 'Ground',
          lineItems: [{ lineItemId, quantity: 2 }],
        });

      const orderRes = await request(app).get(`/api/orders/${orderId}`);
      expect(orderRes.body.data.fulfillmentStatus).toBe('fulfilled');
    });

    it('should update to partially fulfilled', async () => {
      await request(app)
        .post(`/api/orders/${orderId}/shipments`)
        .send({
          shippingMethod: 'Ground',
          lineItems: [{ lineItemId, quantity: 1 }], // Only 1 of 2
        });

      const orderRes = await request(app).get(`/api/orders/${orderId}`);
      expect(orderRes.body.data.fulfillmentStatus).toBe('partially_fulfilled');
    });
  });

  // ============================================================================
  // REFUND TESTS
  // ============================================================================

  describe('Order Refunds', () => {
    let orderId: string;
    let lineItemId: string;

    beforeEach(async () => {
      const createRes = await createOrder({ paymentStatus: 'paid' });
      orderId = createRes.body.data.id;
      lineItemId = createRes.body.data.lineItems[0].id;
    });

    it('should create a refund', async () => {
      const response = await request(app)
        .post(`/api/orders/${orderId}/refunds`)
        .send({
          reason: 'Customer return',
          lineItems: [
            { lineItemId, quantity: 1, restockType: 'return' },
          ],
        })
        .expect(201);

      expect(response.body.data.reason).toBe('Customer return');
      expect(response.body.data.totalRefund).toBeGreaterThan(0);
    });

    it('should update payment status to partially refunded', async () => {
      await request(app)
        .post(`/api/orders/${orderId}/refunds`)
        .send({
          reason: 'Partial refund',
          lineItems: [{ lineItemId, quantity: 1 }],
        });

      const orderRes = await request(app).get(`/api/orders/${orderId}`);
      expect(orderRes.body.data.paymentStatus).toBe('partially_refunded');
    });

    it('should update payment status to fully refunded', async () => {
      await request(app)
        .post(`/api/orders/${orderId}/refunds`)
        .send({
          reason: 'Full refund',
          lineItems: [{ lineItemId, quantity: 2 }], // All items
        });

      const orderRes = await request(app).get(`/api/orders/${orderId}`);
      expect(orderRes.body.data.paymentStatus).toBe('refunded');
      expect(orderRes.body.data.status).toBe('refunded');
    });

    it('should not refund unpaid orders', async () => {
      const unpaidOrder = await createOrder(); // Default is pending payment

      const response = await request(app)
        .post(`/api/orders/${unpaidOrder.body.data.id}/refunds`)
        .send({ reason: 'Should fail' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_PAYMENT_STATUS');
    });

    it('should not refund more than order total', async () => {
      // First refund
      await request(app)
        .post(`/api/orders/${orderId}/refunds`)
        .send({
          reason: 'First refund',
          lineItems: [{ lineItemId, quantity: 2 }],
        });

      // Try to refund again
      const response = await request(app)
        .post(`/api/orders/${orderId}/refunds`)
        .send({
          reason: 'Second refund',
          lineItems: [{ lineItemId, quantity: 1 }],
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ============================================================================
  // TRANSACTION TESTS
  // ============================================================================

  describe('Order Transactions', () => {
    let orderId: string;

    beforeEach(async () => {
      const createRes = await createOrder();
      orderId = createRes.body.data.id;
    });

    it('should record a transaction', async () => {
      const response = await request(app)
        .post(`/api/orders/${orderId}/transactions`)
        .send({
          type: 'authorization',
          status: 'success',
          amount: 107.98,
          gateway: 'stripe',
        })
        .expect(201);

      expect(response.body.data.type).toBe('authorization');
      expect(response.body.data.amount).toBe(107.98);
    });

    it('should update payment status on successful capture', async () => {
      await request(app)
        .post(`/api/orders/${orderId}/transactions`)
        .send({
          type: 'sale',
          status: 'success',
          amount: 200,
        });

      const orderRes = await request(app).get(`/api/orders/${orderId}`);
      expect(orderRes.body.data.paymentStatus).toBe('paid');
    });

    it('should list order transactions', async () => {
      await request(app)
        .post(`/api/orders/${orderId}/transactions`)
        .send({ type: 'authorization', status: 'success', amount: 100 });

      await request(app)
        .post(`/api/orders/${orderId}/transactions`)
        .send({ type: 'capture', status: 'success', amount: 100 });

      const response = await request(app)
        .get(`/api/orders/${orderId}/transactions`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
    });
  });

  // ============================================================================
  // ORDER NOTES TESTS
  // ============================================================================

  describe('Order Notes', () => {
    let orderId: string;

    beforeEach(async () => {
      const createRes = await createOrder();
      orderId = createRes.body.data.id;
    });

    it('should add a note', async () => {
      const response = await request(app)
        .post(`/api/orders/${orderId}/notes`)
        .send({
          content: 'Customer called to confirm shipping address',
          isPrivate: true,
        })
        .expect(201);

      expect(response.body.data.content).toBe('Customer called to confirm shipping address');
      expect(response.body.data.isPrivate).toBe(true);
    });

    it('should list notes', async () => {
      await request(app)
        .post(`/api/orders/${orderId}/notes`)
        .send({ content: 'Note 1' });

      await request(app)
        .post(`/api/orders/${orderId}/notes`)
        .send({ content: 'Note 2', isPrivate: false });

      const response = await request(app)
        .get(`/api/orders/${orderId}/notes`)
        .expect(200);

      expect(response.body.data).toHaveLength(2);
    });

    it('should delete a note', async () => {
      const noteRes = await request(app)
        .post(`/api/orders/${orderId}/notes`)
        .send({ content: 'To delete' });

      const response = await request(app)
        .delete(`/api/orders/${orderId}/notes/${noteRes.body.data.id}`)
        .expect(200);

      expect(response.body.data.deleted).toBe(true);
    });
  });

  // ============================================================================
  // ORDER TAGS TESTS
  // ============================================================================

  describe('Order Tags', () => {
    let orderId: string;

    beforeEach(async () => {
      const createRes = await createOrder();
      orderId = createRes.body.data.id;
    });

    it('should add tags', async () => {
      const response = await request(app)
        .post(`/api/orders/${orderId}/tags`)
        .send({ tags: ['vip', 'rush'] })
        .expect(200);

      expect(response.body.data.tags).toContain('vip');
      expect(response.body.data.tags).toContain('rush');
    });

    it('should remove a tag', async () => {
      await request(app)
        .post(`/api/orders/${orderId}/tags`)
        .send({ tags: ['vip', 'rush'] });

      const response = await request(app)
        .delete(`/api/orders/${orderId}/tags/vip`)
        .expect(200);

      expect(response.body.data.tags).not.toContain('vip');
      expect(response.body.data.tags).toContain('rush');
    });

    it('should not duplicate tags', async () => {
      await request(app)
        .post(`/api/orders/${orderId}/tags`)
        .send({ tags: ['vip'] });

      await request(app)
        .post(`/api/orders/${orderId}/tags`)
        .send({ tags: ['vip', 'priority'] });

      const orderRes = await request(app).get(`/api/orders/${orderId}`);
      const vipCount = orderRes.body.data.tags.filter((t: string) => t === 'vip').length;
      expect(vipCount).toBe(1);
    });
  });
});
