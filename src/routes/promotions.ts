import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { Storage, paginate } from '../utils/storage';
import { ApiError, ErrorCode, sendSuccess, asyncHandler } from '../utils/errors';
import { validateRequired, parseQueryInt, parseQueryArray, parseQueryBoolean } from '../utils/validators';
import {
  Promotion,
  PromotionStatus,
  DiscountType,
  PromotionTarget,
  DiscountCode,
  PromotionUsage,
  AutomaticDiscount,
  PromotionFilter,
  Product,
  ProductCategory,
} from '../types';

const router = Router();

// Storage instances
const promotionsStorage = new Storage<Promotion>('promotions');
const usageStorage = new Storage<PromotionUsage>('promotion_usage');
const automaticDiscountsStorage = new Storage<AutomaticDiscount>('automatic_discounts');
const productsStorage = new Storage<Product>('products');
const categoriesStorage = new Storage<ProductCategory>('categories');

// Helper to check if a promotion is currently active
function isPromotionActive(promotion: Promotion | AutomaticDiscount): boolean {
  const now = new Date();
  const startDate = new Date(promotion.startDate);
  const endDate = promotion.endDate ? new Date(promotion.endDate) : null;

  if (now < startDate) return false;
  if (endDate && now > endDate) return false;
  if (promotion.status !== 'active') return false;

  return true;
}

// Helper to validate promotion code format
function validateCodeFormat(code: string): void {
  const codeRegex = /^[A-Z0-9_-]{3,50}$/;
  if (!codeRegex.test(code.toUpperCase())) {
    throw ApiError.validation('Code must be 3-50 alphanumeric characters, underscores, or hyphens');
  }
}

// Helper to calculate discount amount
function calculateDiscount(
  promotion: Promotion | AutomaticDiscount,
  subtotal: number,
  eligibleAmount: number
): number {
  let discountAmount = 0;

  switch (promotion.type) {
    case 'percentage':
      discountAmount = eligibleAmount * (promotion.value / 100);
      break;
    case 'fixed_amount':
      discountAmount = Math.min(promotion.value, eligibleAmount);
      break;
    case 'fixed_price':
      // For fixed price, this would need item context
      discountAmount = Math.max(0, eligibleAmount - promotion.value);
      break;
    case 'free_shipping':
      // Handled separately
      discountAmount = 0;
      break;
    case 'buy_x_get_y':
      // Would need item context for proper calculation
      discountAmount = 0;
      break;
  }

  // Apply maximum discount cap
  if (promotion.maximumDiscountAmount && discountAmount > promotion.maximumDiscountAmount) {
    discountAmount = promotion.maximumDiscountAmount;
  }

  return Math.round(discountAmount * 100) / 100;
}

// ============================================================================
// PROMOTION ENDPOINTS
// ============================================================================

/**
 * GET /api/promotions
 * List all promotions with filtering
 */
router.get(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseQueryInt(req.query.page, 1);
    const limit = parseQueryInt(req.query.limit, 20);
    const sortBy = (req.query.sortBy as string) || 'createdAt';
    const sortOrder = (req.query.sortOrder as 'asc' | 'desc') || 'desc';

    const filter: PromotionFilter = {
      status: parseQueryArray(req.query.status) as PromotionStatus[] | undefined,
      type: parseQueryArray(req.query.type) as DiscountType[] | undefined,
      search: req.query.search as string | undefined,
      activeNow: parseQueryBoolean(req.query.activeNow),
      hasCode: req.query.code as string | undefined,
      startAfter: req.query.startAfter as string | undefined,
      startBefore: req.query.startBefore as string | undefined,
      endAfter: req.query.endAfter as string | undefined,
      endBefore: req.query.endBefore as string | undefined,
    };

    let promotions = promotionsStorage.getAll();

    // Apply filters
    if (filter.status?.length) {
      promotions = promotions.filter((p) => filter.status!.includes(p.status));
    }
    if (filter.type?.length) {
      promotions = promotions.filter((p) => filter.type!.includes(p.type));
    }
    if (filter.search) {
      const searchLower = filter.search.toLowerCase();
      promotions = promotions.filter(
        (p) =>
          p.name.toLowerCase().includes(searchLower) ||
          p.description?.toLowerCase().includes(searchLower) ||
          p.codes.some((c) => c.code.toLowerCase().includes(searchLower))
      );
    }
    if (filter.activeNow) {
      promotions = promotions.filter(isPromotionActive);
    }
    if (filter.hasCode) {
      const codeLower = filter.hasCode.toLowerCase();
      promotions = promotions.filter((p) =>
        p.codes.some((c) => c.code.toLowerCase() === codeLower)
      );
    }
    if (filter.startAfter) {
      promotions = promotions.filter(
        (p) => new Date(p.startDate) >= new Date(filter.startAfter!)
      );
    }
    if (filter.startBefore) {
      promotions = promotions.filter(
        (p) => new Date(p.startDate) <= new Date(filter.startBefore!)
      );
    }
    if (filter.endAfter && filter.endAfter) {
      promotions = promotions.filter(
        (p) => p.endDate && new Date(p.endDate) >= new Date(filter.endAfter!)
      );
    }
    if (filter.endBefore) {
      promotions = promotions.filter(
        (p) => p.endDate && new Date(p.endDate) <= new Date(filter.endBefore!)
      );
    }

    const result = paginate(promotions, { page, limit, sortBy, sortOrder });
    sendSuccess(res, result);
  })
);

/**
 * GET /api/promotions/stats
 * Get promotion statistics
 */
router.get(
  '/stats',
  asyncHandler(async (req: Request, res: Response) => {
    const promotions = promotionsStorage.getAll();
    const usage = usageStorage.getAll();

    // Date range filter for usage
    let filteredUsage = usage;
    if (req.query.startDate) {
      filteredUsage = filteredUsage.filter(
        (u) => new Date(u.usedAt) >= new Date(req.query.startDate as string)
      );
    }
    if (req.query.endDate) {
      filteredUsage = filteredUsage.filter(
        (u) => new Date(u.usedAt) <= new Date(req.query.endDate as string)
      );
    }

    const stats = {
      totalPromotions: promotions.length,
      activePromotions: promotions.filter(isPromotionActive).length,
      promotionsByStatus: {
        draft: promotions.filter((p) => p.status === 'draft').length,
        scheduled: promotions.filter((p) => p.status === 'scheduled').length,
        active: promotions.filter((p) => p.status === 'active').length,
        paused: promotions.filter((p) => p.status === 'paused').length,
        expired: promotions.filter((p) => p.status === 'expired').length,
        archived: promotions.filter((p) => p.status === 'archived').length,
      },
      promotionsByType: {
        percentage: promotions.filter((p) => p.type === 'percentage').length,
        fixed_amount: promotions.filter((p) => p.type === 'fixed_amount').length,
        free_shipping: promotions.filter((p) => p.type === 'free_shipping').length,
        buy_x_get_y: promotions.filter((p) => p.type === 'buy_x_get_y').length,
      },
      usageStats: {
        totalUsage: filteredUsage.length,
        totalDiscountAmount: filteredUsage.reduce((sum, u) => sum + u.discountAmount, 0),
        averageDiscountAmount: filteredUsage.length > 0
          ? filteredUsage.reduce((sum, u) => sum + u.discountAmount, 0) / filteredUsage.length
          : 0,
        uniqueCustomers: new Set(filteredUsage.filter((u) => u.customerId).map((u) => u.customerId)).size,
      },
      topPromotions: promotions
        .map((p) => ({
          id: p.id,
          name: p.name,
          usageCount: p.usageCount,
          totalDiscount: filteredUsage
            .filter((u) => u.promotionId === p.id)
            .reduce((sum, u) => sum + u.discountAmount, 0),
        }))
        .sort((a, b) => b.usageCount - a.usageCount)
        .slice(0, 10),
    };

    sendSuccess(res, stats);
  })
);

/**
 * GET /api/promotions/:id
 * Get a single promotion
 */
router.get(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const promotion = promotionsStorage.getById(req.params.id);
    if (!promotion) {
      throw ApiError.notFound(ErrorCode.PROMOTION_NOT_FOUND, { promotionId: req.params.id });
    }

    // Get usage data
    const usage = usageStorage.find((u) => u.promotionId === promotion.id);
    const usageStats = {
      totalUsage: usage.length,
      totalDiscountAmount: usage.reduce((sum, u) => sum + u.discountAmount, 0),
      uniqueCustomers: new Set(usage.filter((u) => u.customerId).map((u) => u.customerId)).size,
      recentUsage: usage.sort((a, b) => 
        new Date(b.usedAt).getTime() - new Date(a.usedAt).getTime()
      ).slice(0, 10),
    };

    sendSuccess(res, {
      ...promotion,
      isActive: isPromotionActive(promotion),
      usageStats,
    });
  })
);

/**
 * POST /api/promotions
 * Create a new promotion
 */
router.post(
  '/',
  asyncHandler(async (req: Request, res: Response) => {
    validateRequired(req.body, ['name', 'type', 'value', 'startDate']);

    const validTypes: DiscountType[] = ['percentage', 'fixed_amount', 'fixed_price', 'buy_x_get_y', 'free_shipping'];
    if (!validTypes.includes(req.body.type)) {
      throw ApiError.validation(`Type must be one of: ${validTypes.join(', ')}`);
    }

    // Validate percentage value
    if (req.body.type === 'percentage' && (req.body.value < 0 || req.body.value > 100)) {
      throw ApiError.validation('Percentage value must be between 0 and 100');
    }

    const now = new Date().toISOString();

    // Process codes if provided
    const codes: DiscountCode[] = [];
    if (req.body.codes && Array.isArray(req.body.codes)) {
      for (const codeData of req.body.codes) {
        const code = (codeData.code || codeData).toUpperCase();
        validateCodeFormat(code);

        // Check for duplicate codes across all promotions
        const existingPromotion = promotionsStorage.findOne((p) =>
          p.codes.some((c) => c.code === code)
        );
        if (existingPromotion) {
          throw ApiError.conflict(ErrorCode.DUPLICATE_CODE, { code });
        }

        codes.push({
          id: uuidv4(),
          promotionId: '', // Will be set after promotion creation
          code,
          usageLimit: codeData.usageLimit,
          usageLimitPerCustomer: codeData.usageLimitPerCustomer,
          usageCount: 0,
          isActive: codeData.isActive ?? true,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    const promotionId = uuidv4();

    // Update code promotion IDs
    codes.forEach((c) => (c.promotionId = promotionId));

    // Determine initial status
    let status: PromotionStatus = req.body.status || 'draft';
    const startDate = new Date(req.body.startDate);
    const endDate = req.body.endDate ? new Date(req.body.endDate) : null;

    if (status === 'active') {
      if (startDate > new Date()) {
        status = 'scheduled';
      } else if (endDate && endDate < new Date()) {
        status = 'expired';
      }
    }

    const promotion: Promotion = {
      id: promotionId,
      name: req.body.name,
      description: req.body.description,
      internalNotes: req.body.internalNotes,
      status,
      type: req.body.type,
      value: req.body.value,
      target: req.body.target || 'all',
      targetIds: req.body.targetIds,
      conditions: req.body.conditions || [],
      minimumPurchaseAmount: req.body.minimumPurchaseAmount,
      maximumDiscountAmount: req.body.maximumDiscountAmount,
      usageLimit: req.body.usageLimit,
      usageLimitPerCustomer: req.body.usageLimitPerCustomer,
      usageCount: 0,
      stackable: req.body.stackable ?? false,
      priority: req.body.priority ?? 0,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      codes,
      excludeSaleItems: req.body.excludeSaleItems ?? false,
      excludedProductIds: req.body.excludedProductIds,
      excludedCategoryIds: req.body.excludedCategoryIds,
      createdAt: now,
      updatedAt: now,
    };

    promotionsStorage.create(promotion);
    sendSuccess(res, promotion, 201);
  })
);

/**
 * PUT /api/promotions/:id
 * Update a promotion
 */
router.put(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const promotion = promotionsStorage.getById(req.params.id);
    if (!promotion) {
      throw ApiError.notFound(ErrorCode.PROMOTION_NOT_FOUND, { promotionId: req.params.id });
    }

    const now = new Date().toISOString();

    // Validate percentage value if changing type or value
    if (
      (req.body.type === 'percentage' || promotion.type === 'percentage') &&
      req.body.value !== undefined &&
      (req.body.value < 0 || req.body.value > 100)
    ) {
      throw ApiError.validation('Percentage value must be between 0 and 100');
    }

    const updates: Partial<Promotion> = {
      name: req.body.name ?? promotion.name,
      description: req.body.description ?? promotion.description,
      internalNotes: req.body.internalNotes ?? promotion.internalNotes,
      type: req.body.type ?? promotion.type,
      value: req.body.value ?? promotion.value,
      target: req.body.target ?? promotion.target,
      targetIds: req.body.targetIds ?? promotion.targetIds,
      conditions: req.body.conditions ?? promotion.conditions,
      minimumPurchaseAmount: req.body.minimumPurchaseAmount ?? promotion.minimumPurchaseAmount,
      maximumDiscountAmount: req.body.maximumDiscountAmount ?? promotion.maximumDiscountAmount,
      usageLimit: req.body.usageLimit ?? promotion.usageLimit,
      usageLimitPerCustomer: req.body.usageLimitPerCustomer ?? promotion.usageLimitPerCustomer,
      stackable: req.body.stackable ?? promotion.stackable,
      priority: req.body.priority ?? promotion.priority,
      startDate: req.body.startDate ?? promotion.startDate,
      endDate: req.body.endDate ?? promotion.endDate,
      excludeSaleItems: req.body.excludeSaleItems ?? promotion.excludeSaleItems,
      excludedProductIds: req.body.excludedProductIds ?? promotion.excludedProductIds,
      excludedCategoryIds: req.body.excludedCategoryIds ?? promotion.excludedCategoryIds,
      updatedAt: now,
    };

    // Handle status changes
    if (req.body.status !== undefined) {
      updates.status = req.body.status;
    }

    const updated = promotionsStorage.update(promotion.id, updates);
    sendSuccess(res, updated);
  })
);

/**
 * DELETE /api/promotions/:id
 * Delete a promotion
 */
router.delete(
  '/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const promotion = promotionsStorage.getById(req.params.id);
    if (!promotion) {
      throw ApiError.notFound(ErrorCode.PROMOTION_NOT_FOUND, { promotionId: req.params.id });
    }

    // Check for usage
    const hasUsage = usageStorage.count((u) => u.promotionId === promotion.id) > 0;

    if (hasUsage && req.query.force !== 'true') {
      throw ApiError.conflict(ErrorCode.CONFLICT, {
        message: 'Promotion has usage history. Use force=true to delete anyway.',
      });
    }

    // Delete usage records if force
    if (hasUsage) {
      const usageRecords = usageStorage.find((u) => u.promotionId === promotion.id);
      usageStorage.deleteMany(usageRecords.map((u) => u.id));
    }

    promotionsStorage.delete(promotion.id);
    sendSuccess(res, { deleted: true, promotionId: promotion.id });
  })
);

/**
 * POST /api/promotions/:id/activate
 * Activate a promotion
 */
router.post(
  '/:id/activate',
  asyncHandler(async (req: Request, res: Response) => {
    const promotion = promotionsStorage.getById(req.params.id);
    if (!promotion) {
      throw ApiError.notFound(ErrorCode.PROMOTION_NOT_FOUND, { promotionId: req.params.id });
    }

    const now = new Date();
    const startDate = new Date(promotion.startDate);

    let status: PromotionStatus = 'active';
    if (startDate > now) {
      status = 'scheduled';
    }

    const updated = promotionsStorage.update(promotion.id, {
      status,
      updatedAt: now.toISOString(),
    });

    sendSuccess(res, updated);
  })
);

/**
 * POST /api/promotions/:id/deactivate
 * Deactivate a promotion
 */
router.post(
  '/:id/deactivate',
  asyncHandler(async (req: Request, res: Response) => {
    const promotion = promotionsStorage.getById(req.params.id);
    if (!promotion) {
      throw ApiError.notFound(ErrorCode.PROMOTION_NOT_FOUND, { promotionId: req.params.id });
    }

    const updated = promotionsStorage.update(promotion.id, {
      status: 'paused',
      updatedAt: new Date().toISOString(),
    });

    sendSuccess(res, updated);
  })
);

/**
 * POST /api/promotions/:id/archive
 * Archive a promotion
 */
router.post(
  '/:id/archive',
  asyncHandler(async (req: Request, res: Response) => {
    const promotion = promotionsStorage.getById(req.params.id);
    if (!promotion) {
      throw ApiError.notFound(ErrorCode.PROMOTION_NOT_FOUND, { promotionId: req.params.id });
    }

    const updated = promotionsStorage.update(promotion.id, {
      status: 'archived',
      updatedAt: new Date().toISOString(),
    });

    sendSuccess(res, updated);
  })
);

// ============================================================================
// DISCOUNT CODE ENDPOINTS
// ============================================================================

/**
 * GET /api/promotions/:id/codes
 * Get all codes for a promotion
 */
router.get(
  '/:id/codes',
  asyncHandler(async (req: Request, res: Response) => {
    const promotion = promotionsStorage.getById(req.params.id);
    if (!promotion) {
      throw ApiError.notFound(ErrorCode.PROMOTION_NOT_FOUND, { promotionId: req.params.id });
    }

    sendSuccess(res, promotion.codes);
  })
);

/**
 * POST /api/promotions/:id/codes
 * Add a code to a promotion
 */
router.post(
  '/:id/codes',
  asyncHandler(async (req: Request, res: Response) => {
    const promotion = promotionsStorage.getById(req.params.id);
    if (!promotion) {
      throw ApiError.notFound(ErrorCode.PROMOTION_NOT_FOUND, { promotionId: req.params.id });
    }

    validateRequired(req.body, ['code']);

    const code = req.body.code.toUpperCase();
    validateCodeFormat(code);

    // Check for duplicates
    const existingPromotion = promotionsStorage.findOne((p) =>
      p.codes.some((c) => c.code === code)
    );
    if (existingPromotion) {
      throw ApiError.conflict(ErrorCode.DUPLICATE_CODE, { code });
    }

    const now = new Date().toISOString();
    const newCode: DiscountCode = {
      id: uuidv4(),
      promotionId: promotion.id,
      code,
      usageLimit: req.body.usageLimit,
      usageLimitPerCustomer: req.body.usageLimitPerCustomer,
      usageCount: 0,
      isActive: req.body.isActive ?? true,
      createdAt: now,
      updatedAt: now,
    };

    const updatedCodes = [...promotion.codes, newCode];
    promotionsStorage.update(promotion.id, {
      codes: updatedCodes,
      updatedAt: now,
    });

    sendSuccess(res, newCode, 201);
  })
);

/**
 * PUT /api/promotions/:id/codes/:codeId
 * Update a discount code
 */
router.put(
  '/:id/codes/:codeId',
  asyncHandler(async (req: Request, res: Response) => {
    const promotion = promotionsStorage.getById(req.params.id);
    if (!promotion) {
      throw ApiError.notFound(ErrorCode.PROMOTION_NOT_FOUND, { promotionId: req.params.id });
    }

    const codeIndex = promotion.codes.findIndex((c) => c.id === req.params.codeId);
    if (codeIndex === -1) {
      throw ApiError.notFound(ErrorCode.CODE_NOT_FOUND, { codeId: req.params.codeId });
    }

    const existingCode = promotion.codes[codeIndex];
    const now = new Date().toISOString();

    // Check code uniqueness if changing
    if (req.body.code && req.body.code.toUpperCase() !== existingCode.code) {
      const newCode = req.body.code.toUpperCase();
      validateCodeFormat(newCode);

      const duplicatePromotion = promotionsStorage.findOne((p) =>
        p.codes.some((c) => c.code === newCode && c.id !== existingCode.id)
      );
      if (duplicatePromotion) {
        throw ApiError.conflict(ErrorCode.DUPLICATE_CODE, { code: newCode });
      }
    }

    const updatedCode: DiscountCode = {
      ...existingCode,
      code: req.body.code ? req.body.code.toUpperCase() : existingCode.code,
      usageLimit: req.body.usageLimit ?? existingCode.usageLimit,
      usageLimitPerCustomer: req.body.usageLimitPerCustomer ?? existingCode.usageLimitPerCustomer,
      isActive: req.body.isActive ?? existingCode.isActive,
      updatedAt: now,
    };

    const updatedCodes = [...promotion.codes];
    updatedCodes[codeIndex] = updatedCode;

    promotionsStorage.update(promotion.id, {
      codes: updatedCodes,
      updatedAt: now,
    });

    sendSuccess(res, updatedCode);
  })
);

/**
 * DELETE /api/promotions/:id/codes/:codeId
 * Remove a code from a promotion
 */
router.delete(
  '/:id/codes/:codeId',
  asyncHandler(async (req: Request, res: Response) => {
    const promotion = promotionsStorage.getById(req.params.id);
    if (!promotion) {
      throw ApiError.notFound(ErrorCode.PROMOTION_NOT_FOUND, { promotionId: req.params.id });
    }

    const codeIndex = promotion.codes.findIndex((c) => c.id === req.params.codeId);
    if (codeIndex === -1) {
      throw ApiError.notFound(ErrorCode.CODE_NOT_FOUND, { codeId: req.params.codeId });
    }

    const code = promotion.codes[codeIndex];
    const now = new Date().toISOString();

    // Check for usage
    const hasUsage = usageStorage.count((u) => u.codeId === code.id) > 0;
    if (hasUsage && req.query.force !== 'true') {
      throw ApiError.conflict(ErrorCode.CONFLICT, {
        message: 'Code has usage history. Use force=true to delete anyway.',
      });
    }

    const updatedCodes = promotion.codes.filter((c) => c.id !== code.id);
    promotionsStorage.update(promotion.id, {
      codes: updatedCodes,
      updatedAt: now,
    });

    sendSuccess(res, { deleted: true, codeId: code.id });
  })
);

/**
 * POST /api/promotions/:id/codes/bulk
 * Bulk create codes for a promotion
 */
router.post(
  '/:id/codes/bulk',
  asyncHandler(async (req: Request, res: Response) => {
    const promotion = promotionsStorage.getById(req.params.id);
    if (!promotion) {
      throw ApiError.notFound(ErrorCode.PROMOTION_NOT_FOUND, { promotionId: req.params.id });
    }

    const count = parseQueryInt(req.body.count, 10);
    const prefix = (req.body.prefix || 'CODE').toUpperCase();
    const length = parseQueryInt(req.body.length, 8);

    if (count < 1 || count > 1000) {
      throw ApiError.validation('Count must be between 1 and 1000');
    }

    const now = new Date().toISOString();
    const newCodes: DiscountCode[] = [];
    const existingCodes = new Set(
      promotionsStorage.getAll().flatMap((p) => p.codes.map((c) => c.code))
    );

    for (let i = 0; i < count; i++) {
      let code: string;
      let attempts = 0;
      do {
        const randomPart = Array.from({ length: length - prefix.length }, () =>
          'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.charAt(Math.floor(Math.random() * 32))
        ).join('');
        code = `${prefix}${randomPart}`;
        attempts++;
      } while (existingCodes.has(code) && attempts < 100);

      if (attempts >= 100) {
        throw ApiError.badRequest(ErrorCode.CONFLICT, {
          message: 'Could not generate unique codes. Try different prefix or length.',
        });
      }

      existingCodes.add(code);
      newCodes.push({
        id: uuidv4(),
        promotionId: promotion.id,
        code,
        usageLimit: req.body.usageLimit,
        usageLimitPerCustomer: req.body.usageLimitPerCustomer ?? 1,
        usageCount: 0,
        isActive: true,
        createdAt: now,
        updatedAt: now,
      });
    }

    const updatedCodes = [...promotion.codes, ...newCodes];
    promotionsStorage.update(promotion.id, {
      codes: updatedCodes,
      updatedAt: now,
    });

    sendSuccess(res, { created: newCodes.length, codes: newCodes }, 201);
  })
);

// ============================================================================
// CODE VALIDATION & APPLICATION
// ============================================================================

/**
 * POST /api/promotions/validate-code
 * Validate a discount code
 */
router.post(
  '/validate-code',
  asyncHandler(async (req: Request, res: Response) => {
    validateRequired(req.body, ['code']);

    const code = req.body.code.toUpperCase();
    const subtotal = req.body.subtotal || 0;
    const customerId = req.body.customerId;

    // Find promotion with this code
    const promotion = promotionsStorage.findOne((p) =>
      p.codes.some((c) => c.code === code && c.isActive)
    );

    if (!promotion) {
      throw ApiError.notFound(ErrorCode.CODE_NOT_FOUND, { code });
    }

    const discountCode = promotion.codes.find((c) => c.code === code);
    if (!discountCode || !discountCode.isActive) {
      throw ApiError.notFound(ErrorCode.CODE_NOT_FOUND, { code });
    }

    // Check promotion status
    if (!isPromotionActive(promotion)) {
      if (promotion.status === 'expired' || (promotion.endDate && new Date(promotion.endDate) < new Date())) {
        throw ApiError.badRequest(ErrorCode.PROMOTION_EXPIRED);
      }
      throw ApiError.badRequest(ErrorCode.PROMOTION_NOT_ACTIVE);
    }

    // Check usage limits
    if (promotion.usageLimit && promotion.usageCount >= promotion.usageLimit) {
      throw ApiError.badRequest(ErrorCode.USAGE_LIMIT_REACHED, {
        message: 'Promotion usage limit reached',
      });
    }

    if (discountCode.usageLimit && discountCode.usageCount >= discountCode.usageLimit) {
      throw ApiError.badRequest(ErrorCode.USAGE_LIMIT_REACHED, {
        message: 'Code usage limit reached',
      });
    }

    // Check per-customer limit
    if (customerId && (promotion.usageLimitPerCustomer || discountCode.usageLimitPerCustomer)) {
      const customerUsage = usageStorage.count(
        (u) => u.promotionId === promotion.id && u.customerId === customerId
      );
      const limit = discountCode.usageLimitPerCustomer || promotion.usageLimitPerCustomer || 0;
      if (limit > 0 && customerUsage >= limit) {
        throw ApiError.badRequest(ErrorCode.USAGE_LIMIT_REACHED, {
          message: 'Per-customer usage limit reached',
        });
      }
    }

    // Check minimum purchase
    if (promotion.minimumPurchaseAmount && subtotal < promotion.minimumPurchaseAmount) {
      throw ApiError.badRequest(ErrorCode.MINIMUM_NOT_MET, {
        minimumRequired: promotion.minimumPurchaseAmount,
        currentSubtotal: subtotal,
      });
    }

    // Calculate discount
    const discountAmount = calculateDiscount(promotion, subtotal, subtotal);

    sendSuccess(res, {
      valid: true,
      promotion: {
        id: promotion.id,
        name: promotion.name,
        type: promotion.type,
        value: promotion.value,
      },
      code: {
        id: discountCode.id,
        code: discountCode.code,
      },
      discountAmount,
      minimumPurchaseAmount: promotion.minimumPurchaseAmount,
      maximumDiscountAmount: promotion.maximumDiscountAmount,
    });
  })
);

/**
 * POST /api/promotions/apply-code
 * Apply a discount code and record usage
 */
router.post(
  '/apply-code',
  asyncHandler(async (req: Request, res: Response) => {
    validateRequired(req.body, ['code', 'orderId']);

    const code = req.body.code.toUpperCase();
    const subtotal = req.body.subtotal || 0;
    const customerId = req.body.customerId;
    const orderId = req.body.orderId;

    // Find promotion with this code
    const promotion = promotionsStorage.findOne((p) =>
      p.codes.some((c) => c.code === code && c.isActive)
    );

    if (!promotion) {
      throw ApiError.notFound(ErrorCode.CODE_NOT_FOUND, { code });
    }

    const discountCode = promotion.codes.find((c) => c.code === code);
    if (!discountCode || !discountCode.isActive) {
      throw ApiError.notFound(ErrorCode.CODE_NOT_FOUND, { code });
    }

    // Validate (same checks as validate-code)
    if (!isPromotionActive(promotion)) {
      throw ApiError.badRequest(ErrorCode.PROMOTION_NOT_ACTIVE);
    }

    if (promotion.usageLimit && promotion.usageCount >= promotion.usageLimit) {
      throw ApiError.badRequest(ErrorCode.USAGE_LIMIT_REACHED);
    }

    if (discountCode.usageLimit && discountCode.usageCount >= discountCode.usageLimit) {
      throw ApiError.badRequest(ErrorCode.USAGE_LIMIT_REACHED);
    }

    if (promotion.minimumPurchaseAmount && subtotal < promotion.minimumPurchaseAmount) {
      throw ApiError.badRequest(ErrorCode.MINIMUM_NOT_MET);
    }

    // Calculate discount
    const discountAmount = calculateDiscount(promotion, subtotal, subtotal);
    const now = new Date().toISOString();

    // Record usage
    const usage: PromotionUsage = {
      id: uuidv4(),
      promotionId: promotion.id,
      codeId: discountCode.id,
      orderId,
      customerId,
      discountAmount,
      usedAt: now,
    };
    usageStorage.create(usage);

    // Update usage counts
    const updatedCodes = promotion.codes.map((c) =>
      c.id === discountCode.id
        ? { ...c, usageCount: c.usageCount + 1, updatedAt: now }
        : c
    );

    promotionsStorage.update(promotion.id, {
      codes: updatedCodes,
      usageCount: promotion.usageCount + 1,
      updatedAt: now,
    });

    sendSuccess(res, {
      applied: true,
      usage,
      discountAmount,
    });
  })
);

// ============================================================================
// AUTOMATIC DISCOUNT ENDPOINTS
// ============================================================================

/**
 * GET /api/promotions/automatic
 * List automatic discounts
 */
router.get(
  '/automatic/list',
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseQueryInt(req.query.page, 1);
    const limit = parseQueryInt(req.query.limit, 20);

    let discounts = automaticDiscountsStorage.getAll();

    if (req.query.status) {
      discounts = discounts.filter((d) => d.status === req.query.status);
    }

    if (req.query.activeNow === 'true') {
      discounts = discounts.filter(isPromotionActive);
    }

    // Sort by priority
    discounts.sort((a, b) => b.priority - a.priority);

    const result = paginate(discounts, { page, limit, sortBy: 'priority', sortOrder: 'desc' });
    sendSuccess(res, result);
  })
);

/**
 * GET /api/promotions/automatic/:id
 * Get a single automatic discount
 */
router.get(
  '/automatic/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const discount = automaticDiscountsStorage.getById(req.params.id);
    if (!discount) {
      throw ApiError.notFound(ErrorCode.PROMOTION_NOT_FOUND, { discountId: req.params.id });
    }

    sendSuccess(res, {
      ...discount,
      isActive: isPromotionActive(discount),
    });
  })
);

/**
 * POST /api/promotions/automatic
 * Create an automatic discount
 */
router.post(
  '/automatic',
  asyncHandler(async (req: Request, res: Response) => {
    validateRequired(req.body, ['name', 'type', 'value', 'startDate']);

    const now = new Date().toISOString();

    const discount: AutomaticDiscount = {
      id: uuidv4(),
      name: req.body.name,
      description: req.body.description,
      status: req.body.status || 'active',
      type: req.body.type,
      value: req.body.value,
      target: req.body.target || 'all',
      targetIds: req.body.targetIds,
      conditions: req.body.conditions || [],
      minimumPurchaseAmount: req.body.minimumPurchaseAmount,
      maximumDiscountAmount: req.body.maximumDiscountAmount,
      priority: req.body.priority ?? 0,
      startDate: req.body.startDate,
      endDate: req.body.endDate,
      stackable: req.body.stackable ?? false,
      createdAt: now,
      updatedAt: now,
    };

    automaticDiscountsStorage.create(discount);
    sendSuccess(res, discount, 201);
  })
);

/**
 * PUT /api/promotions/automatic/:id
 * Update an automatic discount
 */
router.put(
  '/automatic/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const discount = automaticDiscountsStorage.getById(req.params.id);
    if (!discount) {
      throw ApiError.notFound(ErrorCode.PROMOTION_NOT_FOUND, { discountId: req.params.id });
    }

    const now = new Date().toISOString();

    const updated = automaticDiscountsStorage.update(discount.id, {
      name: req.body.name ?? discount.name,
      description: req.body.description ?? discount.description,
      status: req.body.status ?? discount.status,
      type: req.body.type ?? discount.type,
      value: req.body.value ?? discount.value,
      target: req.body.target ?? discount.target,
      targetIds: req.body.targetIds ?? discount.targetIds,
      conditions: req.body.conditions ?? discount.conditions,
      minimumPurchaseAmount: req.body.minimumPurchaseAmount ?? discount.minimumPurchaseAmount,
      maximumDiscountAmount: req.body.maximumDiscountAmount ?? discount.maximumDiscountAmount,
      priority: req.body.priority ?? discount.priority,
      startDate: req.body.startDate ?? discount.startDate,
      endDate: req.body.endDate ?? discount.endDate,
      stackable: req.body.stackable ?? discount.stackable,
      updatedAt: now,
    });

    sendSuccess(res, updated);
  })
);

/**
 * DELETE /api/promotions/automatic/:id
 * Delete an automatic discount
 */
router.delete(
  '/automatic/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const discount = automaticDiscountsStorage.getById(req.params.id);
    if (!discount) {
      throw ApiError.notFound(ErrorCode.PROMOTION_NOT_FOUND, { discountId: req.params.id });
    }

    automaticDiscountsStorage.delete(discount.id);
    sendSuccess(res, { deleted: true, discountId: discount.id });
  })
);

/**
 * POST /api/promotions/automatic/calculate
 * Calculate applicable automatic discounts for a cart
 */
router.post(
  '/automatic/calculate',
  asyncHandler(async (req: Request, res: Response) => {
    const subtotal = req.body.subtotal || 0;
    const items = req.body.items || [];

    // Get all active automatic discounts
    let discounts = automaticDiscountsStorage.getAll().filter(isPromotionActive);

    // Sort by priority (higher first)
    discounts.sort((a, b) => b.priority - a.priority);

    const applicableDiscounts: Array<{
      discount: AutomaticDiscount;
      amount: number;
    }> = [];

    let remainingSubtotal = subtotal;
    const appliedNonStackable = false;

    for (const discount of discounts) {
      // Skip if non-stackable and we already have one
      if (!discount.stackable && applicableDiscounts.some((d) => !d.discount.stackable)) {
        continue;
      }

      // Check minimum purchase
      if (discount.minimumPurchaseAmount && subtotal < discount.minimumPurchaseAmount) {
        continue;
      }

      // Check target eligibility
      let eligibleAmount = subtotal;
      if (discount.target !== 'all' && discount.targetIds?.length) {
        // Calculate eligible amount based on target
        eligibleAmount = items
          .filter((item: any) => {
            if (discount.target === 'specific_products') {
              return discount.targetIds?.includes(item.productId);
            }
            if (discount.target === 'specific_categories') {
              return discount.targetIds?.some((catId) => item.categoryIds?.includes(catId));
            }
            return true;
          })
          .reduce((sum: number, item: any) => sum + (item.price * item.quantity), 0);
      }

      if (eligibleAmount <= 0) continue;

      const amount = calculateDiscount(discount, subtotal, eligibleAmount);
      if (amount > 0) {
        applicableDiscounts.push({ discount, amount });
        if (!discount.stackable) {
          break; // Stop if we applied a non-stackable discount
        }
      }
    }

    const totalDiscount = applicableDiscounts.reduce((sum, d) => sum + d.amount, 0);

    sendSuccess(res, {
      applicableDiscounts: applicableDiscounts.map((d) => ({
        id: d.discount.id,
        name: d.discount.name,
        type: d.discount.type,
        value: d.discount.value,
        amount: d.amount,
        stackable: d.discount.stackable,
      })),
      totalDiscount,
      finalSubtotal: Math.max(0, subtotal - totalDiscount),
    });
  })
);

// ============================================================================
// PROMOTION USAGE ENDPOINTS
// ============================================================================

/**
 * GET /api/promotions/usage
 * Get promotion usage history
 */
router.get(
  '/usage/list',
  asyncHandler(async (req: Request, res: Response) => {
    const page = parseQueryInt(req.query.page, 1);
    const limit = parseQueryInt(req.query.limit, 50);

    let usage = usageStorage.getAll();

    if (req.query.promotionId) {
      usage = usage.filter((u) => u.promotionId === req.query.promotionId);
    }

    if (req.query.customerId) {
      usage = usage.filter((u) => u.customerId === req.query.customerId);
    }

    if (req.query.orderId) {
      usage = usage.filter((u) => u.orderId === req.query.orderId);
    }

    if (req.query.usedAfter) {
      usage = usage.filter((u) => new Date(u.usedAt) >= new Date(req.query.usedAfter as string));
    }

    if (req.query.usedBefore) {
      usage = usage.filter((u) => new Date(u.usedAt) <= new Date(req.query.usedBefore as string));
    }

    // Enrich with promotion info
    const enrichedUsage = usage.map((u) => {
      const promotion = promotionsStorage.getById(u.promotionId);
      return {
        ...u,
        promotion: promotion ? { id: promotion.id, name: promotion.name } : null,
      };
    });

    const result = paginate(enrichedUsage, { page, limit, sortBy: 'usedAt', sortOrder: 'desc' });
    sendSuccess(res, result);
  })
);

export default router;
