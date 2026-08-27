/**
 * JWT Middleware
 *
 * Provides:
 *   requireAuth   — cualquier usuario autenticado
 *   requireAdmin  — solo role === 'admin'
 *   optionalAuth  — adjunta user si hay token, pero no bloquea si no lo hay
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

/** Requiere rol admin. Debe usarse DESPUÉS de requireAuth. */
export function requireAdmin(req, res, next) {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
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
