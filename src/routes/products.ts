import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Storage, paginate } from '../utils/storage';
import { ApiError, ErrorCode, sendSuccess, asyncHandler } from '../utils/errors';
import {
  validateRequired,
  parseQueryInt,
  parseQueryArray,
  parseQueryBoolean,
  generateSlug,
} from '../utils/validators';
import {
  Product,
  ProductVariant,
  ProductCategory,
  ProductStatus,
  ProductType,
  ProductFilter,
  InventoryLevel,
  InventoryLocation,
  InventoryAdjustment,
  InventoryTransfer,
  AdjustmentReason,
} from '../types';

const router = Router();

// Storage instances
const productsStorage = new Storage<Product>('products');
const categoriesStorage = new Storage<ProductCategory>('categories');
const inventoryLevelsStorage = new Storage<InventoryLevel>('inventory_levels');
const locationsStorage = new Storage<InventoryLocation>('locations');
const adjustmentsStorage = new Storage<InventoryAdjustment>('inventory_adjustments');
const transfersStorage = new Storage<InventoryTransfer>('inventory_transfers');

// ============================================================================
// PRODUCT ENDPOINTS
// ============================================================================

/**
 * GET /api/products
 * List all products with filtering, sorting, and pagination
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseQueryInt(req.query.page, 1);
    const limit = parseQueryInt(req.query.limit, 20);
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

    // Build filter
    const filter: ProductFilter = {
      status: parseQueryArray(req.query.status) as ProductStatus[] | undefined,
      type: parseQueryArray(req.query.type) as ProductType[] | undefined,
      categoryId: req.query.categoryId as string | undefined,
      vendor: req.query.vendor as string | undefined,
      brand: req.query.brand as string | undefined,
      tags: parseQueryArray(req.query.tags),
      minPrice: req.query.minPrice ? parseFloat(req.query.minPrice as string) : undefined,
      maxPrice: req.query.maxPrice ? parseFloat(req.query.maxPrice as string) : undefined,
      inStock: parseQueryBoolean(req.query.inStock),
      search: req.query.search as string | undefined,
      createdAfter: req.query.createdAfter as string | undefined,
      createdBefore: req.query.createdBefore as string | undefined,
    };

    let products = productsStorage.getAll();

    // Apply filters
    if (filter.status?.length) {
      products = products.filter((p) => filter.status!.includes(p.status));
    }
    if (filter.type?.length) {
      products = products.filter((p) => filter.type!.includes(p.type));
    }
    if (filter.categoryId) {
      products = products.filter((p) => p.categoryIds.includes(filter.categoryId!));
    }
    if (filter.vendor) {
      products = products.filter((p) => p.vendor === filter.vendor);
    }
    if (filter.brand) {
      products = products.filter((p) => p.brand === filter.brand);
    }
    if (filter.tags?.length) {
      products = products.filter((p) => filter.tags!.some((t) => p.tags.includes(t)));
    }
    if (filter.minPrice !== undefined) {
      products = products.filter((p) => {
        const minVariantPrice = Math.min(...p.variants.map((v) => v.price));
        return minVariantPrice >= filter.minPrice!;
      });
    }
    if (filter.maxPrice !== undefined) {
      products = products.filter((p) => {
        const maxVariantPrice = Math.max(...p.variants.map((v) => v.price));
        return maxVariantPrice <= filter.maxPrice!;
      });
    }
    if (filter.inStock !== undefined) {
      const allInventory = inventoryLevelsStorage.getAll();
      products = products.filter((p) => {
        const variantIds = p.variants.map((v) => v.id);
        const totalAvailable = allInventory
          .filter((inv) => variantIds.includes(inv.variantId))
          .reduce((sum, inv) => sum + inv.available, 0);
        return filter.inStock ? totalAvailable > 0 : totalAvailable === 0;
      });
    }
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      products = products.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.description.toLowerCase().includes(searchLower) ||
          p.variants.some((v) => v.sku.toLowerCase().includes(searchLower))
      );
    }
    if (filter.createdAfter) {
      products = products.filter((p) => new Date(p.createdAt) >= new Date(filter.createdAfter!));
    }
    if (filter.createdBefore) {
      products = products.filter((p) => new Date(p.createdAt) <= new Date(filter.createdBefore!));
    }

    const result = paginate(products, { page, limit, sortBy, sortOrder });
    sendSuccess(res, result);
  })
);

/**
 * GET /api/products/:id
 * Get a single product by ID
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const product = productsStorage.getById(req.params.id);
    if (!product) {
      throw ApiError.notFound(ErrorCode.PRODUCT_NOT_FOUND, { productId: req.params.id });
    }

    // Include inventory information
    const inventory = inventoryLevelsStorage.find((inv) =>
      product.variants.some((v) => v.id === inv.variantId)
    );

    sendSuccess(res, { ...product, inventory });
  })
);

/**
 * POST /api/products
 * Create a new product
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    validateRequired(req.body, ['name', 'description']);

    const now = new Date().toISOString();
    const productId = uuidv4();
    const slug = req.body.slug || generateSlug(req.body.name);

    // Check for duplicate slug
    if (productsStorage.findOne((p) => p.slug === slug)) {
      throw ApiError.conflict(ErrorCode.DUPLICATE_SLUG, { slug });
    }

    // Process variants
    const variants: ProductVariant[] = (req.body.variants || []).map(
      (v: Partial<ProductVariant>, index: number) => {
        const variantId = uuidv4();
        
        // Check for duplicate SKU
        if (v.sku) {
          const allProducts = productsStorage.getAll();
          for (const p of allProducts) {
            if (p.variants.some((pv) => pv.sku === v.sku)) {
              throw ApiError.conflict(ErrorCode.DUPLICATE_SKU, { sku: v.sku });
            }
          }
        }

        return {
          id: variantId,
          productId,
          sku: v.sku || `SKU-${productId.slice(0, 8)}-${index}`,
          barcode: v.barcode,
          name: v.name || 'Default',
          price: v.price ?? 0,
          compareAtPrice: v.compareAtPrice,
          costPrice: v.costPrice,
          weight: v.weight,
          weightUnit: v.weightUnit,
          dimensions: v.dimensions,
          options: v.options || {},
          imageId: v.imageId,
          isDefault: index === 0,
          createdAt: now,
          updatedAt: now,
        };
      }
    );

    // If no variants provided, create a default one
    if (variants.length === 0) {
      variants.push({
        id: uuidv4(),
        productId,
        sku: `SKU-${productId.slice(0, 8)}`,
        name: 'Default',
        price: req.body.price ?? 0,
        options: {},
        isDefault: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    const product: Product = {
      id: productId,
      name: req.body.name,
      slug,
      description: req.body.description,
      shortDescription: req.body.shortDescription,
      status: req.body.status || 'draft',
      type: req.body.type || 'physical',
      vendor: req.body.vendor,
      brand: req.body.brand,
      tags: req.body.tags || [],
      categoryIds: req.body.categoryIds || [],
      images: (req.body.images || []).map((img: any, index: number) => ({
        id: uuidv4(),
        url: img.url,
        altText: img.altText || '',
        position: img.position ?? index,
        isPrimary: index === 0,
      })),
      variants,
      seoTitle: req.body.seoTitle,
      seoDescription: req.body.seoDescription,
      metafields: req.body.metafields,
      isGiftCard: req.body.isGiftCard || false,
      requiresShipping: req.body.requiresShipping ?? true,
      isTaxable: req.body.isTaxable ?? true,
      taxCode: req.body.taxCode,
      createdAt: now,
      updatedAt: now,
      publishedAt: req.body.status === 'active' ? now : undefined,
    };

    productsStorage.create(product);

    // Create default inventory levels for each variant at each location
    const locations = locationsStorage.getAll();
    for (const variant of product.variants) {
      for (const location of locations) {
        const inventoryLevel: InventoryLevel = {
          id: uuidv4(),
          variantId: variant.id,
          locationId: location.id,
          available: 0,
          reserved: 0,
          committed: 0,
          onHand: 0,
          incoming: 0,
          safetyStock: 0,
          reorderPoint: 10,
          reorderQuantity: 50,
          inventoryPolicy: 'deny',
          trackInventory: true,
          updatedAt: now,
        };
        inventoryLevelsStorage.create(inventoryLevel);
      }
    }

    sendSuccess(res, product, 201);
  })
);

/**
 * PUT /api/products/:id
 * Update a product
 */
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const product = productsStorage.getById(req.params.id);
    if (!product) {
      throw ApiError.notFound(ErrorCode.PRODUCT_NOT_FOUND, { productId: req.params.id });
    }

    const now = new Date().toISOString();
    
    // Check slug uniqueness if changed
    if (req.body.slug && req.body.slug !== product.slug) {
      if (productsStorage.findOne((p) => p.slug === req.body.slug && p.id !== product.id)) {
        throw ApiError.conflict(ErrorCode.DUPLICATE_SLUG, { slug: req.body.slug });
      }
    }

    const updates: Partial<Product> = {
      name: req.body.name ?? product.name,
      slug: req.body.slug ?? product.slug,
      description: req.body.description ?? product.description,
      shortDescription: req.body.shortDescription ?? product.shortDescription,
      status: req.body.status ?? product.status,
      type: req.body.type ?? product.type,
      vendor: req.body.vendor ?? product.vendor,
      brand: req.body.brand ?? product.brand,
      tags: req.body.tags ?? product.tags,
      categoryIds: req.body.categoryIds ?? product.categoryIds,
      images: req.body.images ?? product.images,
      seoTitle: req.body.seoTitle ?? product.seoTitle,
      seoDescription: req.body.seoDescription ?? product.seoDescription,
      metafields: req.body.metafields ?? product.metafields,
      isGiftCard: req.body.isGiftCard ?? product.isGiftCard,
      requiresShipping: req.body.requiresShipping ?? product.requiresShipping,
      isTaxable: req.body.isTaxable ?? product.isTaxable,
      taxCode: req.body.taxCode ?? product.taxCode,
      updatedAt: now,
    };

    // Handle publish state
    if (req.body.status === 'active' && !product.publishedAt) {
      updates.publishedAt = now;
    }

    const updated = productsStorage.update(product.id, updates);
    sendSuccess(res, updated);
  })
);

/**
 * DELETE /api/products/:id
 * Delete a product
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const product = productsStorage.getById(req.params.id);
    if (!product) {
      throw ApiError.notFound(ErrorCode.PRODUCT_NOT_FOUND, { productId: req.params.id });
    }

    // Delete associated inventory levels
    const variantIds = product.variants.map((v) => v.id);
    const inventoryToDelete = inventoryLevelsStorage.find((inv) =>
      variantIds.includes(inv.variantId)
    );
    inventoryLevelsStorage.deleteMany(inventoryToDelete.map((inv) => inv.id));

    productsStorage.delete(product.id);
    sendSuccess(res, { deleted: true, productId: product.id });
  })
);

// ============================================================================
// VARIANT ENDPOINTS
// ============================================================================

/**
 * GET /api/products/:id/variants
 * List all variants for a product
 */
router.get(
  '/:id/variants',
  asyncHandler(async (req: Request, res: Response) => {
    const product = productsStorage.getById(req.params.id);
    if (!product) {
      throw ApiError.notFound(ErrorCode.PRODUCT_NOT_FOUND, { productId: req.params.id });
    }
    sendSuccess(res, product.variants);
  })
);

/**
 * POST /api/products/:id/variants
 * Add a variant to a product
 */
router.post(
  '/:id/variants',
  asyncHandler(async (req: Request, res: Response) => {
    const product = productsStorage.getById(req.params.id);
    if (!product) {
      throw ApiError.notFound(ErrorCode.PRODUCT_NOT_FOUND, { productId: req.params.id });
    }

    validateRequired(req.body, ['name', 'price']);

    // Check for duplicate SKU
    if (req.body.sku) {
      const allProducts = productsStorage.getAll();
      for (const p of allProducts) {
        if (p.variants.some((v) => v.sku === req.body.sku)) {
          throw ApiError.conflict(ErrorCode.DUPLICATE_SKU, { sku: req.body.sku });
        }
      }
    }

    const now = new Date().toISOString();
    const variant: ProductVariant = {
      id: uuidv4(),
      productId: product.id,
      sku: req.body.sku || `SKU-${product.id.slice(0, 8)}-${product.variants.length}`,
      barcode: req.body.barcode,
      name: req.body.name,
      price: req.body.price,
      compareAtPrice: req.body.compareAtPrice,
      costPrice: req.body.costPrice,
      weight: req.body.weight,
      weightUnit: req.body.weightUnit,
      dimensions: req.body.dimensions,
      options: req.body.options || {},
      imageId: req.body.imageId,
      isDefault: product.variants.length === 0,
      createdAt: now,
      updatedAt: now,
    };

    const updatedVariants = [...product.variants, variant];
    productsStorage.update(product.id, { variants: updatedVariants, updatedAt: now });

    // Create inventory levels for the new variant
    const locations = locationsStorage.getAll();
    for (const location of locations) {
      const inventoryLevel: InventoryLevel = {
        id: uuidv4(),
        variantId: variant.id,
        locationId: location.id,
        available: 0,
        reserved: 0,
        committed: 0,
        onHand: 0,
        incoming: 0,
        safetyStock: 0,
        reorderPoint: 10,
        reorderQuantity: 50,
        inventoryPolicy: 'deny',
        trackInventory: true,
        updatedAt: now,
      };
      inventoryLevelsStorage.create(inventoryLevel);
    }

    sendSuccess(res, variant, 201);
  })
);

/**
 * PUT /api/products/:id/variants/:variantId
 * Update a variant
 */
router.put(
  '/:id/variants/:variantId',
  asyncHandler(async (req: Request, res: Response) => {
    const product = productsStorage.getById(req.params.id);
    if (!product) {
      throw ApiError.notFound(ErrorCode.PRODUCT_NOT_FOUND, { productId: req.params.id });
    }

    const variantIndex = product.variants.findIndex((v) => v.id === req.params.variantId);
    if (variantIndex === -1) {
      throw ApiError.notFound(ErrorCode.VARIANT_NOT_FOUND, { variantId: req.params.variantId });
    }

    const variant = product.variants[variantIndex];
    const now = new Date().toISOString();

    // Check for duplicate SKU if changing
    if (req.body.sku && req.body.sku !== variant.sku) {
      const allProducts = productsStorage.getAll();
      for (const p of allProducts) {
        if (p.variants.some((v) => v.sku === req.body.sku)) {
          throw ApiError.conflict(ErrorCode.DUPLICATE_SKU, { sku: req.body.sku });
        }
      }
    }

    const updatedVariant: ProductVariant = {
      ...variant,
      sku: req.body.sku ?? variant.sku,
      barcode: req.body.barcode ?? variant.barcode,
      name: req.body.name ?? variant.name,
      price: req.body.price ?? variant.price,
      compareAtPrice: req.body.compareAtPrice ?? variant.compareAtPrice,
      costPrice: req.body.costPrice ?? variant.costPrice,
      weight: req.body.weight ?? variant.weight,
      weightUnit: req.body.weightUnit ?? variant.weightUnit,
      dimensions: req.body.dimensions ?? variant.dimensions,
      options: req.body.options ?? variant.options,
      imageId: req.body.imageId ?? variant.imageId,
      updatedAt: now,
    };

    const updatedVariants = [...product.variants];
    updatedVariants[variantIndex] = updatedVariant;
    productsStorage.update(product.id, { variants: updatedVariants, updatedAt: now });

    sendSuccess(res, updatedVariant);
  })
);

/**
 * DELETE /api/products/:id/variants/:variantId
 * Delete a variant
 */
router.delete(
  '/:id/variants/:variantId',
  asyncHandler(async (req: Request, res: Response) => {
    const product = productsStorage.getById(req.params.id);
    if (!product) {
      throw ApiError.notFound(ErrorCode.PRODUCT_NOT_FOUND, { productId: req.params.id });
    }

    if (product.variants.length <= 1) {
      throw ApiError.badRequest(
        ErrorCode.VALIDATION_ERROR,
        { message: 'Cannot delete the last variant of a product' }
      );
    }

    const variantIndex = product.variants.findIndex((v) => v.id === req.params.variantId);
    if (variantIndex === -1) {
      throw ApiError.notFound(ErrorCode.VARIANT_NOT_FOUND, { variantId: req.params.variantId });
    }

    const variant = product.variants[variantIndex];
    const now = new Date().toISOString();

    // Delete associated inventory levels
    const inventoryToDelete = inventoryLevelsStorage.find((inv) => inv.variantId === variant.id);
    inventoryLevelsStorage.deleteMany(inventoryToDelete.map((inv) => inv.id));

    const updatedVariants = product.variants.filter((v) => v.id !== variant.id);
    
    // Make sure there's still a default variant
    if (variant.isDefault && updatedVariants.length > 0) {
      updatedVariants[0].isDefault = true;
    }

    productsStorage.update(product.id, { variants: updatedVariants, updatedAt: now });

    sendSuccess(res, { deleted: true, variantId: variant.id });
  })
);

// ============================================================================
// CATEGORY ENDPOINTS
// ============================================================================

/**
 * GET /api/products/categories
 * List all categories
 */
router.get(
  '/categories/list',
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseQueryInt(req.query.page, 1);
    const limit = parseQueryInt(req.query.limit, 50);
    const sortBy = (req.query.sortBy as string) || 'position';
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'asc';

    let categories = categoriesStorage.getAll();

    // Filter by parent
    if (req.query.parentId) {
      categories = categories.filter((c) => c.parentId === req.query.parentId);
    } else if (req.query.rootOnly === 'true') {
      categories = categories.filter((c) => !c.parentId);
    }

    // Filter by active status
    if (req.query.isActive !== undefined) {
      const isActive = req.query.isActive === 'true';
      categories = categories.filter((c) => c.isActive === isActive);
    }

    const result = paginate(categories, { page, limit, sortBy, sortOrder });
    sendSuccess(res, result);
  })
);

/**
 * GET /api/products/categories/:id
 * Get a single category
 */
router.get(
  '/categories/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const category = categoriesStorage.getById(req.params.id);
    if (!category) {
      throw ApiError.notFound(ErrorCode.CATEGORY_NOT_FOUND, { categoryId: req.params.id });
    }

    // Get children
    const children = categoriesStorage.find((c) => c.parentId === category.id);
    
    // Get product count
    const productCount = productsStorage.count((p) => p.categoryIds.includes(category.id));

    sendSuccess(res, { ...category, children, productCount });
  })
);

/**
 * POST /api/products/categories
 * Create a new category
 */
router.post(
  '/categories',
  asyncHandler(async (req: Request, res: Response) => {
    validateRequired(req.body, ['name']);

    const now = new Date().toISOString();
    const slug = req.body.slug || generateSlug(req.body.name);

    // Check for duplicate slug
    if (categoriesStorage.findOne((c) => c.slug === slug)) {
      throw ApiError.conflict(ErrorCode.DUPLICATE_SLUG, { slug });
    }

    // Validate parent exists if provided
    if (req.body.parentId) {
      const parent = categoriesStorage.getById(req.body.parentId);
      if (!parent) {
        throw ApiError.notFound(ErrorCode.CATEGORY_NOT_FOUND, { categoryId: req.body.parentId });
      }
    }

    const category: ProductCategory = {
      id: uuidv4(),
      name: req.body.name,
      slug,
      description: req.body.description,
      parentId: req.body.parentId,
      imageUrl: req.body.imageUrl,
      position: req.body.position ?? categoriesStorage.count() + 1,
      isActive: req.body.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    categoriesStorage.create(category);
    sendSuccess(res, category, 201);
  })
);

/**
 * PUT /api/products/categories/:id
 * Update a category
 */
router.put(
  '/categories/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const category = categoriesStorage.getById(req.params.id);
    if (!category) {
      throw ApiError.notFound(ErrorCode.CATEGORY_NOT_FOUND, { categoryId: req.params.id });
    }

    const now = new Date().toISOString();

    // Check slug uniqueness if changed
    if (req.body.slug && req.body.slug !== category.slug) {
      if (categoriesStorage.findOne((c) => c.slug === req.body.slug && c.id !== category.id)) {
        throw ApiError.conflict(ErrorCode.DUPLICATE_SLUG, { slug: req.body.slug });
      }
    }

    // Prevent circular parent reference
    if (req.body.parentId === category.id) {
      throw ApiError.badRequest(ErrorCode.VALIDATION_ERROR, { message: 'Category cannot be its own parent' });
    }

    const updated = categoriesStorage.update(category.id, {
      name: req.body.name ?? category.name,
      slug: req.body.slug ?? category.slug,
      description: req.body.description ?? category.description,
      parentId: req.body.parentId ?? category.parentId,
      imageUrl: req.body.imageUrl ?? category.imageUrl,
      position: req.body.position ?? category.position,
      isActive: req.body.isActive ?? category.isActive,
      updatedAt: now,
    });

    sendSuccess(res, updated);
  })
);

/**
 * DELETE /api/products/categories/:id
 * Delete a category
 */
router.delete(
  '/categories/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const category = categoriesStorage.getById(req.params.id);
    if (!category) {
      throw ApiError.notFound(ErrorCode.CATEGORY_NOT_FOUND, { categoryId: req.params.id });
    }

    // Check for children
    const children = categoriesStorage.find((c) => c.parentId === category.id);
    if (children.length > 0 && req.query.force !== 'true') {
      throw ApiError.conflict(ErrorCode.CONFLICT, {
        message: 'Category has children. Use force=true to delete anyway.',
        childCount: children.length,
      });
    }

    // Remove category from products
    const productsWithCategory = productsStorage.find((p) => p.categoryIds.includes(category.id));
    for (const product of productsWithCategory) {
      productsStorage.update(product.id, {
        categoryIds: product.categoryIds.filter((id) => id !== category.id),
        updatedAt: new Date().toISOString(),
      });
    }

    // Delete children if force
    if (children.length > 0) {
      categoriesStorage.deleteMany(children.map((c) => c.id));
    }

    categoriesStorage.delete(category.id);
    sendSuccess(res, { deleted: true, categoryId: category.id });
  })
);

// ============================================================================
// INVENTORY LOCATION ENDPOINTS
// ============================================================================

/**
 * GET /api/products/inventory/locations
 * List all inventory locations
 */
router.get(
  '/inventory/locations',
  asyncHandler(async (req: Request, res: Response) => {
    let locations = locationsStorage.getAll();

    if (req.query.isActive !== undefined) {
      const isActive = req.query.isActive === 'true';
      locations = locations.filter((l) => l.isActive === isActive);
    }

    // Sort by fulfillment priority
    locations.sort((a, b) => a.fulfillmentPriority - b.fulfillmentPriority);

    sendSuccess(res, locations);
  })
);

/**
 * GET /api/products/inventory/locations/:id
 * Get a single location
 */
router.get(
  '/inventory/locations/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const location = locationsStorage.getById(req.params.id);
    if (!location) {
      throw ApiError.notFound(ErrorCode.LOCATION_NOT_FOUND, { locationId: req.params.id });
    }

    // Get inventory summary for this location
    const inventory = inventoryLevelsStorage.find((inv) => inv.locationId === location.id);
    const summary = {
      totalVariants: inventory.length,
      totalOnHand: inventory.reduce((sum, inv) => sum + inv.onHand, 0),
      totalAvailable: inventory.reduce((sum, inv) => sum + inv.available, 0),
      totalReserved: inventory.reduce((sum, inv) => sum + inv.reserved, 0),
      totalCommitted: inventory.reduce((sum, inv) => sum + inv.committed, 0),
    };

    sendSuccess(res, { ...location, summary });
  })
);

/**
 * POST /api/products/inventory/locations
 * Create a new location
 */
router.post(
  '/inventory/locations',
  asyncHandler(async (req: Request, res: Response) => {
    validateRequired(req.body, ['name', 'code', 'address']);
    validateRequired(req.body.address, ['address1', 'city', 'state', 'postalCode', 'country']);

    // Check for duplicate code
    if (locationsStorage.findOne((l) => l.code === req.body.code)) {
      throw ApiError.conflict(ErrorCode.CONFLICT, { message: 'Location code already exists', code: req.body.code });
    }

    const now = new Date().toISOString();
    const existingLocations = locationsStorage.getAll();

    const location: InventoryLocation = {
      id: uuidv4(),
      name: req.body.name,
      code: req.body.code,
      address: req.body.address,
      isActive: req.body.isActive ?? true,
      isDefault: existingLocations.length === 0 || (req.body.isDefault ?? false),
      fulfillmentPriority: req.body.fulfillmentPriority ?? existingLocations.length + 1,
      createdAt: now,
      updatedAt: now,
    };

    // If this is set as default, unset others
    if (location.isDefault) {
      for (const existing of existingLocations) {
        if (existing.isDefault) {
          locationsStorage.update(existing.id, { isDefault: false, updatedAt: now });
        }
      }
    }

    locationsStorage.create(location);

    // Create inventory levels for all existing variants at this location
    const allProducts = productsStorage.getAll();
    for (const product of allProducts) {
      for (const variant of product.variants) {
        const inventoryLevel: InventoryLevel = {
          id: uuidv4(),
          variantId: variant.id,
          locationId: location.id,
          available: 0,
          reserved: 0,
          committed: 0,
          onHand: 0,
          incoming: 0,
          safetyStock: 0,
          reorderPoint: 10,
          reorderQuantity: 50,
          inventoryPolicy: 'deny',
          trackInventory: true,
          updatedAt: now,
        };
        inventoryLevelsStorage.create(inventoryLevel);
      }
    }

    sendSuccess(res, location, 201);
  })
);

/**
 * PUT /api/products/inventory/locations/:id
 * Update a location
 */
router.put(
  '/inventory/locations/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const location = locationsStorage.getById(req.params.id);
    if (!location) {
      throw ApiError.notFound(ErrorCode.LOCATION_NOT_FOUND, { locationId: req.params.id });
    }

    const now = new Date().toISOString();

    // Check code uniqueness if changed
    if (req.body.code && req.body.code !== location.code) {
      if (locationsStorage.findOne((l) => l.code === req.body.code && l.id !== location.id)) {
        throw ApiError.conflict(ErrorCode.CONFLICT, { message: 'Location code already exists', code: req.body.code });
      }
    }

    // Handle default change
    if (req.body.isDefault && !location.isDefault) {
      const existingLocations = locationsStorage.getAll();
      for (const existing of existingLocations) {
        if (existing.isDefault && existing.id !== location.id) {
          locationsStorage.update(existing.id, { isDefault: false, updatedAt: now });
        }
      }
    }

    const updated = locationsStorage.update(location.id, {
      name: req.body.name ?? location.name,
      code: req.body.code ?? location.code,
      address: req.body.address ?? location.address,
      isActive: req.body.isActive ?? location.isActive,
      isDefault: req.body.isDefault ?? location.isDefault,
      fulfillmentPriority: req.body.fulfillmentPriority ?? location.fulfillmentPriority,
      updatedAt: now,
    });

    sendSuccess(res, updated);
  })
);

/**
 * DELETE /api/products/inventory/locations/:id
 * Delete a location
 */
router.delete(
  '/inventory/locations/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const location = locationsStorage.getById(req.params.id);
    if (!location) {
      throw ApiError.notFound(ErrorCode.LOCATION_NOT_FOUND, { locationId: req.params.id });
    }

    // Check if there's inventory at this location
    const inventory = inventoryLevelsStorage.find((inv) => inv.locationId === location.id);
    const hasInventory = inventory.some((inv) => inv.onHand > 0);

    if (hasInventory && req.query.force !== 'true') {
      throw ApiError.conflict(ErrorCode.CONFLICT, {
        message: 'Location has inventory. Use force=true to delete anyway.',
      });
    }

    // Delete inventory levels for this location
    inventoryLevelsStorage.deleteMany(inventory.map((inv) => inv.id));

    locationsStorage.delete(location.id);
    sendSuccess(res, { deleted: true, locationId: location.id });
  })
);

// ============================================================================
// INVENTORY LEVEL ENDPOINTS
// ============================================================================

/**
 * GET /api/products/inventory/levels
 * Get inventory levels with filtering
 */
router.get(
  '/inventory/levels',
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseQueryInt(req.query.page, 1);
    const limit = parseQueryInt(req.query.limit, 50);

    let levels = inventoryLevelsStorage.getAll();

    // Filter by variant
    if (req.query.variantId) {
      levels = levels.filter((l) => l.variantId === req.query.variantId);
    }

    // Filter by location
    if (req.query.locationId) {
      levels = levels.filter((l) => l.locationId === req.query.locationId);
    }

    // Filter by stock status
    if (req.query.inStock === 'true') {
      levels = levels.filter((l) => l.available > 0);
    } else if (req.query.inStock === 'false') {
      levels = levels.filter((l) => l.available <= 0);
    }

    // Filter by low stock
    if (req.query.lowStock === 'true') {
      levels = levels.filter((l) => l.available <= l.reorderPoint);
    }

    // Enrich with product/variant info
    const enrichedLevels = levels.map((level) => {
      const products = productsStorage.getAll();
      let productInfo = null;
      let variantInfo = null;

      for (const product of products) {
        const variant = product.variants.find((v) => v.id === level.variantId);
        if (variant) {
          productInfo = { id: product.id, name: product.name };
          variantInfo = { id: variant.id, name: variant.name, sku: variant.sku };
          break;
        }
      }

      const location = locationsStorage.getById(level.locationId);

      return {
        ...level,
        product: productInfo,
        variant: variantInfo,
        location: location ? { id: location.id, name: location.name, code: location.code } : null,
      };
    });

    const result = paginate(enrichedLevels, { page, limit, sortBy: 'updatedAt', sortOrder: 'desc' });
    sendSuccess(res, result);
  })
);

/**
 * GET /api/products/inventory/levels/:variantId
 * Get inventory levels for a specific variant across all locations
 */
router.get(
  '/inventory/levels/:variantId',
  asyncHandler(async (req: Request, res: Response) => {
    const levels = inventoryLevelsStorage.find((l) => l.variantId === req.params.variantId);

    if (levels.length === 0) {
      // Check if variant exists
      const products = productsStorage.getAll();
      const variantExists = products.some((p) => p.variants.some((v) => v.id === req.params.variantId));
      if (!variantExists) {
        throw ApiError.notFound(ErrorCode.VARIANT_NOT_FOUND, { variantId: req.params.variantId });
      }
    }

    // Enrich with location info
    const enrichedLevels = levels.map((level) => {
      const location = locationsStorage.getById(level.locationId);
      return {
        ...level,
        location: location ? { id: location.id, name: location.name, code: location.code } : null,
      };
    });

    // Calculate totals
    const totals = {
      available: levels.reduce((sum, l) => sum + l.available, 0),
      reserved: levels.reduce((sum, l) => sum + l.reserved, 0),
      committed: levels.reduce((sum, l) => sum + l.committed, 0),
      onHand: levels.reduce((sum, l) => sum + l.onHand, 0),
      incoming: levels.reduce((sum, l) => sum + l.incoming, 0),
    };

    sendSuccess(res, { levels: enrichedLevels, totals });
  })
);

/**
 * PUT /api/products/inventory/levels/:variantId/:locationId
 * Update inventory level settings
 */
router.put(
  '/inventory/levels/:variantId/:locationId',
  asyncHandler(async (req: Request, res: Response) => {
    const level = inventoryLevelsStorage.findOne(
      (l) => l.variantId === req.params.variantId && l.locationId === req.params.locationId
    );

    if (!level) {
      throw ApiError.notFound(ErrorCode.INVENTORY_NOT_FOUND, {
        variantId: req.params.variantId,
        locationId: req.params.locationId,
      });
    }

    const now = new Date().toISOString();
    const updated = inventoryLevelsStorage.update(level.id, {
      safetyStock: req.body.safetyStock ?? level.safetyStock,
      reorderPoint: req.body.reorderPoint ?? level.reorderPoint,
      reorderQuantity: req.body.reorderQuantity ?? level.reorderQuantity,
      inventoryPolicy: req.body.inventoryPolicy ?? level.inventoryPolicy,
      trackInventory: req.body.trackInventory ?? level.trackInventory,
      updatedAt: now,
    });

    sendSuccess(res, updated);
  })
);

/**
 * POST /api/products/inventory/adjust
 * Adjust inventory quantity
 */
router.post(
  '/inventory/adjust',
  asyncHandler(async (req: Request, res: Response) => {
    validateRequired(req.body, ['variantId', 'locationId', 'quantity', 'reason']);

    const level = inventoryLevelsStorage.findOne(
      (l) => l.variantId === req.body.variantId && l.locationId === req.body.locationId
    );

    if (!level) {
      throw ApiError.notFound(ErrorCode.INVENTORY_NOT_FOUND, {
        variantId: req.body.variantId,
        locationId: req.body.locationId,
      });
    }

    const quantity = parseInt(req.body.quantity, 10);
    const reason = req.body.reason as AdjustmentReason;
    const now = new Date().toISOString();

    // Calculate new values
    const previousQuantity = level.onHand;
    const newOnHand = level.onHand + quantity;

    if (newOnHand < 0) {
      throw ApiError.badRequest(ErrorCode.INVALID_ADJUSTMENT, {
        message: 'Adjustment would result in negative inventory',
        currentOnHand: level.onHand,
        adjustmentQuantity: quantity,
      });
    }

    // Update inventory level
    const newAvailable = Math.max(0, newOnHand - level.reserved - level.committed);
    inventoryLevelsStorage.update(level.id, {
      onHand: newOnHand,
      available: newAvailable,
      updatedAt: now,
    });

    // Record adjustment
    const adjustment: InventoryAdjustment = {
      id: uuidv4(),
      variantId: req.body.variantId,
      locationId: req.body.locationId,
      quantity,
      previousQuantity,
      newQuantity: newOnHand,
      reason,
      notes: req.body.notes,
      referenceId: req.body.referenceId,
      referenceType: req.body.referenceType,
      createdBy: req.body.createdBy,
      createdAt: now,
    };

    adjustmentsStorage.create(adjustment);

    sendSuccess(res, {
      adjustment,
      inventoryLevel: {
        variantId: level.variantId,
        locationId: level.locationId,
        previousOnHand: previousQuantity,
        newOnHand,
        available: newAvailable,
      },
    });
  })
);

/**
 * POST /api/products/inventory/set
 * Set inventory to a specific quantity
 */
router.post(
  '/inventory/set',
  asyncHandler(async (req: Request, res: Response) => {
    validateRequired(req.body, ['variantId', 'locationId', 'quantity']);

    const level = inventoryLevelsStorage.findOne(
      (l) => l.variantId === req.body.variantId && l.locationId === req.body.locationId
    );

    if (!level) {
      throw ApiError.notFound(ErrorCode.INVENTORY_NOT_FOUND, {
        variantId: req.body.variantId,
        locationId: req.body.locationId,
      });
    }

    const newQuantity = parseInt(req.body.quantity, 10);
    if (newQuantity < 0) {
      throw ApiError.badRequest(ErrorCode.INVALID_ADJUSTMENT, {
        message: 'Quantity cannot be negative',
      });
    }

    const now = new Date().toISOString();
    const previousQuantity = level.onHand;
    const adjustmentQuantity = newQuantity - previousQuantity;

    // Update inventory level
    const newAvailable = Math.max(0, newQuantity - level.reserved - level.committed);
    inventoryLevelsStorage.update(level.id, {
      onHand: newQuantity,
      available: newAvailable,
      updatedAt: now,
    });

    // Record adjustment
    const adjustment: InventoryAdjustment = {
      id: uuidv4(),
      variantId: req.body.variantId,
      locationId: req.body.locationId,
      quantity: adjustmentQuantity,
      previousQuantity,
      newQuantity,
      reason: 'correction',
      notes: req.body.notes || 'Set inventory to specific quantity',
      createdBy: req.body.createdBy,
      createdAt: now,
    };

    adjustmentsStorage.create(adjustment);

    sendSuccess(res, {
      adjustment,
      inventoryLevel: {
        variantId: level.variantId,
        locationId: level.locationId,
        previousOnHand: previousQuantity,
        newOnHand: newQuantity,
        available: newAvailable,
      },
    });
  })
);

/**
 * GET /api/products/inventory/adjustments
 * Get inventory adjustment history
 */
router.get(
  '/inventory/adjustments',
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseQueryInt(req.query.page, 1);
    const limit = parseQueryInt(req.query.limit, 50);

    let adjustments = adjustmentsStorage.getAll();

    if (req.query.variantId) {
      adjustments = adjustments.filter((a) => a.variantId === req.query.variantId);
    }

    if (req.query.locationId) {
      adjustments = adjustments.filter((a) => a.locationId === req.query.locationId);
    }

    if (req.query.reason) {
      adjustments = adjustments.filter((a) => a.reason === req.query.reason);
    }

    if (req.query.createdAfter) {
      adjustments = adjustments.filter((a) => new Date(a.createdAt) >= new Date(req.query.createdAfter as string));
    }

    if (req.query.createdBefore) {
      adjustments = adjustments.filter((a) => new Date(a.createdAt) <= new Date(req.query.createdBefore as string));
    }

    const result = paginate(adjustments, { page, limit, sortBy: 'createdAt', sortOrder: 'desc' });
    sendSuccess(res, result);
  })
);

// ============================================================================
// INVENTORY TRANSFER ENDPOINTS
// ============================================================================

/**
 * GET /api/products/inventory/transfers
 * List inventory transfers
 */
router.get(
  '/inventory/transfers',
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseQueryInt(req.query.page, 1);
    const limit = parseQueryInt(req.query.limit, 20);

    let transfers = transfersStorage.getAll();

    if (req.query.status) {
      transfers = transfers.filter((t) => t.status === req.query.status);
    }

    if (req.query.fromLocationId) {
      transfers = transfers.filter((t) => t.fromLocationId === req.query.fromLocationId);
    }

    if (req.query.toLocationId) {
      transfers = transfers.filter((t) => t.toLocationId === req.query.toLocationId);
    }

    // Enrich with location names
    const enrichedTransfers = transfers.map((transfer) => {
      const fromLocation = locationsStorage.getById(transfer.fromLocationId);
      const toLocation = locationsStorage.getById(transfer.toLocationId);
      return {
        ...transfer,
        fromLocation: fromLocation ? { id: fromLocation.id, name: fromLocation.name } : null,
        toLocation: toLocation ? { id: toLocation.id, name: toLocation.name } : null,
      };
    });

    const result = paginate(enrichedTransfers, { page, limit, sortBy: 'createdAt', sortOrder: 'desc' });
    sendSuccess(res, result);
  })
);

/**
 * GET /api/products/inventory/transfers/:id
 * Get a single transfer
 */
router.get(
  '/inventory/transfers/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const transfer = transfersStorage.getById(req.params.id);
    if (!transfer) {
      throw ApiError.notFound(ErrorCode.TRANSFER_NOT_FOUND, { transferId: req.params.id });
    }

    const fromLocation = locationsStorage.getById(transfer.fromLocationId);
    const toLocation = locationsStorage.getById(transfer.toLocationId);

    // Enrich items with variant info
    const enrichedItems = transfer.items.map((item) => {
      const products = productsStorage.getAll();
      let variantInfo = null;
      for (const product of products) {
        const variant = product.variants.find((v) => v.id === item.variantId);
        if (variant) {
          variantInfo = {
            id: variant.id,
            name: variant.name,
            sku: variant.sku,
            productId: product.id,
            productName: product.name,
          };
          break;
        }
      }
      return { ...item, variant: variantInfo };
    });

    sendSuccess(res, {
      ...transfer,
      items: enrichedItems,
      fromLocation: fromLocation ? { id: fromLocation.id, name: fromLocation.name } : null,
      toLocation: toLocation ? { id: toLocation.id, name: toLocation.name } : null,
    });
  })
);

/**
 * POST /api/products/inventory/transfers
 * Create a new inventory transfer
 */
router.post(
  '/inventory/transfers',
  asyncHandler(async (req: Request, res: Response) => {
    validateRequired(req.body, ['fromLocationId', 'toLocationId', 'items']);

    if (req.body.fromLocationId === req.body.toLocationId) {
      throw ApiError.badRequest(ErrorCode.VALIDATION_ERROR, {
        message: 'Source and destination locations must be different',
      });
    }

    // Validate locations exist
    const fromLocation = locationsStorage.getById(req.body.fromLocationId);
    if (!fromLocation) {
      throw ApiError.notFound(ErrorCode.LOCATION_NOT_FOUND, { locationId: req.body.fromLocationId });
    }

    const toLocation = locationsStorage.getById(req.body.toLocationId);
    if (!toLocation) {
      throw ApiError.notFound(ErrorCode.LOCATION_NOT_FOUND, { locationId: req.body.toLocationId });
    }

    // Validate items and check inventory
    const items = req.body.items as Array<{ variantId: string; quantity: number }>;
    if (!items.length) {
      throw ApiError.badRequest(ErrorCode.VALIDATION_ERROR, { message: 'At least one item is required' });
    }

    for (const item of items) {
      if (!item.variantId || !item.quantity || item.quantity <= 0) {
        throw ApiError.badRequest(ErrorCode.VALIDATION_ERROR, {
          message: 'Each item must have a variantId and positive quantity',
        });
      }

      const level = inventoryLevelsStorage.findOne(
        (l) => l.variantId === item.variantId && l.locationId === req.body.fromLocationId
      );

      if (!level) {
        throw ApiError.notFound(ErrorCode.INVENTORY_NOT_FOUND, {
          variantId: item.variantId,
          locationId: req.body.fromLocationId,
        });
      }

      if (level.available < item.quantity) {
        throw ApiError.badRequest(ErrorCode.INSUFFICIENT_INVENTORY, {
          variantId: item.variantId,
          available: level.available,
          requested: item.quantity,
        });
      }
    }

    const now = new Date().toISOString();
    const transfer: InventoryTransfer = {
      id: uuidv4(),
      fromLocationId: req.body.fromLocationId,
      toLocationId: req.body.toLocationId,
      status: 'pending',
      items: items.map((item) => ({
        variantId: item.variantId,
        quantity: item.quantity,
      })),
      notes: req.body.notes,
      expectedArrival: req.body.expectedArrival,
      createdAt: now,
      updatedAt: now,
    };

    transfersStorage.create(transfer);
    sendSuccess(res, transfer, 201);
  })
);

/**
 * POST /api/products/inventory/transfers/:id/ship
 * Ship an inventory transfer (deduct from source)
 */
router.post(
  '/inventory/transfers/:id/ship',
  asyncHandler(async (req: Request, res: Response) => {
    const transfer = transfersStorage.getById(req.params.id);
    if (!transfer) {
      throw ApiError.notFound(ErrorCode.TRANSFER_NOT_FOUND, { transferId: req.params.id });
    }

    if (transfer.status !== 'pending') {
      throw ApiError.badRequest(ErrorCode.INVALID_TRANSFER_STATUS, {
        message: 'Transfer must be in pending status to ship',
        currentStatus: transfer.status,
      });
    }

    const now = new Date().toISOString();

    // Deduct inventory from source location
    for (const item of transfer.items) {
      const level = inventoryLevelsStorage.findOne(
        (l) => l.variantId === item.variantId && l.locationId === transfer.fromLocationId
      );

      if (!level) {
        throw ApiError.notFound(ErrorCode.INVENTORY_NOT_FOUND, {
          variantId: item.variantId,
          locationId: transfer.fromLocationId,
        });
      }

      if (level.available < item.quantity) {
        throw ApiError.badRequest(ErrorCode.INSUFFICIENT_INVENTORY, {
          variantId: item.variantId,
          available: level.available,
          requested: item.quantity,
        });
      }

      const newOnHand = level.onHand - item.quantity;
      const newAvailable = Math.max(0, newOnHand - level.reserved - level.committed);

      inventoryLevelsStorage.update(level.id, {
        onHand: newOnHand,
        available: newAvailable,
        updatedAt: now,
      });

      // Record adjustment
      const adjustment: InventoryAdjustment = {
        id: uuidv4(),
        variantId: item.variantId,
        locationId: transfer.fromLocationId,
        quantity: -item.quantity,
        previousQuantity: level.onHand,
        newQuantity: newOnHand,
        reason: 'transfer_out',
        referenceId: transfer.id,
        referenceType: 'transfer',
        createdAt: now,
      };
      adjustmentsStorage.create(adjustment);

      // Add to incoming at destination
      const destLevel = inventoryLevelsStorage.findOne(
        (l) => l.variantId === item.variantId && l.locationId === transfer.toLocationId
      );
      if (destLevel) {
        inventoryLevelsStorage.update(destLevel.id, {
          incoming: destLevel.incoming + item.quantity,
          updatedAt: now,
        });
      }
    }

    const updated = transfersStorage.update(transfer.id, {
      status: 'in_transit',
      shippedAt: now,
      updatedAt: now,
    });

    sendSuccess(res, updated);
  })
);

/**
 * POST /api/products/inventory/transfers/:id/receive
 * Receive an inventory transfer (add to destination)
 */
router.post(
  '/inventory/transfers/:id/receive',
  asyncHandler(async (req: Request, res: Response) => {
    const transfer = transfersStorage.getById(req.params.id);
    if (!transfer) {
      throw ApiError.notFound(ErrorCode.TRANSFER_NOT_FOUND, { transferId: req.params.id });
    }

    if (transfer.status !== 'in_transit') {
      throw ApiError.badRequest(ErrorCode.INVALID_TRANSFER_STATUS, {
        message: 'Transfer must be in transit to receive',
        currentStatus: transfer.status,
      });
    }

    const now = new Date().toISOString();

    // Process received quantities
    const receivedItems = req.body.items as Array<{ variantId: string; receivedQuantity: number }> | undefined;
    
    for (const item of transfer.items) {
      const received = receivedItems?.find((r) => r.variantId === item.variantId);
      const receivedQty = received?.receivedQuantity ?? item.quantity;

      const level = inventoryLevelsStorage.findOne(
        (l) => l.variantId === item.variantId && l.locationId === transfer.toLocationId
      );

      if (!level) {
        throw ApiError.notFound(ErrorCode.INVENTORY_NOT_FOUND, {
          variantId: item.variantId,
          locationId: transfer.toLocationId,
        });
      }

      const newOnHand = level.onHand + receivedQty;
      const newAvailable = Math.max(0, newOnHand - level.reserved - level.committed);
      const newIncoming = Math.max(0, level.incoming - item.quantity);

      inventoryLevelsStorage.update(level.id, {
        onHand: newOnHand,
        available: newAvailable,
        incoming: newIncoming,
        updatedAt: now,
      });

      // Record adjustment
      const adjustment: InventoryAdjustment = {
        id: uuidv4(),
        variantId: item.variantId,
        locationId: transfer.toLocationId,
        quantity: receivedQty,
        previousQuantity: level.onHand,
        newQuantity: newOnHand,
        reason: 'transfer_in',
        referenceId: transfer.id,
        referenceType: 'transfer',
        createdAt: now,
      };
      adjustmentsStorage.create(adjustment);

      // Update item received quantity
      item.receivedQuantity = receivedQty;
    }

    const updated = transfersStorage.update(transfer.id, {
      status: 'received',
      items: transfer.items,
      receivedAt: now,
      updatedAt: now,
    });

    sendSuccess(res, updated);
  })
);

/**
 * POST /api/products/inventory/transfers/:id/cancel
 * Cancel a pending transfer
 */
router.post(
  '/inventory/transfers/:id/cancel',
  asyncHandler(async (req: Request, res: Response) => {
    const transfer = transfersStorage.getById(req.params.id);
    if (!transfer) {
      throw ApiError.notFound(ErrorCode.TRANSFER_NOT_FOUND, { transferId: req.params.id });
    }

    if (transfer.status !== 'pending') {
      throw ApiError.badRequest(ErrorCode.INVALID_TRANSFER_STATUS, {
        message: 'Only pending transfers can be cancelled',
        currentStatus: transfer.status,
      });
    }

    const now = new Date().toISOString();
    const updated = transfersStorage.update(transfer.id, {
      status: 'cancelled',
      updatedAt: now,
    });

    sendSuccess(res, updated);
  })
);

export default router;
