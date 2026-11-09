import * as fs from 'fs';
import * as path from 'path';

const SEED_DIR = path.join(__dirname, '../../data/seed');
const DYNAMIC_DIR = path.join(__dirname, '../../data/dynamic');

// Ensure data directories exist
if (!fs.existsSync(SEED_DIR)) {
  fs.mkdirSync(SEED_DIR, { recursive: true });
}
if (!fs.existsSync(DYNAMIC_DIR)) {
  fs.mkdirSync(DYNAMIC_DIR, { recursive: true });
}

// Global flag to track if we're using dynamic mode
let useDynamicMode = false;

// Registry of all Storage instances for cache invalidation
const storageInstances: Set<Storage<any>> = new Set();

// Global function to reset all storage caches (useful for testing)
export function resetAllStorageCaches(): void {
  for (const instance of storageInstances) {
    instance.invalidateCache();
  }
}

// Enable dynamic mode - copies seed data to dynamic on first write
export function enableDynamicMode(): void {
  useDynamicMode = true;
}

// Get the current data directory based on mode
function getDataDir(): string {
  return useDynamicMode ? DYNAMIC_DIR : SEED_DIR;
}

// Copy file from seed to dynamic if it doesn't exist in dynamic
function ensureDynamicFile(filename: string): void {
  if (!useDynamicMode) return;
  
  const seedPath = path.join(SEED_DIR, `${filename}.json`);
  const dynamicPath = path.join(DYNAMIC_DIR, `${filename}.json`);
  
  // If dynamic file doesn't exist and seed file does, copy it
  if (!fs.existsSync(dynamicPath) && fs.existsSync(seedPath)) {
    try {
      fs.copyFileSync(seedPath, dynamicPath);
      console.log(`Copied ${filename}.json from seed to dynamic`);
    } catch (error) {
      console.error(`Error copying ${filename}.json:`, error);
    }
  }
}

export interface StorageFile<T> {
  version: string;
  lastModified: string;
  data: T;
}

export class Storage<T extends { id: string }> {
  private filename: string;
  private filePath!: string; // Definite assignment - set in constructor via updateFilePath()
  private cache: T[] | null = null;
  private lastRead: number = 0;
  private cacheTimeout: number = 1000; // 1 second cache

  constructor(filename: string) {
    this.filename = filename;
    this.updateFilePath();
    this.ensureFile();
    // Register this instance for global cache invalidation
    storageInstances.add(this);
  }

  private updateFilePath(): void {
    this.filePath = path.join(getDataDir(), `${this.filename}.json`);
  }

  // Invalidate the cache to force re-reading from disk
  invalidateCache(): void {
    this.cache = null;
    this.lastRead = 0;
  }

  private ensureFile(): void {
    // Update file path in case dynamic mode was enabled
    this.updateFilePath();
    
    // If using dynamic mode and file doesn't exist, copy from seed first
    if (useDynamicMode && !fs.existsSync(this.filePath)) {
      ensureDynamicFile(this.filename);
      this.updateFilePath();
    }
    
    if (!fs.existsSync(this.filePath)) {
      const initial: StorageFile<T[]> = {
        version: '1.0.0',
        lastModified: new Date().toISOString(),
        data: [],
      };
      fs.writeFileSync(this.filePath, JSON.stringify(initial, null, 2));
    }
  }

  private readFile(): StorageFile<T[]> {
    // Update file path in case dynamic mode was enabled
    this.updateFilePath();
    
    // If using dynamic mode and file doesn't exist, copy from seed first
    if (useDynamicMode && !fs.existsSync(this.filePath)) {
      ensureDynamicFile(this.filename);
      this.updateFilePath();
    }
    
    try {
      const content = fs.readFileSync(this.filePath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      console.error(`Error reading file ${this.filePath}:`, error);
      return { version: '1.0.0', lastModified: new Date().toISOString(), data: [] };
    }
  }

  private writeFile(data: T[]): void {
    // If using dynamic mode, ensure file exists in dynamic folder
    if (useDynamicMode) {
      ensureDynamicFile(this.filename);
      this.updateFilePath();
    }
    
    const file: StorageFile<T[]> = {
      version: '1.0.0',
      lastModified: new Date().toISOString(),
      data,
    };
    fs.writeFileSync(this.filePath, JSON.stringify(file, null, 2));
    this.cache = data;
    this.lastRead = Date.now();
  }

  getAll(): T[] {
    // Update file path in case mode changed
    this.updateFilePath();
    
    const now = Date.now();
    if (this.cache && now - this.lastRead < this.cacheTimeout) {
      return [...this.cache];
    }
    const file = this.readFile();
    this.cache = file.data;
    this.lastRead = now;
    return [...file.data];
  }

  getById(id: string): T | undefined {
    const items = this.getAll();
    return items.find((item) => item.id === id);
  }

  getByIds(ids: string[]): T[] {
    const items = this.getAll();
    return items.filter((item) => ids.includes(item.id));
  }

  create(item: T): T {
    const items = this.getAll();
    const existing = items.find((i) => i.id === item.id);
    if (existing) {
      throw new Error(`Item with id ${item.id} already exists`);
    }
    items.push(item);
    this.writeFile(items);
    return item;
  }

  createMany(newItems: T[]): T[] {
    const items = this.getAll();
    const existingIds = new Set(items.map((i) => i.id));
    for (const item of newItems) {
      if (existingIds.has(item.id)) {
        throw new Error(`Item with id ${item.id} already exists`);
      }
    }
    items.push(...newItems);
    this.writeFile(items);
    return newItems;
  }

  update(id: string, updates: Partial<T>): T | undefined {
    const items = this.getAll();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      return undefined;
    }
    const updated = { ...items[index], ...updates, id };
    items[index] = updated;
    this.writeFile(items);
    return updated;
  }

  upsert(item: T): { item: T; created: boolean } {
    const items = this.getAll();
    const index = items.findIndex((i) => i.id === item.id);
    if (index === -1) {
      items.push(item);
      this.writeFile(items);
      return { item, created: true };
    }
    items[index] = item;
    this.writeFile(items);
    return { item, created: false };
  }

  delete(id: string): boolean {
    const items = this.getAll();
    const index = items.findIndex((item) => item.id === id);
    if (index === -1) {
      return false;
    }
    items.splice(index, 1);
    this.writeFile(items);
    return true;
  }

  deleteMany(ids: string[]): number {
    const items = this.getAll();
    const idsSet = new Set(ids);
    const filtered = items.filter((item) => !idsSet.has(item.id));
    const deletedCount = items.length - filtered.length;
    if (deletedCount > 0) {
      this.writeFile(filtered);
    }
    return deletedCount;
  }

  find(predicate: (item: T) => boolean): T[] {
    return this.getAll().filter(predicate);
  }

  findOne(predicate: (item: T) => boolean): T | undefined {
    return this.getAll().find(predicate);
  }

  count(predicate?: (item: T) => boolean): number {
    const items = this.getAll();
    if (!predicate) return items.length;
    return items.filter(predicate).length;
  }

  clear(): void {
    this.writeFile([]);
  }

  exists(id: string): boolean {
    return this.getById(id) !== undefined;
  }

  bulkUpdate(updates: Array<{ id: string; data: Partial<T> }>): T[] {
    const items = this.getAll();
    const updatedItems: T[] = [];

    for (const { id, data } of updates) {
      const index = items.findIndex((item) => item.id === id);
      if (index !== -1) {
        const updated = { ...items[index], ...data, id };
        items[index] = updated;
        updatedItems.push(updated);
      }
    }

    if (updatedItems.length > 0) {
      this.writeFile(items);
    }

    return updatedItems;
  }
}

// Pagination helper
export interface PaginationOptions {
  page: number;
  limit: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export function paginate<T>(
  items: T[],
  options: PaginationOptions
): {
  data: T[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
} {
  const { page, limit, sortBy, sortOrder = 'asc' } = options;
  
  let sorted = [...items];
  
  if (sortBy) {
    sorted.sort((a, b) => {
      const aVal = (a as Record<string, unknown>)[sortBy];
      const bVal = (b as Record<string, unknown>)[sortBy];
      
      if (aVal === undefined || aVal === null) return 1;
      if (bVal === undefined || bVal === null) return -1;
      
      let comparison = 0;
      if (typeof aVal === 'string' && typeof bVal === 'string') {
        comparison = aVal.localeCompare(bVal);
      } else if (typeof aVal === 'number' && typeof bVal === 'number') {
        comparison = aVal - bVal;
      } else {
        comparison = String(aVal).localeCompare(String(bVal));
      }
      
      return sortOrder === 'desc' ? -comparison : comparison;
    });
  }

  const totalItems = sorted.length;
  const totalPages = Math.ceil(totalItems / limit) || 1;
  const safePage = Math.max(1, Math.min(page, totalPages));
  const startIndex = (safePage - 1) * limit;
  const data = sorted.slice(startIndex, startIndex + limit);

  return {
    data,
    pagination: {
      page: safePage,
      limit,
      totalItems,
      totalPages,
      hasNextPage: safePage < totalPages,
      hasPrevPage: safePage > 1,
    },
  };
}
