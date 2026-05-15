import { SafeJSON } from "./utils";

/**
 * Local Database Engine for LifeFlow
 * Provides a structured, table-based abstraction over localStorage
 */

export enum Table {
  TASKS = 'tasks',
  REMINDERS = 'reminders',
  SHOPPING_LISTS = 'shopping_lists',
  SETTINGS = 'settings',
  METRICS = 'metrics'
}

export class Database {
  private static prefix = 'lifeflow_db_';

  private static getTableKey(table: Table): string {
    return `${this.prefix}${table}`;
  }

  static getAllSync<T>(table: Table): T[] {
    const data = localStorage.getItem(this.getTableKey(table));
    return SafeJSON.parse(data, []);
  }

  static saveAllSync<T>(table: Table, data: T | T[]): void {
    const stringified = SafeJSON.stringify(data);
    if (stringified) {
      try {
        localStorage.setItem(this.getTableKey(table), stringified);
      } catch (error) {
        console.error(`Database Error: Failed to save to ${table}`, error);
      }
    }
  }

  static async getAll<T>(table: Table): Promise<T[]> {
    const data = localStorage.getItem(this.getTableKey(table));
    return SafeJSON.parse(data, []);
  }

  static async saveAll<T>(table: Table, data: T[]): Promise<void> {
    const stringified = SafeJSON.stringify(data);
    if (stringified) {
      try {
        localStorage.setItem(this.getTableKey(table), stringified);
      } catch (error) {
        console.error(`Database Error: Failed to save to ${table}`, error);
      }
    }
  }

  static async getById<T extends { id: string }>(table: Table, id: string): Promise<T | null> {
    const items = await this.getAll<T>(table);
    return items.find(item => item.id === id) || null;
  }

  static async insert<T extends { id: string }>(table: Table, item: T): Promise<void> {
    const items = await this.getAll<T>(table);
    items.push(item);
    await this.saveAll(table, items);
  }

  static async update<T extends { id: string }>(table: Table, id: string, updates: Partial<T>): Promise<void> {
    const items = await this.getAll<T>(table);
    const index = items.findIndex(item => item.id === id);
    if (index !== -1) {
      items[index] = { ...items[index], ...updates };
      await this.saveAll(table, items);
    }
  }

  static async delete(table: Table, id: string): Promise<void> {
    const items = await this.getAll<{ id: string }>(table);
    const filtered = items.filter(item => item.id !== id);
    await this.saveAll(table, filtered);
  }

  static async clear(table: Table): Promise<void> {
    localStorage.removeItem(this.getTableKey(table));
  }

  /**
   * Performance optimization for bulk operations
   */
  static async transaction<T>(table: Table, action: (items: T[]) => T[]): Promise<void> {
    const items = await this.getAll<T>(table);
    const result = action(items);
    await this.saveAll(table, result);
  }
}
