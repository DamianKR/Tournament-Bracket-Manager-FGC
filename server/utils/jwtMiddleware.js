/**
 * JWT Middleware
 *
 * Provides:
 *   requireAuth          — cualquier usuario autenticado
 *   requireAdmin         — superadmin, community_admin o admin
 *   requireSuperAdmin    — solo superadmin
 *   requireCommunityAdmin— superadmin o community_admin
 *   optionalAuth         — adjunta user si hay token, pero no bloquea si no lo hay
 *
 * Ruta de migración → Supabase:
 *   Supabase genera sus propios JWT. Reemplazar jwt.verify() por
 *   supabase.auth.getUser(token) y extraer los roles de user_metadata.
 */

import jwt from 'jsonwebtoken';

export const JWT_SECRET =
  process.env.JWT_SECRET || 'bracket-local-dev-secret-change-for-production';
export const JWT_EXPIRY = '24h';

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

/** Requiere token válido. Pone req.user con el payload del JWT. */
export function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    req.user = jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
}

const ALL_ADMIN_ROLES = ['superadmin', 'community_admin', 'admin'];
const COMMUNITY_OWNER_ROLES = ['superadmin', 'community_admin'];

/** Cualquier usuario con privilegios admin (admin asistente, community owner o superadmin). */
export function requireAdmin(req, res, next) {
  if (!req.user || !ALL_ADMIN_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
}

/** Solo superadmin. */
export function requireSuperAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Superadmin access required' });
  }
  next();
}

/** Community owner (community_admin) o superadmin. Puede dar/quitar admin. */
export function requireCommunityAdmin(req, res, next) {
  if (!req.user || !COMMUNITY_OWNER_ROLES.includes(req.user.role)) {
    return res.status(403).json({ error: 'Community owner access required' });
  }
  next();
}

/** Adjunta user si hay token válido, pero no bloquea si no hay. */
export function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      req.user = jwt.verify(token, JWT_SECRET);
    } catch {
      // token inválido — simplemente no hay user
    }
  }
  next();
}
