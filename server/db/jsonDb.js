/**
 * jsonDb — Generic JSON file database adapter
 *
 * Each "collection" maps to one JSON file on disk.
 * Supports: readAll, findById, upsert, remove, clear.
 *
 * All operations are async and safe (won't throw on missing files).
 *
 * Write safety: every mutation (upsert, remove, replaceAll, clear) is
 * serialised through a per-file async queue so concurrent Express requests
 * never interleave reads and writes, preventing the "lost update / file
 * corruption" race condition that could erase records in large collections
 * like league_matches.json.
 */

import fs from 'fs/promises';
import path from 'path';

// ── Per-file write queue ───────────────────────────────────────────────────
// Maps absolute file path → tail of the promise chain for that file.
// All mutations chain onto this promise, so they are strictly sequential.
const writeQueues = new Map();

/**
 * Run `fn` exclusively for `filePath`, waiting for any in-progress mutation
 * on the same file to finish first.
 */
function withFileLock(filePath, fn) {
  const prev = writeQueues.get(filePath) ?? Promise.resolve();
  // Build next tail: wait for previous, then run fn, always resolve (never
  // let a thrown error break the chain for subsequent callers).
  const next = prev.then(fn).catch(err => { throw err; });
  // Store the tail without the thrown-error path so the queue keeps moving
  // even if this mutation throws.
  writeQueues.set(filePath, next.catch(() => {}));
  return next;
}

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
    const content = JSON.stringify(data, null, 2);
    // Write to a temp file first, then rename for atomicity.
    // This prevents a concurrent read from seeing a half-written file.
    const tmpPath = filePath + '.tmp';
    await fs.writeFile(tmpPath, content, 'utf8');
    try {
      await fs.rename(tmpPath, filePath);
    } catch {
      // rename can fail on Windows when the destination is locked.
      // Fall back to a direct write (still safe because the write lock above
      // ensures we are the only writer at this moment).
      await fs.writeFile(filePath, content, 'utf8');
      await fs.unlink(tmpPath).catch(() => {});
    }
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

    /**
     * Returns all records whose top-level field `fieldName` equals `value`.
     * Mirrors the Supabase adapter's `getByField` which filters at the DB level.
     */
    async getByField(fieldName, value) {
      const all = await readAll();
      return all.filter((item) => item[fieldName] === value);
    },

    /** Insert or update a record (matched by id) */
    async upsert(record) {
      return withFileLock(filePath, async () => {
        const all = await readAll();
        const idx = all.findIndex((item) => item.id === record.id);
        if (idx >= 0) {
          all[idx] = record;
        } else {
          all.push(record);
        }
        await writeAll(all);
        return record;
      });
    },

    /** Replace the entire collection */
    async replaceAll(records) {
      return withFileLock(filePath, () => writeAll(records));
    },

    /** Delete a record by id. Returns true if found and deleted. */
    async remove(id) {
      return withFileLock(filePath, async () => {
        const all = await readAll();
        const filtered = all.filter((item) => item.id !== id);
        if (filtered.length === all.length) return false;
        await writeAll(filtered);
        return true;
      });
    },

    /** Wipe all records */
    async clear() {
      return withFileLock(filePath, () => writeAll([]));
    },

    /** Check if a record exists */
    async exists(id) {
      const record = await this.findById(id);
      return record !== null;
    },
  };
}
