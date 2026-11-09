// ============================================================================
// COMMON TYPES
// ============================================================================

export interface PaginationParams {
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
    details?: Record<string, unknown>;
  };
  meta?: {
    requestId: string;
    timestamp: string;
  };
}

export interface DateRange {
  startDate: string;
  endDate: string;
}

// ============================================================================
// PRODUCT TYPES
// ============================================================================

export type ProductStatus = 'active' | 'draft' | 'archived' | 'discontinued';
export type ProductType = 'physical' | 'digital' | 'service' | 'subscription';

export interface ProductImage {
  id: string;
  url: string;
  altText: string;
  position: number;
  isPrimary: boolean;
}

export interface ProductVariant {
  id: string;
  productId: string;
  sku: string;
  barcode?: string;
  name: string;
  price: number;
  compareAtPrice?: number;
  costPrice?: number;
  weight?: number;
  weightUnit?: 'lb' | 'kg' | 'oz' | 'g';
  dimensions?: {
    length: number;
    width: number;
    height: number;
    unit: 'in' | 'cm';
  };
  options: Record<string, string>;
  imageId?: string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ProductCategory {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  imageUrl?: string;
  position: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Product {
  id: string;
  name: string;
  slug: string;
  description: string;
  shortDescription?: string;
  status: ProductStatus;
  type: ProductType;
  vendor?: string;
  brand?: string;
  tags: string[];
  categoryIds: string[];
  images: ProductImage[];
  variants: ProductVariant[];
  seoTitle?: string;
  seoDescription?: string;
  metafields?: Record<string, unknown>;
  isGiftCard: boolean;
  requiresShipping: boolean;
  isTaxable: boolean;
  taxCode?: string;
  createdAt: string;
  updatedAt: string;
  publishedAt?: string;
}

// ============================================================================
// INVENTORY TYPES
// ============================================================================

export type InventoryPolicy = 'deny' | 'continue';
export type AdjustmentReason = 
  | 'received'
  | 'correction'
  | 'damaged'
  | 'theft'
  | 'loss'
  | 'recount'
  | 'returned'
  | 'reserved'
  | 'unreserved'
  | 'sold'
  | 'transfer_in'
  | 'transfer_out';

export interface InventoryLocation {
  id: string;
  name: string;
  code: string;
  address: {
    address1: string;
    address2?: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  isActive: boolean;
  isDefault: boolean;
  fulfillmentPriority: number;
  createdAt: string;
  updatedAt: string;
}

export interface InventoryLevel {
  id: string;
  variantId: string;
  locationId: string;
  available: number;
  reserved: number;
  committed: number;
  onHand: number;
  incoming: number;
  safetyStock: number;
  reorderPoint: number;
  reorderQuantity: number;
  inventoryPolicy: InventoryPolicy;
  trackInventory: boolean;
  updatedAt: string;
}

export interface InventoryAdjustment {
  id: string;
  variantId: string;
  locationId: string;
  quantity: number;
  previousQuantity: number;
  newQuantity: number;
  reason: AdjustmentReason;
  notes?: string;
  referenceId?: string;
  referenceType?: 'order' | 'transfer' | 'manual';
  createdBy?: string;
  createdAt: string;
}

export interface InventoryTransfer {
  id: string;
  fromLocationId: string;
  toLocationId: string;
  status: 'pending' | 'in_transit' | 'received' | 'cancelled';
  items: {
    variantId: string;
    quantity: number;
    receivedQuantity?: number;
  }[];
  notes?: string;
  expectedArrival?: string;
  shippedAt?: string;
  receivedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// ORDER TYPES
// ============================================================================

export type OrderStatus = 
  | 'pending'
  | 'confirmed'
  | 'processing'
  | 'on_hold'
  | 'shipped'
  | 'partially_shipped'
  | 'delivered'
  | 'completed'
  | 'cancelled'
  | 'refunded'
  | 'partially_refunded';

export type PaymentStatus = 
  | 'pending'
  | 'authorized'
  | 'paid'
  | 'partially_paid'
  | 'partially_refunded'
  | 'refunded'
  | 'voided'
  | 'failed';

export type FulfillmentStatus = 
  | 'unfulfilled'
  | 'partially_fulfilled'
  | 'fulfilled'
  | 'scheduled'
  | 'on_hold';

export interface Address {
  firstName: string;
  lastName: string;
  company?: string;
  address1: string;
  address2?: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
  phone?: string;
  email?: string;
}

export interface OrderLineItem {
  id: string;
  productId: string;
  variantId: string;
  sku: string;
  name: string;
  variantName: string;
  quantity: number;
  unitPrice: number;
  compareAtPrice?: number;
  discount: number;
  tax: number;
  totalPrice: number;
  weight?: number;
  fulfillableQuantity: number;
  fulfilledQuantity: number;
  refundedQuantity: number;
  properties?: Record<string, string>;
  imageUrl?: string;
  requiresShipping: boolean;
  isTaxable: boolean;
}

export interface OrderDiscount {
  id: string;
  code?: string;
  type: 'percentage' | 'fixed_amount' | 'free_shipping';
  value: number;
  appliedAmount: number;
  reason?: string;
}

export interface OrderShipment {
  id: string;
  orderId: string;
  locationId: string;
  status: 'pending' | 'shipped' | 'in_transit' | 'delivered' | 'failed';
  trackingNumber?: string;
  trackingUrl?: string;
  carrier?: string;
  carrierService?: string;
  shippingMethod: string;
  lineItems: {
    lineItemId: string;
    quantity: number;
  }[];
  shippedAt?: string;
  deliveredAt?: string;
  estimatedDelivery?: string;
  createdAt: string;
  updatedAt: string;
}

export interface OrderRefund {
  id: string;
  orderId: string;
  reason: string;
  note?: string;
  lineItems: {
    lineItemId: string;
    quantity: number;
    amount: number;
    restockType: 'no_restock' | 'return' | 'cancel';
  }[];
  shippingRefund: number;
  subtotalRefund: number;
  taxRefund: number;
  totalRefund: number;
  processedAt: string;
  createdAt: string;
}

export interface OrderTransaction {
  id: string;
  orderId: string;
  type: 'authorization' | 'capture' | 'sale' | 'void' | 'refund';
  status: 'success' | 'failure' | 'pending' | 'error';
  amount: number;
  currency: string;
  gateway: string;
  gatewayTransactionId?: string;
  errorCode?: string;
  errorMessage?: string;
  createdAt: string;
}

export interface OrderNote {
  id: string;
  orderId: string;
  content: string;
  isPrivate: boolean;
  createdBy?: string;
  createdAt: string;
}

export interface Order {
  id: string;
  orderNumber: string;
  status: OrderStatus;
  paymentStatus: PaymentStatus;
  fulfillmentStatus: FulfillmentStatus;
  customerId?: string;
  customerEmail: string;
  customerPhone?: string;
  billingAddress: Address;
  shippingAddress: Address;
  lineItems: OrderLineItem[];
  discounts: OrderDiscount[];
  subtotal: number;
  discountTotal: number;
  shippingTotal: number;
  taxTotal: number;
  grandTotal: number;
  currency: string;
  shippingMethod?: string;
  shippingCarrier?: string;
  notes?: string;
  tags: string[];
  source: string;
  sourceIdentifier?: string;
  ipAddress?: string;
  userAgent?: string;
  cancelReason?: string;
  cancelledAt?: string;
  closedAt?: string;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// PROMOTION TYPES
// ============================================================================

export type PromotionStatus = 'draft' | 'scheduled' | 'active' | 'paused' | 'expired' | 'archived';
export type DiscountType = 'percentage' | 'fixed_amount' | 'fixed_price' | 'buy_x_get_y' | 'free_shipping';
export type PromotionTarget = 'all' | 'specific_products' | 'specific_categories' | 'specific_collections';

export interface PromotionCondition {
  type: 
    | 'minimum_purchase_amount'
    | 'minimum_quantity'
    | 'customer_group'
    | 'first_order'
    | 'specific_products'
    | 'specific_categories'
    | 'date_range'
    | 'time_range';
  value: unknown;
}

export interface DiscountCode {
  id: string;
  promotionId: string;
  code: string;
  usageLimit?: number;
  usageLimitPerCustomer?: number;
  usageCount: number;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface Promotion {
  id: string;
  name: string;
  description?: string;
  internalNotes?: string;
  status: PromotionStatus;
  type: DiscountType;
  value: number;
  target: PromotionTarget;
  targetIds?: string[];
  conditions: PromotionCondition[];
  minimumPurchaseAmount?: number;
  maximumDiscountAmount?: number;
  usageLimit?: number;
  usageLimitPerCustomer?: number;
  usageCount: number;
  stackable: boolean;
  priority: number;
  startDate: string;
  endDate?: string;
  codes: DiscountCode[];
  excludeSaleItems: boolean;
  excludedProductIds?: string[];
  excludedCategoryIds?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PromotionUsage {
  id: string;
  promotionId: string;
  codeId?: string;
  orderId: string;
  customerId?: string;
  discountAmount: number;
  usedAt: string;
}

export interface AutomaticDiscount {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive' | 'scheduled';
  type: DiscountType;
  value: number;
  target: PromotionTarget;
  targetIds?: string[];
  conditions: PromotionCondition[];
  minimumPurchaseAmount?: number;
  maximumDiscountAmount?: number;
  priority: number;
  startDate: string;
  endDate?: string;
  stackable: boolean;
  createdAt: string;
  updatedAt: string;
}

// ============================================================================
// FILTER TYPES
// ============================================================================

export interface ProductFilter {
  status?: ProductStatus | ProductStatus[];
  type?: ProductType | ProductType[];
  categoryId?: string;
  vendor?: string;
  brand?: string;
  tags?: string[];
  minPrice?: number;
  maxPrice?: number;
  inStock?: boolean;
  search?: string;
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
}

export interface OrderFilter {
  status?: OrderStatus | OrderStatus[];
  paymentStatus?: PaymentStatus | PaymentStatus[];
  fulfillmentStatus?: FulfillmentStatus | FulfillmentStatus[];
  customerId?: string;
  customerEmail?: string;
  minTotal?: number;
  maxTotal?: number;
  tags?: string[];
  source?: string;
  createdAfter?: string;
  createdBefore?: string;
  updatedAfter?: string;
  updatedBefore?: string;
}

export interface PromotionFilter {
  status?: PromotionStatus | PromotionStatus[];
  type?: DiscountType | DiscountType[];
  search?: string;
  activeNow?: boolean;
  hasCode?: string;
  startAfter?: string;
  startBefore?: string;
  endAfter?: string;
  endBefore?: string;
}
