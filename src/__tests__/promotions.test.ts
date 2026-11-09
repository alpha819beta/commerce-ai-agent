import request from 'supertest';
import app from './app';
import { clearTestData } from './setup';

describe('Promotions API', () => {
  beforeEach(() => {
    clearTestData();
  });

  const futureDate = () => {
    const date = new Date();
    date.setMonth(date.getMonth() + 1);
    return date.toISOString();
  };

  const pastDate = () => {
    const date = new Date();
    date.setMonth(date.getMonth() - 1);
    return date.toISOString();
  };

  // Helper to create a basic promotion
  const createPromotion = async (overrides: any = {}) => {
    const promotionData = {
      name: 'Test Promotion',
      type: 'percentage',
      value: 10,
      startDate: new Date().toISOString(),
      codes: [{ code: 'TESTCODE' }],
      ...overrides,
    };

    return request(app).post('/api/promotions').send(promotionData);
  };

  // ============================================================================
  // PROMOTION CRUD TESTS
  // ============================================================================

  describe('POST /api/promotions', () => {
    it('should create a new promotion', async () => {
      const response = await createPromotion();

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Test Promotion');
      expect(response.body.data.type).toBe('percentage');
      expect(response.body.data.value).toBe(10);
      expect(response.body.data.codes).toHaveLength(1);
      expect(response.body.data.codes[0].code).toBe('TESTCODE');
    });

    it('should create a fixed amount promotion', async () => {
      const response = await createPromotion({
        name: 'Fixed Discount',
        type: 'fixed_amount',
        value: 25,
        codes: [{ code: 'FIXED25' }],
      });

      expect(response.body.data.type).toBe('fixed_amount');
      expect(response.body.data.value).toBe(25);
    });

    it('should create a free shipping promotion', async () => {
      const response = await createPromotion({
        name: 'Free Shipping',
        type: 'free_shipping',
        value: 0,
        codes: [{ code: 'FREESHIP' }],
      });

      expect(response.body.data.type).toBe('free_shipping');
    });

    it('should validate percentage value', async () => {
      const response = await createPromotion({
        type: 'percentage',
        value: 150, // Invalid: over 100%
      });

      expect(response.status).toBe(400);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should set status to scheduled for future start date', async () => {
      const response = await createPromotion({
        status: 'active',
        startDate: futureDate(),
      });

      expect(response.body.data.status).toBe('scheduled');
    });

    it('should prevent duplicate codes', async () => {
      await createPromotion({ codes: [{ code: 'UNIQUE123' }] });

      const response = await createPromotion({
        name: 'Second Promo',
        codes: [{ code: 'UNIQUE123' }],
      });

      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('DUPLICATE_CODE');
    });

    it('should validate code format', async () => {
      const response = await createPromotion({
        codes: [{ code: 'ab' }], // Too short
      });

      expect(response.status).toBe(400);
    });

    it('should create promotion with conditions', async () => {
      const response = await createPromotion({
        minimumPurchaseAmount: 50,
        maximumDiscountAmount: 100,
        usageLimit: 500,
        usageLimitPerCustomer: 1,
        conditions: [
          { type: 'minimum_purchase_amount', value: 50 },
        ],
      });

      expect(response.body.data.minimumPurchaseAmount).toBe(50);
      expect(response.body.data.maximumDiscountAmount).toBe(100);
      expect(response.body.data.conditions).toHaveLength(1);
    });
  });

  describe('GET /api/promotions', () => {
    beforeEach(async () => {
      await createPromotion({ name: 'Promo A', status: 'active', codes: [{ code: 'PROMOA' }] });
      await createPromotion({ name: 'Promo B', status: 'draft', type: 'fixed_amount', value: 20, codes: [{ code: 'PROMOB' }] });
      await createPromotion({ name: 'Promo C', status: 'active', codes: [{ code: 'PROMOC' }] });
    });

    it('should list all promotions', async () => {
      const response = await request(app)
        .get('/api/promotions')
        .expect(200);

      expect(response.body.data.data).toHaveLength(3);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/promotions?status=active')
        .expect(200);

      expect(response.body.data.data).toHaveLength(2);
    });

    it('should filter by type', async () => {
      const response = await request(app)
        .get('/api/promotions?type=fixed_amount')
        .expect(200);

      expect(response.body.data.data).toHaveLength(1);
    });

    it('should search by name', async () => {
      const response = await request(app)
        .get('/api/promotions?search=Promo A')
        .expect(200);

      expect(response.body.data.data).toHaveLength(1);
    });

    it('should filter by code', async () => {
      const response = await request(app)
        .get('/api/promotions?code=PROMOB')
        .expect(200);

      expect(response.body.data.data).toHaveLength(1);
      expect(response.body.data.data[0].name).toBe('Promo B');
    });
  });

  describe('GET /api/promotions/stats', () => {
    it('should return promotion statistics', async () => {
      await createPromotion({ name: 'Active 1', status: 'active', codes: [{ code: 'ACT1' }] });
      await createPromotion({ name: 'Active 2', status: 'active', type: 'fixed_amount', value: 10, codes: [{ code: 'ACT2' }] });
      await createPromotion({ name: 'Draft', status: 'draft', codes: [{ code: 'DRAFT1' }] });

      const response = await request(app)
        .get('/api/promotions/stats')
        .expect(200);

      expect(response.body.data.totalPromotions).toBe(3);
      expect(response.body.data.promotionsByStatus.active).toBe(2);
      expect(response.body.data.promotionsByStatus.draft).toBe(1);
      expect(response.body.data.promotionsByType.percentage).toBe(2);
      expect(response.body.data.promotionsByType.fixed_amount).toBe(1);
    });
  });

  describe('GET /api/promotions/:id', () => {
    it('should get a promotion by ID', async () => {
      const createRes = await createPromotion();
      const promoId = createRes.body.data.id;

      const response = await request(app)
        .get(`/api/promotions/${promoId}`)
        .expect(200);

      expect(response.body.data.id).toBe(promoId);
      expect(response.body.data.isActive).toBeDefined();
      expect(response.body.data.usageStats).toBeDefined();
    });

    it('should return 404 for non-existent promotion', async () => {
      const response = await request(app)
        .get('/api/promotions/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(response.body.error.code).toBe('PROMOTION_NOT_FOUND');
    });
  });

  describe('PUT /api/promotions/:id', () => {
    it('should update a promotion', async () => {
      const createRes = await createPromotion();
      const promoId = createRes.body.data.id;

      const response = await request(app)
        .put(`/api/promotions/${promoId}`)
        .send({
          name: 'Updated Name',
          value: 15,
          minimumPurchaseAmount: 100,
        })
        .expect(200);

      expect(response.body.data.name).toBe('Updated Name');
      expect(response.body.data.value).toBe(15);
      expect(response.body.data.minimumPurchaseAmount).toBe(100);
    });
  });

  describe('DELETE /api/promotions/:id', () => {
    it('should delete a promotion', async () => {
      const createRes = await createPromotion();
      const promoId = createRes.body.data.id;

      const response = await request(app)
        .delete(`/api/promotions/${promoId}`)
        .expect(200);

      expect(response.body.data.deleted).toBe(true);

      await request(app)
        .get(`/api/promotions/${promoId}`)
        .expect(404);
    });
  });

  // ============================================================================
  // PROMOTION STATUS TESTS
  // ============================================================================

  describe('Promotion Status Changes', () => {
    it('should activate a promotion', async () => {
      const createRes = await createPromotion({ status: 'draft' });
      const promoId = createRes.body.data.id;

      const response = await request(app)
        .post(`/api/promotions/${promoId}/activate`)
        .expect(200);

      expect(response.body.data.status).toBe('active');
    });

    it('should deactivate a promotion', async () => {
      const createRes = await createPromotion({ status: 'active' });
      const promoId = createRes.body.data.id;

      const response = await request(app)
        .post(`/api/promotions/${promoId}/deactivate`)
        .expect(200);

      expect(response.body.data.status).toBe('paused');
    });

    it('should archive a promotion', async () => {
      const createRes = await createPromotion();
      const promoId = createRes.body.data.id;

      const response = await request(app)
        .post(`/api/promotions/${promoId}/archive`)
        .expect(200);

      expect(response.body.data.status).toBe('archived');
    });
  });

  // ============================================================================
  // DISCOUNT CODE TESTS
  // ============================================================================

  describe('Discount Codes', () => {
    let promoId: string;

    beforeEach(async () => {
      const createRes = await createPromotion({ codes: [{ code: 'INITIAL' }] });
      promoId = createRes.body.data.id;
    });

    it('should list promotion codes', async () => {
      const response = await request(app)
        .get(`/api/promotions/${promoId}/codes`)
        .expect(200);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].code).toBe('INITIAL');
    });

    it('should add a code to a promotion', async () => {
      const response = await request(app)
        .post(`/api/promotions/${promoId}/codes`)
        .send({ code: 'NEWCODE', usageLimit: 100 })
        .expect(201);

      expect(response.body.data.code).toBe('NEWCODE');
      expect(response.body.data.usageLimit).toBe(100);
    });

    it('should update a code', async () => {
      const codesRes = await request(app).get(`/api/promotions/${promoId}/codes`);
      const codeId = codesRes.body.data[0].id;

      const response = await request(app)
        .put(`/api/promotions/${promoId}/codes/${codeId}`)
        .send({ usageLimit: 500, isActive: false })
        .expect(200);

      expect(response.body.data.usageLimit).toBe(500);
      expect(response.body.data.isActive).toBe(false);
    });

    it('should delete a code', async () => {
      // Add another code first
      const addRes = await request(app)
        .post(`/api/promotions/${promoId}/codes`)
        .send({ code: 'TODELETE' });

      const response = await request(app)
        .delete(`/api/promotions/${promoId}/codes/${addRes.body.data.id}`)
        .expect(200);

      expect(response.body.data.deleted).toBe(true);
    });

    it('should bulk create codes', async () => {
      const response = await request(app)
        .post(`/api/promotions/${promoId}/codes/bulk`)
        .send({
          count: 5,
          prefix: 'BULK',
          length: 10,
        })
        .expect(201);

      expect(response.body.data.created).toBe(5);
      expect(response.body.data.codes).toHaveLength(5);
      expect(response.body.data.codes[0].code).toMatch(/^BULK/);
    });

    it('should validate bulk count limits', async () => {
      const response = await request(app)
        .post(`/api/promotions/${promoId}/codes/bulk`)
        .send({ count: 5000 }) // Over limit
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  // ============================================================================
  // CODE VALIDATION TESTS
  // ============================================================================

  describe('POST /api/promotions/validate-code', () => {
    it('should validate a valid code', async () => {
      await createPromotion({
        status: 'active',
        codes: [{ code: 'VALID10' }],
      });

      const response = await request(app)
        .post('/api/promotions/validate-code')
        .send({ code: 'VALID10', subtotal: 100 })
        .expect(200);

      expect(response.body.data.valid).toBe(true);
      expect(response.body.data.discountAmount).toBe(10); // 10% of 100
    });

    it('should reject invalid code', async () => {
      const response = await request(app)
        .post('/api/promotions/validate-code')
        .send({ code: 'INVALID' })
        .expect(404);

      expect(response.body.error.code).toBe('CODE_NOT_FOUND');
    });

    it('should reject expired promotion', async () => {
      await createPromotion({
        status: 'active',
        startDate: pastDate(),
        endDate: pastDate(),
        codes: [{ code: 'EXPIRED' }],
      });

      const response = await request(app)
        .post('/api/promotions/validate-code')
        .send({ code: 'EXPIRED' })
        .expect(400);

      expect(response.body.error.code).toBe('PROMOTION_EXPIRED');
    });

    it('should reject inactive promotion', async () => {
      await createPromotion({
        status: 'paused',
        codes: [{ code: 'PAUSED' }],
      });

      const response = await request(app)
        .post('/api/promotions/validate-code')
        .send({ code: 'PAUSED' })
        .expect(400);

      expect(response.body.error.code).toBe('PROMOTION_NOT_ACTIVE');
    });

    it('should check minimum purchase amount', async () => {
      await createPromotion({
        status: 'active',
        minimumPurchaseAmount: 100,
        codes: [{ code: 'MIN100' }],
      });

      const response = await request(app)
        .post('/api/promotions/validate-code')
        .send({ code: 'MIN100', subtotal: 50 })
        .expect(400);

      expect(response.body.error.code).toBe('MINIMUM_NOT_MET');
    });

    it('should check usage limit', async () => {
      const createRes = await createPromotion({
        status: 'active',
        usageLimit: 1,
        codes: [{ code: 'LIMITED' }],
      });

      // Manually set usage count
      await request(app)
        .put(`/api/promotions/${createRes.body.data.id}`)
        .send({});

      // Apply the code once
      await request(app)
        .post('/api/promotions/apply-code')
        .send({ code: 'LIMITED', orderId: 'order-1' });

      const response = await request(app)
        .post('/api/promotions/validate-code')
        .send({ code: 'LIMITED' })
        .expect(400);

      expect(response.body.error.code).toBe('USAGE_LIMIT_REACHED');
    });

    it('should apply maximum discount cap', async () => {
      await createPromotion({
        status: 'active',
        type: 'percentage',
        value: 50,
        maximumDiscountAmount: 25,
        codes: [{ code: 'CAPPED' }],
      });

      const response = await request(app)
        .post('/api/promotions/validate-code')
        .send({ code: 'CAPPED', subtotal: 100 })
        .expect(200);

      expect(response.body.data.discountAmount).toBe(25); // Capped at max
    });
  });

  // ============================================================================
  // CODE APPLICATION TESTS
  // ============================================================================

  describe('POST /api/promotions/apply-code', () => {
    it('should apply a code and record usage', async () => {
      const createRes = await createPromotion({
        status: 'active',
        codes: [{ code: 'APPLY10' }],
      });

      const response = await request(app)
        .post('/api/promotions/apply-code')
        .send({
          code: 'APPLY10',
          orderId: 'order-123',
          subtotal: 100,
        })
        .expect(200);

      expect(response.body.data.applied).toBe(true);
      expect(response.body.data.discountAmount).toBe(10);
      expect(response.body.data.usage).toBeDefined();

      // Check usage count incremented
      const promoRes = await request(app).get(`/api/promotions/${createRes.body.data.id}`);
      expect(promoRes.body.data.usageCount).toBe(1);
    });

    it('should increment code-specific usage count', async () => {
      const createRes = await createPromotion({
        status: 'active',
        codes: [{ code: 'TRACKCODE' }],
      });

      await request(app)
        .post('/api/promotions/apply-code')
        .send({ code: 'TRACKCODE', orderId: 'order-1', subtotal: 50 });

      await request(app)
        .post('/api/promotions/apply-code')
        .send({ code: 'TRACKCODE', orderId: 'order-2', subtotal: 50 });

      const codesRes = await request(app).get(`/api/promotions/${createRes.body.data.id}/codes`);
      expect(codesRes.body.data[0].usageCount).toBe(2);
    });
  });

  // ============================================================================
  // AUTOMATIC DISCOUNT TESTS
  // ============================================================================

  describe('Automatic Discounts', () => {
    it('should create an automatic discount', async () => {
      const response = await request(app)
        .post('/api/promotions/automatic')
        .send({
          name: 'Auto 10% Off',
          type: 'percentage',
          value: 10,
          startDate: new Date().toISOString(),
          minimumPurchaseAmount: 50,
        })
        .expect(201);

      expect(response.body.data.name).toBe('Auto 10% Off');
      expect(response.body.data.type).toBe('percentage');
    });

    it('should list automatic discounts', async () => {
      await request(app)
        .post('/api/promotions/automatic')
        .send({ name: 'Auto 1', type: 'percentage', value: 5, startDate: new Date().toISOString() });

      await request(app)
        .post('/api/promotions/automatic')
        .send({ name: 'Auto 2', type: 'fixed_amount', value: 10, startDate: new Date().toISOString() });

      const response = await request(app)
        .get('/api/promotions/automatic/list')
        .expect(200);

      expect(response.body.data.data).toHaveLength(2);
    });

    it('should get an automatic discount by ID', async () => {
      const createRes = await request(app)
        .post('/api/promotions/automatic')
        .send({ name: 'Test Auto', type: 'percentage', value: 5, startDate: new Date().toISOString() });

      const response = await request(app)
        .get(`/api/promotions/automatic/${createRes.body.data.id}`)
        .expect(200);

      expect(response.body.data.name).toBe('Test Auto');
      expect(response.body.data.isActive).toBeDefined();
    });

    it('should update an automatic discount', async () => {
      const createRes = await request(app)
        .post('/api/promotions/automatic')
        .send({ name: 'Original', type: 'percentage', value: 5, startDate: new Date().toISOString() });

      const response = await request(app)
        .put(`/api/promotions/automatic/${createRes.body.data.id}`)
        .send({ name: 'Updated', value: 15 })
        .expect(200);

      expect(response.body.data.name).toBe('Updated');
      expect(response.body.data.value).toBe(15);
    });

    it('should delete an automatic discount', async () => {
      const createRes = await request(app)
        .post('/api/promotions/automatic')
        .send({ name: 'To Delete', type: 'percentage', value: 5, startDate: new Date().toISOString() });

      const response = await request(app)
        .delete(`/api/promotions/automatic/${createRes.body.data.id}`)
        .expect(200);

      expect(response.body.data.deleted).toBe(true);
    });
  });

  describe('POST /api/promotions/automatic/calculate', () => {
    beforeEach(async () => {
      // Create some automatic discounts
      await request(app)
        .post('/api/promotions/automatic')
        .send({
          name: '5% Off Over $50',
          type: 'percentage',
          value: 5,
          startDate: new Date().toISOString(),
          minimumPurchaseAmount: 50,
          priority: 5,
          stackable: true,
        });

      await request(app)
        .post('/api/promotions/automatic')
        .send({
          name: '10% Off Over $100',
          type: 'percentage',
          value: 10,
          startDate: new Date().toISOString(),
          minimumPurchaseAmount: 100,
          priority: 10,
          stackable: false,
        });
    });

    it('should calculate applicable discounts', async () => {
      const response = await request(app)
        .post('/api/promotions/automatic/calculate')
        .send({ subtotal: 150 })
        .expect(200);

      expect(response.body.data.applicableDiscounts.length).toBeGreaterThan(0);
      expect(response.body.data.totalDiscount).toBeGreaterThan(0);
      expect(response.body.data.finalSubtotal).toBeLessThan(150);
    });

    it('should not apply discounts below minimum', async () => {
      const response = await request(app)
        .post('/api/promotions/automatic/calculate')
        .send({ subtotal: 30 })
        .expect(200);

      expect(response.body.data.applicableDiscounts).toHaveLength(0);
      expect(response.body.data.totalDiscount).toBe(0);
    });

    it('should prioritize higher priority discounts', async () => {
      const response = await request(app)
        .post('/api/promotions/automatic/calculate')
        .send({ subtotal: 150 })
        .expect(200);

      // The 10% discount has higher priority and is non-stackable
      // So only it should be applied
      const appliedNames = response.body.data.applicableDiscounts.map((d: any) => d.name);
      expect(appliedNames).toContain('10% Off Over $100');
    });
  });

  // ============================================================================
  // PROMOTION USAGE TESTS
  // ============================================================================

  describe('GET /api/promotions/usage/list', () => {
    it('should list promotion usage', async () => {
      const createRes = await createPromotion({
        status: 'active',
        codes: [{ code: 'TRACKED' }],
      });

      // Apply code multiple times
      await request(app)
        .post('/api/promotions/apply-code')
        .send({ code: 'TRACKED', orderId: 'order-1', subtotal: 100 });

      await request(app)
        .post('/api/promotions/apply-code')
        .send({ code: 'TRACKED', orderId: 'order-2', subtotal: 200 });

      const response = await request(app)
        .get('/api/promotions/usage/list')
        .expect(200);

      expect(response.body.data.data).toHaveLength(2);
    });

    it('should filter usage by promotion', async () => {
      const promo1 = await createPromotion({ status: 'active', codes: [{ code: 'PROMO1' }] });
      await createPromotion({ status: 'active', codes: [{ code: 'PROMO2' }] });

      await request(app)
        .post('/api/promotions/apply-code')
        .send({ code: 'PROMO1', orderId: 'order-1', subtotal: 100 });

      await request(app)
        .post('/api/promotions/apply-code')
        .send({ code: 'PROMO2', orderId: 'order-2', subtotal: 100 });

      const response = await request(app)
        .get(`/api/promotions/usage/list?promotionId=${promo1.body.data.id}`)
        .expect(200);

      expect(response.body.data.data).toHaveLength(1);
    });

    it('should filter usage by order', async () => {
      await createPromotion({ status: 'active', codes: [{ code: 'ORDERTEST' }] });

      await request(app)
        .post('/api/promotions/apply-code')
        .send({ code: 'ORDERTEST', orderId: 'specific-order', subtotal: 100 });

      await request(app)
        .post('/api/promotions/apply-code')
        .send({ code: 'ORDERTEST', orderId: 'other-order', subtotal: 100 });

      const response = await request(app)
        .get('/api/promotions/usage/list?orderId=specific-order')
        .expect(200);

      expect(response.body.data.data).toHaveLength(1);
      expect(response.body.data.data[0].orderId).toBe('specific-order');
    });
  });
});
