-- ═══════════════════════════════════════════════════════════════════════════
-- Schema de Supabase para Bracket Project
--
-- Ejecuta este SQL en: Supabase Dashboard → SQL Editor → New Query
--
-- Diseño: cada colección JSON se mapea a una tabla con:
--   id   TEXT PRIMARY KEY   ← el mismo id que usas en los JSON
--   data JSONB NOT NULL     ← el objeto completo tal cual
--
-- Esto permite migrar sin cambiar la estructura de datos.
-- ═══════════════════════════════════════════════════════════════════════════

-- ── Tablas principales ────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tournaments (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS participants (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS leagues (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

-- ── Partidos separados por tipo ───────────────────────────────────────────

CREATE TABLE IF NOT EXISTS tournament_matches (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS league_matches (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS ranked_matches (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

-- ── Duelos ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS duels (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

CREATE TABLE IF NOT EXISTS duel_settings (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

-- ── Auth / Usuarios ───────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS users (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

-- Notificaciones
CREATE TABLE IF NOT EXISTS notifications (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

-- ── Legacy ────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS matches (
  id   TEXT PRIMARY KEY,
  data JSONB NOT NULL
);

-- ═══════════════════════════════════════════════════════════════════════════
-- Row Level Security (RLS)
--
-- El servidor Express usa la SERVICE_KEY que bypasa RLS.
-- Habilitamos RLS en todas las tablas para que la anon key
-- (usada desde el frontend si alguna vez se llama directo) no tenga acceso.
-- ═══════════════════════════════════════════════════════════════════════════

ALTER TABLE tournaments        ENABLE ROW LEVEL SECURITY;
ALTER TABLE participants       ENABLE ROW LEVEL SECURITY;
ALTER TABLE leagues            ENABLE ROW LEVEL SECURITY;
ALTER TABLE tournament_matches ENABLE ROW LEVEL SECURITY;
ALTER TABLE league_matches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE ranked_matches     ENABLE ROW LEVEL SECURITY;
ALTER TABLE duels              ENABLE ROW LEVEL SECURITY;
ALTER TABLE duel_settings      ENABLE ROW LEVEL SECURITY;
ALTER TABLE users              ENABLE ROW LEVEL SECURITY;
ALTER TABLE notifications      ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches            ENABLE ROW LEVEL SECURITY;

-- Permitir lectura pública de datos no sensibles (tournaments, participants, leagues)
-- El servidor usa service_role (no necesita políticas), pero si en el futuro
-- el frontend llama directo a Supabase, necesitará estas políticas.

CREATE POLICY "Public read tournaments"
  ON tournaments FOR SELECT USING (true);

CREATE POLICY "Public read participants"
  ON participants FOR SELECT USING (true);

CREATE POLICY "Public read leagues"
  ON leagues FOR SELECT USING (true);

CREATE POLICY "Public read ranked_matches"
  ON ranked_matches FOR SELECT USING (true);

-- users: sin acceso público (datos sensibles con password hash)
-- Todas las escrituras van por Express con service_role, así que no necesitan políticas.

-- ═══════════════════════════════════════════════════════════════════════════
-- Índices opcionales para búsquedas frecuentes
-- (añadir si las queries son lentas, no son necesarios al inicio)
-- ═══════════════════════════════════════════════════════════════════════════

-- CREATE INDEX IF NOT EXISTS idx_participants_elo
--   ON participants ((data->>'eloPoints'));

-- CREATE INDEX IF NOT EXISTS idx_tournaments_status
--   ON tournaments ((data->>'status'));

-- CREATE INDEX IF NOT EXISTS idx_leagues_status
--   ON leagues ((data->>'status'));
