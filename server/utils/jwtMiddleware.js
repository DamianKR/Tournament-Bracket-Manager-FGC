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
import { users } from '../db/collections.js';

export const JWT_SECRET =
  process.env.JWT_SECRET || 'bracket-local-dev-secret-change-for-production';
export const JWT_EXPIRY = '24h';

function extractToken(req) {
  const auth = req.headers.authorization;
  if (auth && auth.startsWith('Bearer ')) return auth.slice(7);
  return null;
}

/**
 * Requiere token válido. Pone req.user con los datos actuales del usuario
 * en la base de datos, sobreescribiendo el rol del JWT para evitar
 * problemas de tokens stale (ej. usuario promovido a superadmin y el
 * token aún dice 'admin').
 */
export async function requireAuth(req, res, next) {
  const token = extractToken(req);
  if (!token) return res.status(401).json({ error: 'Authentication required' });

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const user = await users.findById(decoded.userId);

    if (!user || !user.isActive) {
      return res.status(401).json({ error: 'User not found or disabled' });
    }

    // Mezclar token con datos actuales de DB. Los datos de DB ganan
    // para rol, comunidad, etc., pero conservamos userId del token.
    req.user = {
      ...decoded,
      ...user,
      userId: user.id,
    };

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

/**
 * Adjunta user si hay token válido, pero no bloquea si no hay.
 * También refresca el usuario desde DB para tener rol/comunidad actual.
 */
export async function optionalAuth(req, res, next) {
  const token = extractToken(req);
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = await users.findById(decoded.userId);
      if (user) {
        req.user = { ...decoded, ...user, userId: user.id };
      }
    } catch {
      // token inválido — simplemente no hay user
    }
  }
  next();
}
