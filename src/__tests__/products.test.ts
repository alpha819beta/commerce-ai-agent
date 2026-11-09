import request from 'supertest';
import app from './app';
import { clearTestData } from './setup';

describe('Products API', () => {
  beforeEach(() => {
    clearTestData();
  });

  // ============================================================================
  // PRODUCT CRUD TESTS
  // ============================================================================

  describe('POST /api/products', () => {
    it('should create a new product with default variant', async () => {
      const productData = {
        name: 'Test Product',
        description: 'A test product description',
        price: 99.99,
      };

      const response = await request(app)
        .post('/api/products')
        .send(productData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe(productData.name);
      expect(response.body.data.description).toBe(productData.description);
      expect(response.body.data.status).toBe('draft');
      expect(response.body.data.variants).toHaveLength(1);
      expect(response.body.data.variants[0].price).toBe(99.99);
      expect(response.body.data.id).toBeDefined();
      expect(response.body.meta.requestId).toBeDefined();
    });

    it('should create a product with multiple variants', async () => {
      const productData = {
        name: 'Multi-Variant Product',
        description: 'Product with multiple variants',
        variants: [
          { name: 'Small', sku: 'MVT-SM', price: 29.99, options: { size: 'S' } },
          { name: 'Medium', sku: 'MVT-MD', price: 34.99, options: { size: 'M' } },
          { name: 'Large', sku: 'MVT-LG', price: 39.99, options: { size: 'L' } },
        ],
      };

      const response = await request(app)
        .post('/api/products')
        .send(productData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.variants).toHaveLength(3);
      expect(response.body.data.variants[0].isDefault).toBe(true);
      expect(response.body.data.variants[1].isDefault).toBe(false);
    });

    it('should fail when missing required fields', async () => {
      const response = await request(app)
        .post('/api/products')
        .send({ name: 'No Description' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should prevent duplicate slugs', async () => {
      const productData = {
        name: 'Test Product',
        description: 'First product',
        slug: 'test-product',
      };

      await request(app).post('/api/products').send(productData).expect(201);

      const response = await request(app)
        .post('/api/products')
        .send({ ...productData, description: 'Second product' })
        .expect(409);

      expect(response.body.error.code).toBe('DUPLICATE_SLUG');
    });

    it('should prevent duplicate SKUs', async () => {
      await request(app)
        .post('/api/products')
        .send({
          name: 'First Product',
          description: 'First',
          variants: [{ name: 'Default', sku: 'UNIQUE-SKU', price: 10 }],
        })
        .expect(201);

      const response = await request(app)
        .post('/api/products')
        .send({
          name: 'Second Product',
          description: 'Second',
          variants: [{ name: 'Default', sku: 'UNIQUE-SKU', price: 20 }],
        })
        .expect(409);

      expect(response.body.error.code).toBe('DUPLICATE_SKU');
    });
  });

  describe('GET /api/products', () => {
    beforeEach(async () => {
      // Create test products
      await request(app)
        .post('/api/products')
        .send({ name: 'Product A', description: 'Desc A', status: 'active', tags: ['electronics'] });
      await request(app)
        .post('/api/products')
        .send({ name: 'Product B', description: 'Desc B', status: 'draft', tags: ['clothing'] });
      await request(app)
        .post('/api/products')
        .send({ name: 'Product C', description: 'Desc C', status: 'active', tags: ['electronics'] });
    });

    it('should list all products with pagination', async () => {
      const response = await request(app)
        .get('/api/products')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.data).toHaveLength(3);
      expect(response.body.data.pagination).toBeDefined();
      expect(response.body.data.pagination.totalItems).toBe(3);
    });

    it('should paginate results', async () => {
      const response = await request(app)
        .get('/api/products?page=1&limit=2')
        .expect(200);

      expect(response.body.data.data).toHaveLength(2);
      expect(response.body.data.pagination.hasNextPage).toBe(true);
      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(2);
    });

    it('should filter by status', async () => {
      const response = await request(app)
        .get('/api/products?status=active')
        .expect(200);

      expect(response.body.data.data).toHaveLength(2);
      expect(response.body.data.data.every((p: any) => p.status === 'active')).toBe(true);
    });

    it('should filter by tags', async () => {
      const response = await request(app)
        .get('/api/products?tags=electronics')
        .expect(200);

      expect(response.body.data.data).toHaveLength(2);
    });

    it('should search by name', async () => {
      const response = await request(app)
        .get('/api/products?search=Product A')
        .expect(200);

      expect(response.body.data.data).toHaveLength(1);
      expect(response.body.data.data[0].name).toBe('Product A');
    });

    it('should sort results', async () => {
      const response = await request(app)
        .get('/api/products?sortBy=name&sortOrder=asc')
        .expect(200);

      const names = response.body.data.data.map((p: any) => p.name);
      expect(names).toEqual(['Product A', 'Product B', 'Product C']);
    });
  });

  describe('GET /api/products/:id', () => {
    it('should get a product by ID', async () => {
      const createRes = await request(app)
        .post('/api/products')
        .send({ name: 'Test Product', description: 'Test' });

      const productId = createRes.body.data.id;

      const response = await request(app)
        .get(`/api/products/${productId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.id).toBe(productId);
      expect(response.body.data.name).toBe('Test Product');
    });

    it('should return 404 for non-existent product', async () => {
      const response = await request(app)
        .get('/api/products/00000000-0000-0000-0000-000000000000')
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe('PRODUCT_NOT_FOUND');
    });
  });

  describe('PUT /api/products/:id', () => {
    it('should update a product', async () => {
      const createRes = await request(app)
        .post('/api/products')
        .send({ name: 'Original Name', description: 'Original Desc' });

      const productId = createRes.body.data.id;

      const response = await request(app)
        .put(`/api/products/${productId}`)
        .send({ name: 'Updated Name', status: 'active' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Updated Name');
      expect(response.body.data.status).toBe('active');
      expect(response.body.data.description).toBe('Original Desc');
    });

    it('should set publishedAt when activating', async () => {
      const createRes = await request(app)
        .post('/api/products')
        .send({ name: 'Draft Product', description: 'Draft' });

      const productId = createRes.body.data.id;
      expect(createRes.body.data.publishedAt).toBeUndefined();

      const response = await request(app)
        .put(`/api/products/${productId}`)
        .send({ status: 'active' })
        .expect(200);

      expect(response.body.data.publishedAt).toBeDefined();
    });
  });

  describe('DELETE /api/products/:id', () => {
    it('should delete a product', async () => {
      const createRes = await request(app)
        .post('/api/products')
        .send({ name: 'To Delete', description: 'Delete me' });

      const productId = createRes.body.data.id;

      const deleteRes = await request(app)
        .delete(`/api/products/${productId}`)
        .expect(200);

      expect(deleteRes.body.success).toBe(true);
      expect(deleteRes.body.data.deleted).toBe(true);

      await request(app)
        .get(`/api/products/${productId}`)
        .expect(404);
    });
  });

  // ============================================================================
  // VARIANT TESTS
  // ============================================================================

  describe('Product Variants', () => {
    let productId: string;

    beforeEach(async () => {
      const res = await request(app)
        .post('/api/products')
        .send({
          name: 'Variant Test Product',
          description: 'Test',
          variants: [
            { name: 'Default', sku: 'VTP-001', price: 19.99 },
          ],
        });
      productId = res.body.data.id;
    });

    it('should add a variant to a product', async () => {
      const response = await request(app)
        .post(`/api/products/${productId}/variants`)
        .send({ name: 'New Variant', sku: 'VTP-002', price: 24.99 })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('New Variant');
      expect(response.body.data.sku).toBe('VTP-002');
    });

    it('should update a variant', async () => {
      const productRes = await request(app).get(`/api/products/${productId}`);
      const variantId = productRes.body.data.variants[0].id;

      const response = await request(app)
        .put(`/api/products/${productId}/variants/${variantId}`)
        .send({ price: 29.99 })
        .expect(200);

      expect(response.body.data.price).toBe(29.99);
    });

    it('should not delete the last variant', async () => {
      const productRes = await request(app).get(`/api/products/${productId}`);
      const variantId = productRes.body.data.variants[0].id;

      const response = await request(app)
        .delete(`/api/products/${productId}/variants/${variantId}`)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should delete a variant when multiple exist', async () => {
      await request(app)
        .post(`/api/products/${productId}/variants`)
        .send({ name: 'Second Variant', sku: 'VTP-003', price: 24.99 });

      const productRes = await request(app).get(`/api/products/${productId}`);
      const variantId = productRes.body.data.variants[1].id;

      const response = await request(app)
        .delete(`/api/products/${productId}/variants/${variantId}`)
        .expect(200);

      expect(response.body.data.deleted).toBe(true);
    });
  });

  // ============================================================================
  // CATEGORY TESTS
  // ============================================================================

  describe('Categories', () => {
    it('should create a category', async () => {
      const response = await request(app)
        .post('/api/products/categories')
        .send({ name: 'Electronics', description: 'Electronic devices' })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Electronics');
      expect(response.body.data.slug).toBe('electronics');
      expect(response.body.data.isActive).toBe(true);
    });

    it('should create a subcategory', async () => {
      const parentRes = await request(app)
        .post('/api/products/categories')
        .send({ name: 'Electronics' });

      const response = await request(app)
        .post('/api/products/categories')
        .send({ name: 'Smartphones', parentId: parentRes.body.data.id })
        .expect(201);

      expect(response.body.data.parentId).toBe(parentRes.body.data.id);
    });

    it('should list categories', async () => {
      await request(app).post('/api/products/categories').send({ name: 'Category 1' });
      await request(app).post('/api/products/categories').send({ name: 'Category 2' });

      const response = await request(app)
        .get('/api/products/categories/list')
        .expect(200);

      expect(response.body.data.data).toHaveLength(2);
    });

    it('should update a category', async () => {
      const createRes = await request(app)
        .post('/api/products/categories')
        .send({ name: 'Old Name' });

      const response = await request(app)
        .put(`/api/products/categories/${createRes.body.data.id}`)
        .send({ name: 'New Name' })
        .expect(200);

      expect(response.body.data.name).toBe('New Name');
    });

    it('should delete a category', async () => {
      const createRes = await request(app)
        .post('/api/products/categories')
        .send({ name: 'To Delete' });

      const response = await request(app)
        .delete(`/api/products/categories/${createRes.body.data.id}`)
        .expect(200);

      expect(response.body.data.deleted).toBe(true);
    });
  });

  // ============================================================================
  // INVENTORY LOCATION TESTS
  // ============================================================================

  describe('Inventory Locations', () => {
    it('should create an inventory location', async () => {
      const response = await request(app)
        .post('/api/products/inventory/locations')
        .send({
          name: 'Main Warehouse',
          code: 'MAIN-WH',
          address: {
            address1: '123 Warehouse St',
            city: 'Test City',
            state: 'CA',
            postalCode: '90210',
            country: 'US',
          },
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.name).toBe('Main Warehouse');
      expect(response.body.data.code).toBe('MAIN-WH');
      expect(response.body.data.isDefault).toBe(true); // First location is default
    });

    it('should list inventory locations', async () => {
      await request(app)
        .post('/api/products/inventory/locations')
        .send({
          name: 'Location 1',
          code: 'LOC-1',
          address: { address1: '1 St', city: 'City', state: 'CA', postalCode: '90210', country: 'US' },
        });

      const response = await request(app)
        .get('/api/products/inventory/locations')
        .expect(200);

      expect(response.body.data).toHaveLength(1);
    });

    it('should prevent duplicate location codes', async () => {
      await request(app)
        .post('/api/products/inventory/locations')
        .send({
          name: 'Location 1',
          code: 'DUP-CODE',
          address: { address1: '1 St', city: 'City', state: 'CA', postalCode: '90210', country: 'US' },
        });

      const response = await request(app)
        .post('/api/products/inventory/locations')
        .send({
          name: 'Location 2',
          code: 'DUP-CODE',
          address: { address1: '2 St', city: 'City', state: 'CA', postalCode: '90210', country: 'US' },
        })
        .expect(409);

      expect(response.body.error.code).toBe('CONFLICT');
    });
  });

  // ============================================================================
  // INVENTORY LEVEL TESTS
  // ============================================================================

  describe('Inventory Levels', () => {
    let productId: string;
    let variantId: string;
    let locationId: string;

    beforeEach(async () => {
      // Create location first
      const locRes = await request(app)
        .post('/api/products/inventory/locations')
        .send({
          name: 'Test Warehouse',
          code: 'TEST-WH',
          address: { address1: '1 St', city: 'City', state: 'CA', postalCode: '90210', country: 'US' },
        });
      locationId = locRes.body.data.id;

      // Create product (inventory levels are auto-created)
      const prodRes = await request(app)
        .post('/api/products')
        .send({
          name: 'Inventory Test Product',
          description: 'Test',
          variants: [{ name: 'Default', sku: 'INV-001', price: 10 }],
        });
      productId = prodRes.body.data.id;
      variantId = prodRes.body.data.variants[0].id;
    });

    it('should get inventory levels for a variant', async () => {
      const response = await request(app)
        .get(`/api/products/inventory/levels/${variantId}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.levels).toHaveLength(1);
      expect(response.body.data.totals).toBeDefined();
    });

    it('should adjust inventory quantity', async () => {
      const response = await request(app)
        .post('/api/products/inventory/adjust')
        .send({
          variantId,
          locationId,
          quantity: 50,
          reason: 'received',
          notes: 'Initial stock',
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.inventoryLevel.newOnHand).toBe(50);
      expect(response.body.data.adjustment.quantity).toBe(50);
    });

    it('should set inventory to specific quantity', async () => {
      // First add some inventory
      await request(app)
        .post('/api/products/inventory/adjust')
        .send({ variantId, locationId, quantity: 100, reason: 'received' });

      // Then set to specific quantity
      const response = await request(app)
        .post('/api/products/inventory/set')
        .send({ variantId, locationId, quantity: 75 })
        .expect(200);

      expect(response.body.data.inventoryLevel.newOnHand).toBe(75);
    });

    it('should prevent negative inventory', async () => {
      const response = await request(app)
        .post('/api/products/inventory/adjust')
        .send({ variantId, locationId, quantity: -100, reason: 'sold' })
        .expect(400);

      expect(response.body.error.code).toBe('INVALID_ADJUSTMENT');
    });

    it('should track adjustment history', async () => {
      await request(app)
        .post('/api/products/inventory/adjust')
        .send({ variantId, locationId, quantity: 50, reason: 'received' });

      await request(app)
        .post('/api/products/inventory/adjust')
        .send({ variantId, locationId, quantity: -10, reason: 'sold' });

      const response = await request(app)
        .get(`/api/products/inventory/adjustments?variantId=${variantId}`)
        .expect(200);

      expect(response.body.data.data).toHaveLength(2);
    });
  });

  // ============================================================================
  // INVENTORY TRANSFER TESTS
  // ============================================================================

  describe('Inventory Transfers', () => {
    let variantId: string;
    let fromLocationId: string;
    let toLocationId: string;

    beforeEach(async () => {
      // Create two locations
      const loc1Res = await request(app)
        .post('/api/products/inventory/locations')
        .send({
          name: 'Source Warehouse',
          code: 'SRC-WH',
          address: { address1: '1 St', city: 'City', state: 'CA', postalCode: '90210', country: 'US' },
        });
      fromLocationId = loc1Res.body.data.id;

      const loc2Res = await request(app)
        .post('/api/products/inventory/locations')
        .send({
          name: 'Destination Warehouse',
          code: 'DST-WH',
          address: { address1: '2 St', city: 'City', state: 'CA', postalCode: '90210', country: 'US' },
        });
      toLocationId = loc2Res.body.data.id;

      // Create product
      const prodRes = await request(app)
        .post('/api/products')
        .send({
          name: 'Transfer Test Product',
          description: 'Test',
          variants: [{ name: 'Default', sku: 'TRF-001', price: 10 }],
        });
      variantId = prodRes.body.data.variants[0].id;

      // Add inventory to source location
      await request(app)
        .post('/api/products/inventory/adjust')
        .send({
          variantId,
          locationId: fromLocationId,
          quantity: 100,
          reason: 'received',
        });
    });

    it('should create a transfer', async () => {
      const response = await request(app)
        .post('/api/products/inventory/transfers')
        .send({
          fromLocationId,
          toLocationId,
          items: [{ variantId, quantity: 25 }],
        })
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.status).toBe('pending');
      expect(response.body.data.items).toHaveLength(1);
    });

    it('should ship a transfer and deduct from source', async () => {
      const createRes = await request(app)
        .post('/api/products/inventory/transfers')
        .send({
          fromLocationId,
          toLocationId,
          items: [{ variantId, quantity: 25 }],
        });

      const transferId = createRes.body.data.id;

      const response = await request(app)
        .post(`/api/products/inventory/transfers/${transferId}/ship`)
        .expect(200);

      expect(response.body.data.status).toBe('in_transit');

      // Check source inventory decreased
      const invRes = await request(app).get(`/api/products/inventory/levels/${variantId}`);
      const sourceLevel = invRes.body.data.levels.find((l: any) => l.locationId === fromLocationId);
      expect(sourceLevel.onHand).toBe(75);
    });

    it('should receive a transfer and add to destination', async () => {
      const createRes = await request(app)
        .post('/api/products/inventory/transfers')
        .send({
          fromLocationId,
          toLocationId,
          items: [{ variantId, quantity: 25 }],
        });

      const transferId = createRes.body.data.id;

      await request(app).post(`/api/products/inventory/transfers/${transferId}/ship`);

      const response = await request(app)
        .post(`/api/products/inventory/transfers/${transferId}/receive`)
        .expect(200);

      expect(response.body.data.status).toBe('received');

      // Check destination inventory increased
      const invRes = await request(app).get(`/api/products/inventory/levels/${variantId}`);
      const destLevel = invRes.body.data.levels.find((l: any) => l.locationId === toLocationId);
      expect(destLevel.onHand).toBe(25);
    });

    it('should cancel a pending transfer', async () => {
      const createRes = await request(app)
        .post('/api/products/inventory/transfers')
        .send({
          fromLocationId,
          toLocationId,
          items: [{ variantId, quantity: 25 }],
        });

      const response = await request(app)
        .post(`/api/products/inventory/transfers/${createRes.body.data.id}/cancel`)
        .expect(200);

      expect(response.body.data.status).toBe('cancelled');
    });

    it('should not transfer to same location', async () => {
      const response = await request(app)
        .post('/api/products/inventory/transfers')
        .send({
          fromLocationId,
          toLocationId: fromLocationId,
          items: [{ variantId, quantity: 25 }],
        })
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should not transfer more than available', async () => {
      const response = await request(app)
        .post('/api/products/inventory/transfers')
        .send({
          fromLocationId,
          toLocationId,
          items: [{ variantId, quantity: 200 }],
        })
        .expect(400);

      expect(response.body.error.code).toBe('INSUFFICIENT_INVENTORY');
    });
  });
});
