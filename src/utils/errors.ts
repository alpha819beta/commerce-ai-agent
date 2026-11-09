import { Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { ApiResponse } from '../types';

export enum ErrorCode {
  // General errors
  INTERNAL_ERROR = 'INTERNAL_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  NOT_FOUND = 'NOT_FOUND',
  CONFLICT = 'CONFLICT',
  BAD_REQUEST = 'BAD_REQUEST',
  
  // Product errors
  PRODUCT_NOT_FOUND = 'PRODUCT_NOT_FOUND',
  VARIANT_NOT_FOUND = 'VARIANT_NOT_FOUND',
  CATEGORY_NOT_FOUND = 'CATEGORY_NOT_FOUND',
  DUPLICATE_SKU = 'DUPLICATE_SKU',
  DUPLICATE_SLUG = 'DUPLICATE_SLUG',
  
  // Inventory errors
  INVENTORY_NOT_FOUND = 'INVENTORY_NOT_FOUND',
  LOCATION_NOT_FOUND = 'LOCATION_NOT_FOUND',
  INSUFFICIENT_INVENTORY = 'INSUFFICIENT_INVENTORY',
  INVALID_ADJUSTMENT = 'INVALID_ADJUSTMENT',
  TRANSFER_NOT_FOUND = 'TRANSFER_NOT_FOUND',
  INVALID_TRANSFER_STATUS = 'INVALID_TRANSFER_STATUS',
  
  // Order errors
  ORDER_NOT_FOUND = 'ORDER_NOT_FOUND',
  INVALID_ORDER_STATUS = 'INVALID_ORDER_STATUS',
  INVALID_PAYMENT_STATUS = 'INVALID_PAYMENT_STATUS',
  ORDER_ALREADY_FULFILLED = 'ORDER_ALREADY_FULFILLED',
  ORDER_ALREADY_CANCELLED = 'ORDER_ALREADY_CANCELLED',
  SHIPMENT_NOT_FOUND = 'SHIPMENT_NOT_FOUND',
  REFUND_NOT_FOUND = 'REFUND_NOT_FOUND',
  REFUND_EXCEEDS_ORDER = 'REFUND_EXCEEDS_ORDER',
  
  // Promotion errors
  PROMOTION_NOT_FOUND = 'PROMOTION_NOT_FOUND',
  CODE_NOT_FOUND = 'CODE_NOT_FOUND',
  DUPLICATE_CODE = 'DUPLICATE_CODE',
  PROMOTION_EXPIRED = 'PROMOTION_EXPIRED',
  PROMOTION_NOT_ACTIVE = 'PROMOTION_NOT_ACTIVE',
  USAGE_LIMIT_REACHED = 'USAGE_LIMIT_REACHED',
  MINIMUM_NOT_MET = 'MINIMUM_NOT_MET',
}

export const ErrorMessages: Record<ErrorCode, string> = {
  [ErrorCode.INTERNAL_ERROR]: 'An internal server error occurred',
  [ErrorCode.VALIDATION_ERROR]: 'Validation failed for the provided data',
  [ErrorCode.NOT_FOUND]: 'The requested resource was not found',
  [ErrorCode.CONFLICT]: 'A conflict occurred with the current state of the resource',
  [ErrorCode.BAD_REQUEST]: 'The request was invalid or malformed',
  
  [ErrorCode.PRODUCT_NOT_FOUND]: 'Product not found',
  [ErrorCode.VARIANT_NOT_FOUND]: 'Product variant not found',
  [ErrorCode.CATEGORY_NOT_FOUND]: 'Category not found',
  [ErrorCode.DUPLICATE_SKU]: 'A variant with this SKU already exists',
  [ErrorCode.DUPLICATE_SLUG]: 'A product with this slug already exists',
  
  [ErrorCode.INVENTORY_NOT_FOUND]: 'Inventory level not found',
  [ErrorCode.LOCATION_NOT_FOUND]: 'Inventory location not found',
  [ErrorCode.INSUFFICIENT_INVENTORY]: 'Insufficient inventory for this operation',
  [ErrorCode.INVALID_ADJUSTMENT]: 'Invalid inventory adjustment',
  [ErrorCode.TRANSFER_NOT_FOUND]: 'Inventory transfer not found',
  [ErrorCode.INVALID_TRANSFER_STATUS]: 'Invalid transfer status for this operation',
  
  [ErrorCode.ORDER_NOT_FOUND]: 'Order not found',
  [ErrorCode.INVALID_ORDER_STATUS]: 'Invalid order status for this operation',
  [ErrorCode.INVALID_PAYMENT_STATUS]: 'Invalid payment status for this operation',
  [ErrorCode.ORDER_ALREADY_FULFILLED]: 'Order has already been fulfilled',
  [ErrorCode.ORDER_ALREADY_CANCELLED]: 'Order has already been cancelled',
  [ErrorCode.SHIPMENT_NOT_FOUND]: 'Shipment not found',
  [ErrorCode.REFUND_NOT_FOUND]: 'Refund not found',
  [ErrorCode.REFUND_EXCEEDS_ORDER]: 'Refund amount exceeds order total',
  
  [ErrorCode.PROMOTION_NOT_FOUND]: 'Promotion not found',
  [ErrorCode.CODE_NOT_FOUND]: 'Discount code not found',
  [ErrorCode.DUPLICATE_CODE]: 'This discount code already exists',
  [ErrorCode.PROMOTION_EXPIRED]: 'This promotion has expired',
  [ErrorCode.PROMOTION_NOT_ACTIVE]: 'This promotion is not currently active',
  [ErrorCode.USAGE_LIMIT_REACHED]: 'Usage limit has been reached for this promotion',
  [ErrorCode.MINIMUM_NOT_MET]: 'Minimum purchase requirement not met',
};

export class ApiError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: Record<string, unknown>;

  constructor(
    code: ErrorCode,
    statusCode: number = 400,
    message?: string,
    details?: Record<string, unknown>
  ) {
    super(message || ErrorMessages[code]);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
    this.name = 'ApiError';
  }

  static notFound(code: ErrorCode = ErrorCode.NOT_FOUND, details?: Record<string, unknown>): ApiError {
    return new ApiError(code, 404, undefined, details);
  }

  static badRequest(code: ErrorCode = ErrorCode.BAD_REQUEST, details?: Record<string, unknown>): ApiError {
    return new ApiError(code, 400, undefined, details);
  }

  static conflict(code: ErrorCode = ErrorCode.CONFLICT, details?: Record<string, unknown>): ApiError {
    return new ApiError(code, 409, undefined, details);
  }

  static validation(message: string, details?: Record<string, unknown>): ApiError {
    return new ApiError(ErrorCode.VALIDATION_ERROR, 400, message, details);
  }

  static internal(message?: string): ApiError {
    return new ApiError(ErrorCode.INTERNAL_ERROR, 500, message);
  }
}

export function sendSuccess<T>(res: Response, data: T, statusCode: number = 200): void {
  const response: ApiResponse<T> = {
    success: true,
    data,
    meta: {
      requestId: uuidv4(),
      timestamp: new Date().toISOString(),
    },
  };
  res.status(statusCode).json(response);
}

export function sendError(res: Response, error: ApiError | Error): void {
  if (error instanceof ApiError) {
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: error.code,
        message: error.message,
        details: error.details,
      },
      meta: {
        requestId: uuidv4(),
        timestamp: new Date().toISOString(),
      },
    };
    res.status(error.statusCode).json(response);
  } else {
    console.error('Unexpected error:', error);
    const response: ApiResponse<null> = {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: 'An unexpected error occurred',
      },
      meta: {
        requestId: uuidv4(),
        timestamp: new Date().toISOString(),
      },
    };
    res.status(500).json(response);
  }
}

export function asyncHandler(
  fn: (req: any, res: Response, next: any) => Promise<any>
): (req: any, res: Response, next: any) => void {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch((error) => {
      sendError(res, error);
    });
  };
}
