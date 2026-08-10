/**
 * jsonDb — Generic JSON file database adapter
 *
 * Each "collection" maps to one JSON file on disk.
 * Supports: readAll, findById, upsert, remove, clear.
 *
 * All operations are async and safe (won't throw on missing files).
 */

import fs from 'fs/promises';
import path from 'path';

/**
 * Creates a collection bound to a specific JSON file.
 * @param {string} filePath - Absolute path to the .json file
 * @returns {Collection}
 */
export function createCollection(filePath) {
  // Ensure directory exists on first use
  const dir = path.dirname(filePath);
  fs.mkdir(dir, { recursive: true }).catch(() => {});

  async function readAll() {
    try {
      const raw = await fs.readFile(filePath, 'utf8');
      return JSON.parse(raw);
    } catch {
      return [];
    }
  }

  async function writeAll(data) {
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
  }

  return {
    /** Returns all records */
    async getAll() {
      return readAll();
    },

    /** Finds a single record by id field */
    async findById(id) {
      const all = await readAll();
      return all.find((item) => item.id === id) ?? null;
    },

    /** Finds records matching a predicate */
    async findWhere(predicate) {
      const all = await readAll();
      return all.filter(predicate);
    },

    /** Insert or update a record (matched by id) */
    async upsert(record) {
      const all = await readAll();
      const idx = all.findIndex((item) => item.id === record.id);
      if (idx >= 0) {
        all[idx] = record;
      } else {
        all.push(record);
      }
      await writeAll(all);
      return record;
    },

    /** Replace the entire collection */
    async replaceAll(records) {
      await writeAll(records);
    },

    /** Delete a record by id. Returns true if found and deleted. */
    async remove(id) {
      const all = await readAll();
      const filtered = all.filter((item) => item.id !== id);
      if (filtered.length === all.length) return false;
      await writeAll(filtered);
      return true;
    },

    /** Wipe all records */
    async clear() {
      await writeAll([]);
    },

    /** Check if a record exists */
    async exists(id) {
      const record = await this.findById(id);
      return record !== null;
    },
  };
}
