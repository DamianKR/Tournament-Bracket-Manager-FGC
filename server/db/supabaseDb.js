/**
 * supabaseDb — Adaptador de Supabase con la misma interfaz que jsonDb.js
 *
 * Cada "colección" mapea a una tabla en Supabase Postgres.
 * Esquema de cada tabla:
 *   id   TEXT PRIMARY KEY
 *   data JSONB NOT NULL
 *
 * El objeto completo se guarda en la columna `data` como JSONB,
 * igual que en los archivos JSON locales. Esto permite migración
 * sin cambiar la estructura de datos ni las rutas de Express.
 *
 * Variables de entorno requeridas:
 *   SUPABASE_URL         — URL del proyecto (https://xxxx.supabase.co)
 *   SUPABASE_SERVICE_KEY — Service role key (solo en servidor, nunca en cliente)
 */

import { createClient } from '@supabase/supabase-js';

let _client = null;

function getClient() {
  if (_client) return _client;
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) {
    throw new Error(
      '[supabaseDb] Faltan variables de entorno: SUPABASE_URL y SUPABASE_SERVICE_KEY'
    );
  }
  _client = createClient(url, key, {
    auth: { persistSession: false },
  });
  return _client;
}

/**
 * Crea una colección enlazada a una tabla específica de Supabase.
 * La interfaz es idéntica a createCollection() de jsonDb.js.
 *
 * @param {string} tableName - Nombre de la tabla en Supabase
 * @returns {Collection}
 */
export function createSupabaseCollection(tableName) {
  return {
    /** Devuelve todos los registros de la tabla.
     *
     * Supabase/PostgREST aplica un límite implícito de 1000 filas por query
     * (configurable con db-max-rows; el valor por defecto del plan gratuito es 1000).
     * Si la tabla tiene más de 1000 registros y no usamos paginación, las filas
     * que superan ese límite no se devuelven — lo cual hacía que matches
     * recién actualizados (cuyos rows Postgres escribe al final del heap)
     * desaparecieran de la vista tras un report.
     *
     * Esta implementación pagina automáticamente hasta vaciar la tabla.
     */
    async getAll() {
      const PAGE_SIZE = 1000;
      const results = [];
      let from = 0;

      for (;;) {
        const { data, error } = await getClient()
          .from(tableName)
          .select('data')
          .order('id', { ascending: true })   // orden estable obligatorio para paginación correcta
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw new Error(`[supabaseDb.getAll:${tableName}] ${error.message}`);

        const page = data ?? [];
        for (const row of page) results.push(row.data);

        // Si devolvió menos de PAGE_SIZE estamos en la última página
        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      return results;
    },

    /** Encuentra un registro por su campo id */
    async findById(id) {
      const { data, error } = await getClient()
        .from(tableName)
        .select('data')
        .eq('id', id)
        .maybeSingle();
      if (error) throw new Error(`[supabaseDb.findById:${tableName}] ${error.message}`);
      return data?.data ?? null;
    },

    /** Encuentra registros que cumplan un predicado (filter en memoria) */
    async findWhere(predicate) {
      const all = await this.getAll();
      return all.filter(predicate);
    },

    /**
     * Devuelve todos los registros cuyo campo de primer nivel `fieldName`
     * (dentro de la columna JSONB `data`) sea igual a `value`.
     *
     * En Supabase usa un filtro de la forma  data->>'fieldName' = 'value'
     * y pagina automáticamente, evitando el límite de 1000 filas Y
     * transfiriendo solo los registros relevantes (no toda la tabla).
     *
     * Ejemplo: getByField('leagueId', 'league_123') →
     *   SELECT data FROM league_matches WHERE data->>'leagueId' = 'league_123'
     */
    async getByField(fieldName, value) {
      const PAGE_SIZE = 1000;
      const results = [];
      let from = 0;

      for (;;) {
        const { data, error } = await getClient()
          .from(tableName)
          .select('data')
          .eq(`data->>${fieldName}`, value)
          .order('id', { ascending: true })   // orden estable obligatorio para paginación correcta
          .range(from, from + PAGE_SIZE - 1);

        if (error) throw new Error(`[supabaseDb.getByField:${tableName}] ${error.message}`);

        const page = data ?? [];
        for (const row of page) results.push(row.data);

        if (page.length < PAGE_SIZE) break;
        from += PAGE_SIZE;
      }

      return results;
    },

    /** Inserta o actualiza un registro (por id) */
    async upsert(record) {
      const { error } = await getClient()
        .from(tableName)
        .upsert({ id: record.id, data: record }, { onConflict: 'id' });
      if (error) throw new Error(`[supabaseDb.upsert:${tableName}] ${error.message}`);
      return record;
    },

    /**
     * Reemplaza la colección completa.
     * Llama a la función SQL `replace_collection(table, records)` para atomicidad.
     * Si la función no existe todavía, hace truncate + insert por separado.
     */
    async replaceAll(records) {
      const client = getClient();

      // Paso 1: borrar todo (usando filter que siempre se cumple)
      const { error: delError } = await client
        .from(tableName)
        .delete()
        .gte('id', '');           // id >= '' es siempre verdadero para TEXT

      if (delError) throw new Error(`[supabaseDb.replaceAll:${tableName}] delete: ${delError.message}`);

      // Paso 2: insertar nuevos registros (si los hay)
      if (records.length === 0) return;

      const rows = records.map((r) => ({ id: r.id, data: r }));
      const { error: insError } = await client.from(tableName).insert(rows);
      if (insError) throw new Error(`[supabaseDb.replaceAll:${tableName}] insert: ${insError.message}`);
    },

    /** Elimina un registro por id. Devuelve true si existía. */
    async remove(id) {
      const { error, count } = await getClient()
        .from(tableName)
        .delete({ count: 'exact' })
        .eq('id', id);
      if (error) throw new Error(`[supabaseDb.remove:${tableName}] ${error.message}`);
      return (count ?? 0) > 0;
    },

    /** Elimina todos los registros de la tabla */
    async clear() {
      const { error } = await getClient()
        .from(tableName)
        .delete()
        .gte('id', '');
      if (error) throw new Error(`[supabaseDb.clear:${tableName}] ${error.message}`);
    },

    /** Verifica si existe un registro con ese id */
    async exists(id) {
      const record = await this.findById(id);
      return record !== null;
    },
  };
}
