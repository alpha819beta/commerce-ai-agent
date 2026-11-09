import * as fs from 'fs';
import * as path from 'path';
import { resetAllStorageCaches } from '../utils/storage';

const TEST_DATA_DIR = path.join(__dirname, '../../data/seed');

// List of all data files used by the application
const DATA_FILES = [
  'products',
  'categories',
  'inventory_levels',
  'locations',
  'inventory_adjustments',
  'inventory_transfers',
  'orders',
  'shipments',
  'refunds',
  'transactions',
  'order_notes',
  'promotions',
  'promotion_usage',
  'automatic_discounts',
];

// Helper to clear all test data between tests
export function clearTestData(): void {
  // Ensure data directory exists
  if (!fs.existsSync(TEST_DATA_DIR)) {
    fs.mkdirSync(TEST_DATA_DIR, { recursive: true });
  }

  // Reset all data files
  for (const fileName of DATA_FILES) {
    const filePath = path.join(TEST_DATA_DIR, `${fileName}.json`);
    const initial = {
      version: '1.0.0',
      lastModified: new Date().toISOString(),
      data: [],
    };
    fs.writeFileSync(filePath, JSON.stringify(initial, null, 2));
  }

  // Invalidate all Storage instance caches so they re-read from disk
  resetAllStorageCaches();
}

// Clear data before all tests
beforeAll(() => {
  clearTestData();
});

// Clear data after each test suite
afterAll(() => {
  clearTestData();
});
