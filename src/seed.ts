import { v4 as uuidv4 } from 'uuid';
import { Storage } from './utils/storage';
import {
  Product,
  ProductCategory,
  InventoryLocation,
  InventoryLevel,
  Order,
  OrderShipment,
  Promotion,
  AutomaticDiscount,
} from './types';

// Initialize storage
const productsStorage = new Storage<Product>('products');
const categoriesStorage = new Storage<ProductCategory>('categories');
const locationsStorage = new Storage<InventoryLocation>('locations');
const inventoryLevelsStorage = new Storage<InventoryLevel>('inventory_levels');
const ordersStorage = new Storage<Order>('orders');
const shipmentsStorage = new Storage<OrderShipment>('shipments');
const promotionsStorage = new Storage<Promotion>('promotions');
const automaticDiscountsStorage = new Storage<AutomaticDiscount>('automatic_discounts');

function seed() {
  console.log('🌱 Starting seed process...\n');

  // Clear existing data
  console.log('Clearing existing data...');
  productsStorage.clear();
  categoriesStorage.clear();
  locationsStorage.clear();
  inventoryLevelsStorage.clear();
  ordersStorage.clear();
  shipmentsStorage.clear();
  promotionsStorage.clear();
  automaticDiscountsStorage.clear();

  const now = new Date().toISOString();

  // ============================================================================
  // SEED CATEGORIES
  // ============================================================================
  console.log('Creating categories...');

  const categories: ProductCategory[] = [
    {
      id: uuidv4(),
      name: 'Electronics',
      slug: 'electronics',
      description: 'Electronic devices and accessories',
      position: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      name: 'Clothing',
      slug: 'clothing',
      description: 'Apparel and fashion items',
      position: 2,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      name: 'Home & Garden',
      slug: 'home-garden',
      description: 'Home decor and garden supplies',
      position: 3,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      name: 'Sports & Outdoors',
      slug: 'sports-outdoors',
      description: 'Sporting goods and outdoor equipment',
      position: 4,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      name: 'Books',
      slug: 'books',
      description: 'Books, e-books, and audiobooks',
      position: 5,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  // Add subcategories
  const electronicsId = categories[0].id;
  const clothingId = categories[1].id;

  categories.push(
    {
      id: uuidv4(),
      name: 'Smartphones',
      slug: 'smartphones',
      description: 'Mobile phones and accessories',
      parentId: electronicsId,
      position: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      name: 'Laptops',
      slug: 'laptops',
      description: 'Notebook computers',
      parentId: electronicsId,
      position: 2,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      name: "Men's Clothing",
      slug: 'mens-clothing',
      description: "Men's fashion and apparel",
      parentId: clothingId,
      position: 1,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      name: "Women's Clothing",
      slug: 'womens-clothing',
      description: "Women's fashion and apparel",
      parentId: clothingId,
      position: 2,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    }
  );

  categoriesStorage.createMany(categories);
  console.log(`  ✓ Created ${categories.length} categories`);

  // ============================================================================
  // SEED INVENTORY LOCATIONS
  // ============================================================================
  console.log('Creating inventory locations...');

  const locations: InventoryLocation[] = [
    {
      id: uuidv4(),
      name: 'Main Warehouse',
      code: 'MAIN-WH',
      address: {
        address1: '123 Warehouse Ave',
        city: 'Los Angeles',
        state: 'CA',
        postalCode: '90001',
        country: 'US',
      },
      isActive: true,
      isDefault: true,
      fulfillmentPriority: 1,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      name: 'East Coast Distribution',
      code: 'EAST-DC',
      address: {
        address1: '456 Distribution Blvd',
        city: 'Newark',
        state: 'NJ',
        postalCode: '07102',
        country: 'US',
      },
      isActive: true,
      isDefault: false,
      fulfillmentPriority: 2,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      name: 'Retail Store - Downtown',
      code: 'STORE-DT',
      address: {
        address1: '789 Main Street',
        city: 'San Francisco',
        state: 'CA',
        postalCode: '94102',
        country: 'US',
      },
      isActive: true,
      isDefault: false,
      fulfillmentPriority: 3,
      createdAt: now,
      updatedAt: now,
    },
  ];

  locationsStorage.createMany(locations);
  console.log(`  ✓ Created ${locations.length} locations`);

  // ============================================================================
  // SEED PRODUCTS
  // ============================================================================
  console.log('Creating products...');

  const products: Product[] = [
    // Electronics
    {
      id: uuidv4(),
      name: 'Premium Wireless Headphones',
      slug: 'premium-wireless-headphones',
      description: 'High-quality wireless headphones with active noise cancellation, 30-hour battery life, and premium comfort.',
      shortDescription: 'Wireless ANC headphones with 30hr battery',
      status: 'active',
      type: 'physical',
      vendor: 'AudioTech',
      brand: 'SoundMax',
      tags: ['audio', 'wireless', 'noise-cancelling', 'premium'],
      categoryIds: [electronicsId],
      images: [
        { id: uuidv4(), url: 'https://example.com/headphones-black.jpg', altText: 'Black headphones', position: 0, isPrimary: true },
        { id: uuidv4(), url: 'https://example.com/headphones-white.jpg', altText: 'White headphones', position: 1, isPrimary: false },
      ],
      variants: [
        {
          id: uuidv4(),
          productId: '',
          sku: 'HP-BLK-001',
          barcode: '123456789012',
          name: 'Black',
          price: 299.99,
          compareAtPrice: 349.99,
          costPrice: 150,
          weight: 0.5,
          weightUnit: 'lb',
          options: { color: 'Black' },
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4(),
          productId: '',
          sku: 'HP-WHT-001',
          barcode: '123456789013',
          name: 'White',
          price: 299.99,
          compareAtPrice: 349.99,
          costPrice: 150,
          weight: 0.5,
          weightUnit: 'lb',
          options: { color: 'White' },
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4(),
          productId: '',
          sku: 'HP-SLV-001',
          barcode: '123456789014',
          name: 'Silver',
          price: 319.99,
          compareAtPrice: 369.99,
          costPrice: 160,
          weight: 0.5,
          weightUnit: 'lb',
          options: { color: 'Silver' },
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
      seoTitle: 'Premium Wireless Headphones | SoundMax',
      seoDescription: 'Experience superior audio with our premium wireless headphones featuring active noise cancellation.',
      isGiftCard: false,
      requiresShipping: true,
      isTaxable: true,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    },
    {
      id: uuidv4(),
      name: 'Smart Fitness Watch',
      slug: 'smart-fitness-watch',
      description: 'Advanced fitness tracker with heart rate monitoring, GPS, sleep tracking, and 7-day battery life.',
      status: 'active',
      type: 'physical',
      vendor: 'TechWear',
      brand: 'FitPro',
      tags: ['fitness', 'smartwatch', 'health', 'gps'],
      categoryIds: [electronicsId],
      images: [
        { id: uuidv4(), url: 'https://example.com/watch-black.jpg', altText: 'Fitness watch black', position: 0, isPrimary: true },
      ],
      variants: [
        {
          id: uuidv4(),
          productId: '',
          sku: 'FW-BLK-SM',
          name: 'Black - Small',
          price: 199.99,
          compareAtPrice: 249.99,
          costPrice: 80,
          options: { color: 'Black', size: 'Small' },
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4(),
          productId: '',
          sku: 'FW-BLK-LG',
          name: 'Black - Large',
          price: 199.99,
          compareAtPrice: 249.99,
          costPrice: 80,
          options: { color: 'Black', size: 'Large' },
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4(),
          productId: '',
          sku: 'FW-BLU-SM',
          name: 'Blue - Small',
          price: 199.99,
          costPrice: 80,
          options: { color: 'Blue', size: 'Small' },
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4(),
          productId: '',
          sku: 'FW-BLU-LG',
          name: 'Blue - Large',
          price: 199.99,
          costPrice: 80,
          options: { color: 'Blue', size: 'Large' },
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
      isGiftCard: false,
      requiresShipping: true,
      isTaxable: true,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    },
    // Clothing
    {
      id: uuidv4(),
      name: 'Classic Cotton T-Shirt',
      slug: 'classic-cotton-tshirt',
      description: '100% organic cotton t-shirt with a comfortable fit. Pre-shrunk and durable.',
      status: 'active',
      type: 'physical',
      vendor: 'BasicWear',
      brand: 'EcoThreads',
      tags: ['cotton', 'basic', 'organic', 'comfortable'],
      categoryIds: [clothingId],
      images: [
        { id: uuidv4(), url: 'https://example.com/tshirt-navy.jpg', altText: 'Navy t-shirt', position: 0, isPrimary: true },
      ],
      variants: [
        {
          id: uuidv4(),
          productId: '',
          sku: 'TS-NVY-S',
          name: 'Navy - Small',
          price: 29.99,
          costPrice: 8,
          weight: 0.3,
          weightUnit: 'lb',
          options: { color: 'Navy', size: 'S' },
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4(),
          productId: '',
          sku: 'TS-NVY-M',
          name: 'Navy - Medium',
          price: 29.99,
          costPrice: 8,
          weight: 0.35,
          weightUnit: 'lb',
          options: { color: 'Navy', size: 'M' },
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4(),
          productId: '',
          sku: 'TS-NVY-L',
          name: 'Navy - Large',
          price: 29.99,
          costPrice: 8,
          weight: 0.4,
          weightUnit: 'lb',
          options: { color: 'Navy', size: 'L' },
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4(),
          productId: '',
          sku: 'TS-WHT-S',
          name: 'White - Small',
          price: 29.99,
          costPrice: 8,
          weight: 0.3,
          weightUnit: 'lb',
          options: { color: 'White', size: 'S' },
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4(),
          productId: '',
          sku: 'TS-WHT-M',
          name: 'White - Medium',
          price: 29.99,
          costPrice: 8,
          weight: 0.35,
          weightUnit: 'lb',
          options: { color: 'White', size: 'M' },
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4(),
          productId: '',
          sku: 'TS-WHT-L',
          name: 'White - Large',
          price: 29.99,
          costPrice: 8,
          weight: 0.4,
          weightUnit: 'lb',
          options: { color: 'White', size: 'L' },
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
      isGiftCard: false,
      requiresShipping: true,
      isTaxable: true,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    },
    {
      id: uuidv4(),
      name: 'Running Shoes Pro',
      slug: 'running-shoes-pro',
      description: 'Professional running shoes with advanced cushioning and breathable mesh upper.',
      status: 'active',
      type: 'physical',
      vendor: 'SportGear',
      brand: 'SpeedRun',
      tags: ['running', 'shoes', 'athletic', 'cushioned'],
      categoryIds: [categories[3].id], // Sports & Outdoors
      images: [
        { id: uuidv4(), url: 'https://example.com/shoes-gray.jpg', altText: 'Gray running shoes', position: 0, isPrimary: true },
      ],
      variants: [
        {
          id: uuidv4(),
          productId: '',
          sku: 'RS-GRY-8',
          name: 'Gray - Size 8',
          price: 149.99,
          compareAtPrice: 179.99,
          costPrice: 60,
          options: { color: 'Gray', size: '8' },
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4(),
          productId: '',
          sku: 'RS-GRY-9',
          name: 'Gray - Size 9',
          price: 149.99,
          compareAtPrice: 179.99,
          costPrice: 60,
          options: { color: 'Gray', size: '9' },
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4(),
          productId: '',
          sku: 'RS-GRY-10',
          name: 'Gray - Size 10',
          price: 149.99,
          compareAtPrice: 179.99,
          costPrice: 60,
          options: { color: 'Gray', size: '10' },
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4(),
          productId: '',
          sku: 'RS-BLU-8',
          name: 'Blue - Size 8',
          price: 149.99,
          costPrice: 60,
          options: { color: 'Blue', size: '8' },
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4(),
          productId: '',
          sku: 'RS-BLU-9',
          name: 'Blue - Size 9',
          price: 149.99,
          costPrice: 60,
          options: { color: 'Blue', size: '9' },
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4(),
          productId: '',
          sku: 'RS-BLU-10',
          name: 'Blue - Size 10',
          price: 149.99,
          costPrice: 60,
          options: { color: 'Blue', size: '10' },
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
      isGiftCard: false,
      requiresShipping: true,
      isTaxable: true,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    },
    {
      id: uuidv4(),
      name: 'Digital Gift Card',
      slug: 'digital-gift-card',
      description: 'Digital gift card that can be used for any purchase on our store.',
      status: 'active',
      type: 'digital',
      vendor: 'Internal',
      tags: ['gift-card', 'digital'],
      categoryIds: [],
      images: [
        { id: uuidv4(), url: 'https://example.com/giftcard.jpg', altText: 'Gift card', position: 0, isPrimary: true },
      ],
      variants: [
        {
          id: uuidv4(),
          productId: '',
          sku: 'GC-25',
          name: '$25 Gift Card',
          price: 25,
          options: { value: '$25' },
          isDefault: true,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4(),
          productId: '',
          sku: 'GC-50',
          name: '$50 Gift Card',
          price: 50,
          options: { value: '$50' },
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: uuidv4(),
          productId: '',
          sku: 'GC-100',
          name: '$100 Gift Card',
          price: 100,
          options: { value: '$100' },
          isDefault: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
      isGiftCard: true,
      requiresShipping: false,
      isTaxable: false,
      createdAt: now,
      updatedAt: now,
      publishedAt: now,
    },
  ];

  // Fix product IDs in variants
  for (const product of products) {
    for (const variant of product.variants) {
      variant.productId = product.id;
    }
  }

  productsStorage.createMany(products);
  console.log(`  ✓ Created ${products.length} products`);

  // ============================================================================
  // SEED INVENTORY LEVELS
  // ============================================================================
  console.log('Creating inventory levels...');

  const inventoryLevels: InventoryLevel[] = [];
  const stockQuantities = [100, 50, 25, 75, 150, 200, 10, 5, 0]; // Mix of quantities

  for (const product of products) {
    for (const variant of product.variants) {
      for (const location of locations) {
        const onHand = stockQuantities[Math.floor(Math.random() * stockQuantities.length)];
        inventoryLevels.push({
          id: uuidv4(),
          variantId: variant.id,
          locationId: location.id,
          available: onHand,
          reserved: 0,
          committed: 0,
          onHand,
          incoming: Math.random() > 0.7 ? Math.floor(Math.random() * 50) : 0,
          safetyStock: 5,
          reorderPoint: 10,
          reorderQuantity: 50,
          inventoryPolicy: 'deny',
          trackInventory: !product.isGiftCard,
          updatedAt: now,
        });
      }
    }
  }

  inventoryLevelsStorage.createMany(inventoryLevels);
  console.log(`  ✓ Created ${inventoryLevels.length} inventory levels`);

  // ============================================================================
  // SEED ORDERS
  // ============================================================================
  console.log('Creating orders...');

  const customerEmails = [
    'john.doe@example.com',
    'jane.smith@example.com',
    'bob.wilson@example.com',
    'alice.johnson@example.com',
    'charlie.brown@example.com',
  ];

  const statuses: Array<{ status: Order['status']; paymentStatus: Order['paymentStatus']; fulfillmentStatus: Order['fulfillmentStatus'] }> = [
    { status: 'pending', paymentStatus: 'pending', fulfillmentStatus: 'unfulfilled' },
    { status: 'confirmed', paymentStatus: 'paid', fulfillmentStatus: 'unfulfilled' },
    { status: 'processing', paymentStatus: 'paid', fulfillmentStatus: 'unfulfilled' },
    { status: 'shipped', paymentStatus: 'paid', fulfillmentStatus: 'fulfilled' },
    { status: 'delivered', paymentStatus: 'paid', fulfillmentStatus: 'fulfilled' },
    { status: 'completed', paymentStatus: 'paid', fulfillmentStatus: 'fulfilled' },
    { status: 'cancelled', paymentStatus: 'refunded', fulfillmentStatus: 'unfulfilled' },
  ];

  const orders: Order[] = [];
  let orderNumber = 1001;

  for (let i = 0; i < 15; i++) {
    const statusConfig = statuses[i % statuses.length];
    const customer = customerEmails[i % customerEmails.length];
    const selectedProducts = products.filter(p => !p.isGiftCard).slice(0, Math.floor(Math.random() * 3) + 1);
    
    const lineItems = selectedProducts.map((product, idx) => {
      const variant = product.variants[Math.floor(Math.random() * product.variants.length)];
      const quantity = Math.floor(Math.random() * 3) + 1;
      const unitPrice = variant.price;
      const tax = unitPrice * quantity * 0.08;
      
      return {
        id: uuidv4(),
        productId: product.id,
        variantId: variant.id,
        sku: variant.sku,
        name: product.name,
        variantName: variant.name,
        quantity,
        unitPrice,
        discount: 0,
        tax,
        totalPrice: unitPrice * quantity + tax,
        fulfillableQuantity: statusConfig.fulfillmentStatus === 'fulfilled' ? 0 : quantity,
        fulfilledQuantity: statusConfig.fulfillmentStatus === 'fulfilled' ? quantity : 0,
        refundedQuantity: 0,
        requiresShipping: product.requiresShipping,
        isTaxable: product.isTaxable,
      };
    });

    const subtotal = lineItems.reduce((sum, item) => sum + (item.unitPrice * item.quantity), 0);
    const taxTotal = lineItems.reduce((sum, item) => sum + item.tax, 0);
    const shippingTotal = 9.99;
    const grandTotal = subtotal + taxTotal + shippingTotal;

    const orderDate = new Date();
    orderDate.setDate(orderDate.getDate() - Math.floor(Math.random() * 30));

    const order: Order = {
      id: uuidv4(),
      orderNumber: `ORD-${orderNumber++}`,
      status: statusConfig.status,
      paymentStatus: statusConfig.paymentStatus,
      fulfillmentStatus: statusConfig.fulfillmentStatus,
      customerEmail: customer,
      billingAddress: {
        firstName: customer.split('@')[0].split('.')[0],
        lastName: customer.split('@')[0].split('.')[1] || 'Customer',
        address1: `${100 + i} Main St`,
        city: 'Anytown',
        state: 'CA',
        postalCode: '90210',
        country: 'US',
      },
      shippingAddress: {
        firstName: customer.split('@')[0].split('.')[0],
        lastName: customer.split('@')[0].split('.')[1] || 'Customer',
        address1: `${100 + i} Main St`,
        city: 'Anytown',
        state: 'CA',
        postalCode: '90210',
        country: 'US',
      },
      lineItems,
      discounts: [],
      subtotal,
      discountTotal: 0,
      shippingTotal,
      taxTotal,
      grandTotal,
      currency: 'USD',
      shippingMethod: 'Standard Shipping',
      tags: [],
      source: 'web',
      createdAt: orderDate.toISOString(),
      updatedAt: now,
    };

    orders.push(order);
  }

  ordersStorage.createMany(orders);
  console.log(`  ✓ Created ${orders.length} orders`);

  // Create some shipments for shipped orders
  const shipments: OrderShipment[] = [];
  for (const order of orders.filter(o => ['shipped', 'delivered', 'completed'].includes(o.status))) {
    shipments.push({
      id: uuidv4(),
      orderId: order.id,
      locationId: locations[0].id,
      status: order.status === 'delivered' || order.status === 'completed' ? 'delivered' : 'shipped',
      trackingNumber: `TRK${Math.random().toString(36).substring(2, 12).toUpperCase()}`,
      carrier: 'UPS',
      shippingMethod: 'Ground',
      lineItems: order.lineItems.map(li => ({ lineItemId: li.id, quantity: li.quantity })),
      shippedAt: order.createdAt,
      deliveredAt: order.status === 'delivered' || order.status === 'completed' ? now : undefined,
      createdAt: order.createdAt,
      updatedAt: now,
    });
  }

  if (shipments.length > 0) {
    shipmentsStorage.createMany(shipments);
    console.log(`  ✓ Created ${shipments.length} shipments`);
  }

  // ============================================================================
  // SEED PROMOTIONS
  // ============================================================================
  console.log('Creating promotions...');

  const futureDate = new Date();
  futureDate.setMonth(futureDate.getMonth() + 3);

  const pastDate = new Date();
  pastDate.setMonth(pastDate.getMonth() - 1);

  const promotions: Promotion[] = [
    {
      id: uuidv4(),
      name: 'Summer Sale - 20% Off',
      description: 'Get 20% off all items during our summer sale event',
      status: 'active',
      type: 'percentage',
      value: 20,
      target: 'all',
      conditions: [],
      minimumPurchaseAmount: 50,
      maximumDiscountAmount: 100,
      usageLimit: 1000,
      usageCount: 45,
      stackable: false,
      priority: 10,
      startDate: new Date().toISOString(),
      endDate: futureDate.toISOString(),
      codes: [
        {
          id: uuidv4(),
          promotionId: '',
          code: 'SUMMER20',
          usageLimit: 500,
          usageLimitPerCustomer: 1,
          usageCount: 45,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      excludeSaleItems: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      name: 'Free Shipping Over $75',
      description: 'Free shipping on orders over $75',
      status: 'active',
      type: 'free_shipping',
      value: 0,
      target: 'all',
      conditions: [{ type: 'minimum_purchase_amount', value: 75 }],
      minimumPurchaseAmount: 75,
      usageCount: 120,
      stackable: true,
      priority: 5,
      startDate: pastDate.toISOString(),
      endDate: futureDate.toISOString(),
      codes: [
        {
          id: uuidv4(),
          promotionId: '',
          code: 'FREESHIP',
          usageCount: 120,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      excludeSaleItems: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      name: 'New Customer Discount',
      description: '$15 off for first-time customers',
      status: 'active',
      type: 'fixed_amount',
      value: 15,
      target: 'all',
      conditions: [{ type: 'first_order', value: true }],
      minimumPurchaseAmount: 30,
      usageLimitPerCustomer: 1,
      usageCount: 89,
      stackable: false,
      priority: 15,
      startDate: pastDate.toISOString(),
      codes: [
        {
          id: uuidv4(),
          promotionId: '',
          code: 'WELCOME15',
          usageLimitPerCustomer: 1,
          usageCount: 89,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      excludeSaleItems: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      name: 'Electronics 10% Off',
      description: '10% off all electronics',
      status: 'active',
      type: 'percentage',
      value: 10,
      target: 'specific_categories',
      targetIds: [electronicsId],
      conditions: [],
      usageCount: 30,
      stackable: true,
      priority: 8,
      startDate: now,
      endDate: futureDate.toISOString(),
      codes: [
        {
          id: uuidv4(),
          promotionId: '',
          code: 'TECH10',
          usageCount: 30,
          isActive: true,
          createdAt: now,
          updatedAt: now,
        },
      ],
      excludeSaleItems: false,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      name: 'Expired Promo',
      description: 'This promotion has expired',
      status: 'expired',
      type: 'percentage',
      value: 50,
      target: 'all',
      conditions: [],
      usageCount: 200,
      stackable: false,
      priority: 1,
      startDate: new Date('2023-01-01').toISOString(),
      endDate: new Date('2023-12-31').toISOString(),
      codes: [
        {
          id: uuidv4(),
          promotionId: '',
          code: 'OLDCODE',
          usageCount: 200,
          isActive: false,
          createdAt: now,
          updatedAt: now,
        },
      ],
      excludeSaleItems: false,
      createdAt: now,
      updatedAt: now,
    },
  ];

  // Fix promotion IDs in codes
  for (const promotion of promotions) {
    for (const code of promotion.codes) {
      code.promotionId = promotion.id;
    }
  }

  promotionsStorage.createMany(promotions);
  console.log(`  ✓ Created ${promotions.length} promotions`);

  // ============================================================================
  // SEED AUTOMATIC DISCOUNTS
  // ============================================================================
  console.log('Creating automatic discounts...');

  const automaticDiscounts: AutomaticDiscount[] = [
    {
      id: uuidv4(),
      name: 'Buy 3 T-Shirts Get 15% Off',
      description: 'Automatically applied when buying 3 or more t-shirts',
      status: 'active',
      type: 'percentage',
      value: 15,
      target: 'specific_products',
      targetIds: [products[2].id], // T-shirt
      conditions: [{ type: 'minimum_quantity', value: 3 }],
      priority: 10,
      startDate: now,
      stackable: true,
      createdAt: now,
      updatedAt: now,
    },
    {
      id: uuidv4(),
      name: '5% Off Orders Over $200',
      description: 'Automatic 5% discount on large orders',
      status: 'active',
      type: 'percentage',
      value: 5,
      target: 'all',
      conditions: [],
      minimumPurchaseAmount: 200,
      maximumDiscountAmount: 50,
      priority: 5,
      startDate: now,
      stackable: true,
      createdAt: now,
      updatedAt: now,
    },
  ];

  automaticDiscountsStorage.createMany(automaticDiscounts);
  console.log(`  ✓ Created ${automaticDiscounts.length} automatic discounts`);

  console.log('\n✅ Seed complete!');
  console.log('\nSummary:');
  console.log(`  • ${categories.length} categories`);
  console.log(`  • ${locations.length} inventory locations`);
  console.log(`  • ${products.length} products`);
  console.log(`  • ${inventoryLevels.length} inventory levels`);
  console.log(`  • ${orders.length} orders`);
  console.log(`  • ${shipments.length} shipments`);
  console.log(`  • ${promotions.length} promotions`);
  console.log(`  • ${automaticDiscounts.length} automatic discounts`);
  console.log('\nStart the server with: npm run dev');
}

seed();
