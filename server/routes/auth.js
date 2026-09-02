/**
 * Auth routes
 *
 * POST   /api/auth/login           — login con username + password → JWT
 * POST   /api/auth/logout          — confirma logout (el token se borra client-side)
 * GET    /api/auth/me              — retorna usuario actual desde el token
 * GET    /api/auth/status          — indica si se necesita setup inicial
 * POST   /api/auth/setup           — crea el PRIMER admin (solo si no hay usuarios)
 *
 * Gestión de usuarios (solo admin):
 * GET    /api/auth/users           — lista todos los usuarios (sin passwordHash)
 * POST   /api/auth/users           — crea cuenta vinculada a un participant
 * PUT    /api/auth/users/:id       — actualiza username / password / isActive / role
 * DELETE /api/auth/users/:id       — desactiva cuenta (no la borra)
 *
 * Migración → Supabase:
 *   Reemplazar bcrypt + jwt propios por supabase.auth.signInWithPassword()
 *   y supabase.auth.admin.createUser(). Roles en user_metadata o tabla profiles.
 */

import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { JWT_SECRET, JWT_EXPIRY, requireAuth, requireAdmin } from '../utils/jwtMiddleware.js';
import { users } from '../db/collections.js';
import { getNotificationsForRecipient } from '../services/notificationService.js';

const router = Router();
const SALT_ROUNDS = 12;

// ── Helpers ──────────────────────────────────────────────────────────────

function generateId() {
  return `user_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

/** Nunca devolver el hash al cliente. */
function safeUser(user) {
  const { passwordHash: _omit, ...safe } = user;
  return safe;
}

function signToken(user) {
  return jwt.sign(
    {
      userId: user.id,
      username: user.username,
      role: user.role,
      participantId: user.participantId ?? null,
      communityId: user.communityId ?? null,
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRY }
  );
}

// ── GET /api/auth/status ──────────────────────────────────────────────────
// Indica si el sistema todavía no tiene usuarios (necesita setup).

router.get('/status', async (req, res) => {
  const all = await users.getAll();
  res.json({ needsSetup: all.length === 0, userCount: all.length });
});

// ── POST /api/auth/setup ──────────────────────────────────────────────────
// Solo funciona cuando no hay ningún usuario. Crea el primer admin.

router.post('/setup', async (req, res) => {
  const all = await users.getAll();
  if (all.length > 0) {
    return res.status(409).json({ error: 'Setup already completed. Use admin account to manage users.' });
  }

  const { username, password } = req.body;
  if (!username?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'Username and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const admin = {
    id: generateId(),
    participantId: null,
    username: username.trim().toLowerCase(),
    passwordHash,
    role: 'superadmin',
    communityId: 'community_fgc_santa_clara',
    isActive: true,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };

  await users.upsert(admin);
  const token = signToken(admin);
  res.status(201).json({ token, user: safeUser(admin) });
});

// ── POST /api/auth/login ──────────────────────────────────────────────────

router.post('/login', async (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password are required' });
  }

  const all = await users.getAll();

  if (all.length === 0) {
    return res.status(403).json({
      error: 'No users configured. Complete setup first.',
      needsSetup: true,
    });
  }

  const user = all.find(u => u.username === username.trim().toLowerCase());
  if (!user) return res.status(401).json({ error: 'Invalid credentials' });
  if (!user.isActive) return res.status(403).json({ error: 'Account is disabled' });

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Invalid credentials' });

  user.lastLoginAt = new Date().toISOString();
  await users.upsert(user);

  const token = signToken(user);

  // Load unread notifications on login so the user sees them immediately
  let notifications = [];
  try {
    if (user.participantId) {
      notifications = await getNotificationsForRecipient(user.participantId);
    }
  } catch (err) {
    console.error('[Auth] Failed to load notifications on login:', err);
  }

  res.json({
    token,
    user: safeUser(user),
    notifications,
  });
});

// ── POST /api/auth/logout ─────────────────────────────────────────────────

router.post('/logout', (req, res) => {
  // El cliente borra el token. Aquí solo confirmamos.
  res.json({ ok: true });
});

// ── GET /api/auth/me ──────────────────────────────────────────────────────

router.get('/me', requireAuth, async (req, res) => {
  const user = await users.findById(req.user.userId);
  if (!user || !user.isActive) {
    return res.status(401).json({ error: 'User not found or disabled' });
  }
  res.json(safeUser(user));
});

// ── PUT /api/auth/me/password ─────────────────────────────────────────────
// Cualquier usuario autenticado puede cambiar su propia contraseña.

router.put('/me/password', requireAuth, async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'currentPassword and newPassword are required' });
  }
  if (newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }

  const user = await users.findById(req.user.userId);
  if (!user || !user.isActive) return res.status(401).json({ error: 'User not found' });

  const valid = await bcrypt.compare(currentPassword, user.passwordHash);
  if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

  user.passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
  user.updatedAt = new Date().toISOString();
  await users.upsert(user);

  res.json({ ok: true, message: 'Password updated successfully' });
});

// ── GET /api/auth/users ───────────────────────────────────────────────────

router.get('/users', requireAuth, requireAdmin, async (req, res) => {
  const all = await users.getAll();
  res.json(all.map(safeUser));
});

// ── POST /api/auth/users ──────────────────────────────────────────────────
// Admin crea una cuenta para un participant existente.

router.post('/users', requireAuth, requireAdmin, async (req, res) => {
  const { participantId, username, password, role = 'user', communityId } = req.body;

  if (!participantId || !username?.trim() || !password?.trim()) {
    return res.status(400).json({ error: 'participantId, username and password are required' });
  }
  if (password.length < 6) {
    return res.status(400).json({ error: 'Password must be at least 6 characters' });
  }
  if (!['superadmin', 'community_admin', 'admin', 'user'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role' });
  }

  // Role privilege checks
  if (role === 'superadmin' && req.user.role !== 'superadmin') {
    return res.status(403).json({ error: 'Only superadmin can create superadmin users' });
  }
  if (['community_admin', 'admin'].includes(role) && !['superadmin', 'community_admin'].includes(req.user.role)) {
    return res.status(403).json({ error: 'Only community owners can create admin users' });
  }

  // Community scope
  const targetCommunityId = req.user.role === 'superadmin'
    ? (communityId || req.user.communityId || 'community_fgc_santa_clara')
    : (req.user.communityId || 'community_fgc_santa_clara');

  const all = await users.getAll();

  if (all.find(u => u.participantId === participantId)) {
    return res.status(409).json({ error: 'This participant already has an account' });
  }
  if (all.find(u => u.username === username.trim().toLowerCase())) {
    return res.status(409).json({ error: 'Username already taken' });
  }

  const passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  const newUser = {
    id: generateId(),
    participantId,
    username: username.trim().toLowerCase(),
    passwordHash,
    role,
    communityId: targetCommunityId,
    isActive: true,
    createdAt: new Date().toISOString(),
    lastLoginAt: null,
  };

  await users.upsert(newUser);
  res.status(201).json(safeUser(newUser));
});

// ── PUT /api/auth/users/:id ───────────────────────────────────────────────

router.put('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const { username, password, isActive, role } = req.body;
  const isCommunityOwner = ['superadmin', 'community_admin'].includes(req.user.role);

  const user = await users.findById(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  if (username !== undefined) {
    const newUsername = username.trim().toLowerCase();
    const all = await users.getAll();
    if (all.find(u => u.id !== id && u.username === newUsername)) {
      return res.status(409).json({ error: 'Username already taken' });
    }
    user.username = newUsername;
  }
  if (password !== undefined && password.trim()) {
    if (password.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    user.passwordHash = await bcrypt.hash(password, SALT_ROUNDS);
  }

  // Only community owners (or superadmin) can change role / isActive
  if (!isCommunityOwner && (isActive !== undefined || role !== undefined)) {
    return res.status(403).json({ error: 'Only community owners can change role or active status' });
  }

  if (isActive !== undefined) user.isActive = !!isActive;
  if (role !== undefined && ['superadmin', 'community_admin', 'admin', 'user'].includes(role)) {
    if (role === 'superadmin' && req.user.role !== 'superadmin') {
      return res.status(403).json({ error: 'Only superadmin can promote to superadmin' });
    }
    user.role = role;
  }
  user.updatedAt = new Date().toISOString();

  await users.upsert(user);
  res.json(safeUser(user));
});

// ── DELETE /api/auth/users/:id ────────────────────────────────────────────
// Borra la cuenta permanentemente (conserva historial en los brackets).

router.delete('/users/:id', requireAuth, requireAdmin, async (req, res) => {
  const { id } = req.params;
  const user = await users.findById(id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  await users.remove(id);
  res.json({ ok: true });
});

export default router;
