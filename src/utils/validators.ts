import { ApiError, ErrorCode } from './errors';

export interface ValidationRule {
  field: string;
  value: unknown;
  rules: Array<{
    type: 'required' | 'string' | 'number' | 'boolean' | 'array' | 'object' | 'email' | 'min' | 'max' | 'minLength' | 'maxLength' | 'enum' | 'pattern' | 'custom';
    param?: unknown;
    message?: string;
  }>;
}

export function validate(rules: ValidationRule[]): void {
  const errors: Record<string, string[]> = {};

  for (const { field, value, rules: fieldRules } of rules) {
    const fieldErrors: string[] = [];

    for (const rule of fieldRules) {
      switch (rule.type) {
        case 'required':
          if (value === undefined || value === null || value === '') {
            fieldErrors.push(rule.message || `${field} is required`);
          }
          break;

        case 'string':
          if (value !== undefined && value !== null && typeof value !== 'string') {
            fieldErrors.push(rule.message || `${field} must be a string`);
          }
          break;

        case 'number':
          if (value !== undefined && value !== null && typeof value !== 'number') {
            fieldErrors.push(rule.message || `${field} must be a number`);
          }
          break;

        case 'boolean':
          if (value !== undefined && value !== null && typeof value !== 'boolean') {
            fieldErrors.push(rule.message || `${field} must be a boolean`);
          }
          break;

        case 'array':
          if (value !== undefined && value !== null && !Array.isArray(value)) {
            fieldErrors.push(rule.message || `${field} must be an array`);
          }
          break;

        case 'object':
          if (value !== undefined && value !== null && (typeof value !== 'object' || Array.isArray(value))) {
            fieldErrors.push(rule.message || `${field} must be an object`);
          }
          break;

        case 'email':
          if (value !== undefined && value !== null && typeof value === 'string') {
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(value)) {
              fieldErrors.push(rule.message || `${field} must be a valid email`);
            }
          }
          break;

        case 'min':
          if (typeof value === 'number' && typeof rule.param === 'number' && value < rule.param) {
            fieldErrors.push(rule.message || `${field} must be at least ${rule.param}`);
          }
          break;

        case 'max':
          if (typeof value === 'number' && typeof rule.param === 'number' && value > rule.param) {
            fieldErrors.push(rule.message || `${field} must be at most ${rule.param}`);
          }
          break;

        case 'minLength':
          if (typeof value === 'string' && typeof rule.param === 'number' && value.length < rule.param) {
            fieldErrors.push(rule.message || `${field} must be at least ${rule.param} characters`);
          }
          if (Array.isArray(value) && typeof rule.param === 'number' && value.length < rule.param) {
            fieldErrors.push(rule.message || `${field} must have at least ${rule.param} items`);
          }
          break;

        case 'maxLength':
          if (typeof value === 'string' && typeof rule.param === 'number' && value.length > rule.param) {
            fieldErrors.push(rule.message || `${field} must be at most ${rule.param} characters`);
          }
          if (Array.isArray(value) && typeof rule.param === 'number' && value.length > rule.param) {
            fieldErrors.push(rule.message || `${field} must have at most ${rule.param} items`);
          }
          break;

        case 'enum':
          if (value !== undefined && value !== null && Array.isArray(rule.param) && !rule.param.includes(value)) {
            fieldErrors.push(rule.message || `${field} must be one of: ${rule.param.join(', ')}`);
          }
          break;

        case 'pattern':
          if (typeof value === 'string' && rule.param instanceof RegExp && !rule.param.test(value)) {
            fieldErrors.push(rule.message || `${field} format is invalid`);
          }
          break;

        case 'custom':
          if (typeof rule.param === 'function') {
            const customError = rule.param(value);
            if (customError) {
              fieldErrors.push(customError);
            }
          }
          break;
      }
    }

    if (fieldErrors.length > 0) {
      errors[field] = fieldErrors;
    }
  }

  if (Object.keys(errors).length > 0) {
    throw ApiError.validation('Validation failed', { fields: errors });
  }
}

export function validateRequired(data: Record<string, unknown>, requiredFields: string[]): void {
  const missing: string[] = [];
  for (const field of requiredFields) {
    if (data[field] === undefined || data[field] === null || data[field] === '') {
      missing.push(field);
    }
  }
  if (missing.length > 0) {
    throw ApiError.validation(`Missing required fields: ${missing.join(', ')}`, { missingFields: missing });
  }
}

export function validateEnum<T extends string>(value: unknown, allowedValues: T[], fieldName: string): T {
  if (!allowedValues.includes(value as T)) {
    throw ApiError.validation(
      `${fieldName} must be one of: ${allowedValues.join(', ')}`,
      { field: fieldName, allowedValues }
    );
  }
  return value as T;
}

export function validatePositiveNumber(value: unknown, fieldName: string): number {
  if (typeof value !== 'number' || value < 0) {
    throw ApiError.validation(`${fieldName} must be a positive number`, { field: fieldName });
  }
  return value;
}

export function validateUUID(value: unknown, fieldName: string): string {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (typeof value !== 'string' || !uuidRegex.test(value)) {
    throw ApiError.validation(`${fieldName} must be a valid UUID`, { field: fieldName });
  }
  return value;
}

export function validateDateString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw ApiError.validation(`${fieldName} must be a string`, { field: fieldName });
  }
  const date = new Date(value);
  if (isNaN(date.getTime())) {
    throw ApiError.validation(`${fieldName} must be a valid date string`, { field: fieldName });
  }
  return value;
}

export function parseQueryInt(value: unknown, defaultValue: number): number {
  if (value === undefined || value === null) return defaultValue;
  const parsed = parseInt(String(value), 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

export function parseQueryBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null) return undefined;
  if (value === 'true' || value === '1') return true;
  if (value === 'false' || value === '0') return false;
  return undefined;
}

export function parseQueryArray(value: unknown): string[] | undefined {
  if (value === undefined || value === null) return undefined;
  if (Array.isArray(value)) return value.map(String);
  if (typeof value === 'string') return value.split(',').map(s => s.trim()).filter(Boolean);
  return undefined;
}

export function generateSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
