import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import productsRouter from './routes/products';
import ordersRouter from './routes/orders';
import promotionsRouter from './routes/promotions';
import { ApiError, sendError } from './utils/errors';
import { enableDynamicMode } from './utils/storage';

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Serve static files from public directory
app.use('/', express.static(path.join(__dirname, '../public')));

// Serve images from public/images directory
app.use('/images', express.static(path.join(__dirname, '../public/images')));

// Request logging middleware
app.use((req: Request, res: Response, next: NextFunction) => {
  const start = Date.now();
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(
      `[${new Date().toISOString()}] ${req.method} ${req.originalUrl} ${res.statusCode} ${duration}ms`
    );
  });
  next();
});

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
  res.json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
  });
});

// API documentation endpoint
app.get('/api', (req: Request, res: Response) => {
  res.json({
    name: 'Mock E-Commerce Platform API',
    version: '1.0.0',
    description: 'Enterprise-grade mock API for e-commerce store management',
    endpoints: {
      products: {
        base: '/api/products',
        endpoints: [
          { method: 'GET', path: '/', description: 'List all products with filtering and pagination' },
          { method: 'GET', path: '/:id', description: 'Get a single product by ID' },
          { method: 'POST', path: '/', description: 'Create a new product' },
          { method: 'PUT', path: '/:id', description: 'Update a product' },
          { method: 'DELETE', path: '/:id', description: 'Delete a product' },
          { method: 'GET', path: '/:id/variants', description: 'List product variants' },
          { method: 'POST', path: '/:id/variants', description: 'Add a variant to a product' },
          { method: 'PUT', path: '/:id/variants/:variantId', description: 'Update a variant' },
          { method: 'DELETE', path: '/:id/variants/:variantId', description: 'Delete a variant' },
          { method: 'GET', path: '/categories/list', description: 'List all categories' },
          { method: 'GET', path: '/categories/:id', description: 'Get a category by ID' },
          { method: 'POST', path: '/categories', description: 'Create a new category' },
          { method: 'PUT', path: '/categories/:id', description: 'Update a category' },
          { method: 'DELETE', path: '/categories/:id', description: 'Delete a category' },
          { method: 'GET', path: '/inventory/locations', description: 'List inventory locations' },
          { method: 'GET', path: '/inventory/locations/:id', description: 'Get a location by ID' },
          { method: 'POST', path: '/inventory/locations', description: 'Create a new location' },
          { method: 'PUT', path: '/inventory/locations/:id', description: 'Update a location' },
          { method: 'DELETE', path: '/inventory/locations/:id', description: 'Delete a location' },
          { method: 'GET', path: '/inventory/levels', description: 'Get inventory levels' },
          { method: 'GET', path: '/inventory/levels/:variantId', description: 'Get levels for a variant' },
          { method: 'PUT', path: '/inventory/levels/:variantId/:locationId', description: 'Update inventory settings' },
          { method: 'POST', path: '/inventory/adjust', description: 'Adjust inventory quantity' },
          { method: 'POST', path: '/inventory/set', description: 'Set inventory to specific quantity' },
          { method: 'GET', path: '/inventory/adjustments', description: 'Get adjustment history' },
          { method: 'GET', path: '/inventory/transfers', description: 'List inventory transfers' },
          { method: 'GET', path: '/inventory/transfers/:id', description: 'Get a transfer by ID' },
          { method: 'POST', path: '/inventory/transfers', description: 'Create a new transfer' },
          { method: 'POST', path: '/inventory/transfers/:id/ship', description: 'Ship a transfer' },
          { method: 'POST', path: '/inventory/transfers/:id/receive', description: 'Receive a transfer' },
          { method: 'POST', path: '/inventory/transfers/:id/cancel', description: 'Cancel a transfer' },
        ],
      },
      orders: {
        base: '/api/orders',
        endpoints: [
          { method: 'GET', path: '/', description: 'List all orders with filtering and pagination' },
          { method: 'GET', path: '/stats', description: 'Get order statistics' },
          { method: 'GET', path: '/:id', description: 'Get a single order by ID' },
          { method: 'GET', path: '/number/:orderNumber', description: 'Get an order by order number' },
          { method: 'POST', path: '/', description: 'Create a new order' },
          { method: 'PUT', path: '/:id', description: 'Update an order' },
          { method: 'POST', path: '/:id/status', description: 'Update order status' },
          { method: 'POST', path: '/:id/cancel', description: 'Cancel an order' },
          { method: 'POST', path: '/:id/items', description: 'Add a line item' },
          { method: 'PUT', path: '/:id/items/:itemId', description: 'Update a line item' },
          { method: 'DELETE', path: '/:id/items/:itemId', description: 'Remove a line item' },
          { method: 'GET', path: '/:id/shipments', description: 'Get order shipments' },
          { method: 'POST', path: '/:id/shipments', description: 'Create a shipment' },
          { method: 'PUT', path: '/:id/shipments/:shipmentId', description: 'Update a shipment' },
          { method: 'POST', path: '/:id/shipments/:shipmentId/ship', description: 'Mark shipment as shipped' },
          { method: 'POST', path: '/:id/shipments/:shipmentId/deliver', description: 'Mark shipment as delivered' },
          { method: 'GET', path: '/:id/refunds', description: 'Get order refunds' },
          { method: 'POST', path: '/:id/refunds', description: 'Create a refund' },
          { method: 'GET', path: '/:id/transactions', description: 'Get order transactions' },
          { method: 'POST', path: '/:id/transactions', description: 'Record a transaction' },
          { method: 'GET', path: '/:id/notes', description: 'Get order notes' },
          { method: 'POST', path: '/:id/notes', description: 'Add a note' },
          { method: 'DELETE', path: '/:id/notes/:noteId', description: 'Delete a note' },
          { method: 'POST', path: '/:id/tags', description: 'Add tags' },
          { method: 'DELETE', path: '/:id/tags/:tag', description: 'Remove a tag' },
        ],
      },
      promotions: {
        base: '/api/promotions',
        endpoints: [
          { method: 'GET', path: '/', description: 'List all promotions with filtering' },
          { method: 'GET', path: '/stats', description: 'Get promotion statistics' },
          { method: 'GET', path: '/:id', description: 'Get a single promotion by ID' },
          { method: 'POST', path: '/', description: 'Create a new promotion' },
          { method: 'PUT', path: '/:id', description: 'Update a promotion' },
          { method: 'DELETE', path: '/:id', description: 'Delete a promotion' },
          { method: 'POST', path: '/:id/activate', description: 'Activate a promotion' },
          { method: 'POST', path: '/:id/deactivate', description: 'Deactivate a promotion' },
          { method: 'POST', path: '/:id/archive', description: 'Archive a promotion' },
          { method: 'GET', path: '/:id/codes', description: 'Get promotion codes' },
          { method: 'POST', path: '/:id/codes', description: 'Add a discount code' },
          { method: 'PUT', path: '/:id/codes/:codeId', description: 'Update a code' },
          { method: 'DELETE', path: '/:id/codes/:codeId', description: 'Delete a code' },
          { method: 'POST', path: '/:id/codes/bulk', description: 'Bulk create codes' },
          { method: 'POST', path: '/validate-code', description: 'Validate a discount code' },
          { method: 'POST', path: '/apply-code', description: 'Apply a discount code' },
          { method: 'GET', path: '/automatic/list', description: 'List automatic discounts' },
          { method: 'GET', path: '/automatic/:id', description: 'Get an automatic discount' },
          { method: 'POST', path: '/automatic', description: 'Create an automatic discount' },
          { method: 'PUT', path: '/automatic/:id', description: 'Update an automatic discount' },
          { method: 'DELETE', path: '/automatic/:id', description: 'Delete an automatic discount' },
          { method: 'POST', path: '/automatic/calculate', description: 'Calculate applicable discounts' },
          { method: 'GET', path: '/usage/list', description: 'Get promotion usage history' },
        ],
      },
    },
    queryParameters: {
      pagination: {
        page: 'Page number (default: 1)',
        limit: 'Items per page (default: 20)',
        sortBy: 'Field to sort by',
        sortOrder: 'Sort direction: asc or desc',
      },
      filtering: {
        products: 'status, type, categoryId, vendor, brand, tags, minPrice, maxPrice, inStock, search',
        orders: 'status, paymentStatus, fulfillmentStatus, customerId, customerEmail, minTotal, maxTotal, tags, source',
        promotions: 'status, type, search, activeNow, code, startAfter, startBefore',
      },
    },
    responseFormat: {
      success: {
        success: true,
        data: '...',
        meta: { requestId: 'uuid', timestamp: 'ISO date' },
      },
      error: {
        success: false,
        error: { code: 'ERROR_CODE', message: 'Description', details: '...' },
        meta: { requestId: 'uuid', timestamp: 'ISO date' },
      },
    },
  });
});

// Storefront route - serve index.html
app.get('/', (req: Request, res: Response) => {
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Admin route - enable dynamic mode and serve admin page
app.get('/admin', (req: Request, res: Response) => {
  // Enable dynamic mode for admin operations
  enableDynamicMode();
  res.sendFile(path.join(__dirname, '../public/admin.html'));
});

// Serve admin static files
app.use('/admin', express.static(path.join(__dirname, '../public/admin')));

// Middleware to enable dynamic mode for admin API operations
// This must be before the API routes
app.use('/api', (req: Request, res: Response, next: NextFunction) => {
  // Enable dynamic mode if this is a write operation (PUT, POST, DELETE)
  // or if coming from admin page (check referer header)
  const referer = req.get('referer') || '';
  if (req.method === 'PUT' || req.method === 'POST' || req.method === 'DELETE' || referer.includes('/admin')) {
    enableDynamicMode();
  }
  next();
});

// API Routes
app.use('/api/products', productsRouter);
app.use('/api/orders', ordersRouter);
app.use('/api/promotions', promotionsRouter);

// 404 handler
app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: `Route ${req.method} ${req.originalUrl} not found`,
    },
  });
});

// Global error handler
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error('Unhandled error:', err);
  
  if (err instanceof ApiError) {
    sendError(res, err);
  } else if (err instanceof SyntaxError && 'body' in err) {
    res.status(400).json({
      success: false,
      error: {
        code: 'INVALID_JSON',
        message: 'Invalid JSON in request body',
      },
    });
  } else {
    res.status(500).json({
      success: false,
      error: {
        code: 'INTERNAL_ERROR',
        message: 'An unexpected error occurred',
      },
    });
  }
});

// Start server
app.listen(PORT, () => {
  console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🛒 Mock E-Commerce API Server                                ║
║                                                                ║
║   Storefront running on: http://localhost:${PORT}                     ║
║   API Documentation: http://localhost:${PORT}/api                 ║
║   Health Check:      http://localhost:${PORT}/health              ║
║                                                                ║
║   Available Endpoints:                                         ║
║   • Products/Inventory: /api/products                          ║
║   • Orders:             /api/orders                            ║
║   • Promotions:         /api/promotions                        ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
  `);
});

export default app;
