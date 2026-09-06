/**
 * Global Participants routes
 *
 * These are participants that exist independently of any tournament.
 * They can be reused across multiple tournaments.
 *
 * GET    /api/participants           — list all
 * GET    /api/participants/:id       — get one
 * POST   /api/participants           — create new participant
 * PUT    /api/participants/:id       — update participant (name, alias, avatarUrl)
 * DELETE /api/participants/:id       — delete participant
 *
 * Stats (updated by the frontend after a tournament completes):
 * POST   /api/participants/:id/stats — merge-update stats
 */

import { Router } from 'express';
import { participants, tournaments, leagues, leagueMatches, communities, users, membershipRequests } from '../db/collections.js';
import { validateParticipant } from '../models/participant.js';
import { requireAuth, requireAdmin, optionalAuth } from '../utils/jwtMiddleware.js';
import { filterByCommunity, isInUserScope, getTargetCommunityId, participantIdFor, canManageUser } from '../utils/communityScope.js';
import { createNotification } from '../services/notificationService.js';
import {
  migrateParticipantGames,
  setParticipantPrimaryGame,
  setParticipantGameMain,
  setParticipantGameList,
  getEffectiveElo,
} from '../utils/participantGames.js';

const router = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

const ADMIN_ROLES = ['superadmin', 'community_admin', 'admin'];
function isAdminRole(user) {
  return user && ADMIN_ROLES.includes(user.role);
}

/**
 * Un admin con gameAdminFor solo puede modificar participantes que compartan
 * alguno de sus juegos administrados. Otros roles no se restringen aquí.
 */
function adminSharesGameWithParticipant(user, participant) {
  if (user.role !== 'admin') return true;
  if (!Array.isArray(user.gameAdminFor) || user.gameAdminFor.length === 0) return true;
  const games = new Set(Object.keys(participant?.games || {}));
  if (participant?.gameId) games.add(participant.gameId);
  return [...games].some(g => user.gameAdminFor.includes(g));
}

function isScopedAdmin(user) {
  return user?.role === 'admin' && Array.isArray(user.gameAdminFor) && user.gameAdminFor.length > 0;
}

/**
 * Recorta los juegos de un participant body a los que el scoped admin gestiona.
 * gameIds, gameId/primaryGameId y gameMainCharacters quedan limitados al scope.
 */
function clampGamesToAdminScope(user, body) {
  if (!isScopedAdmin(user)) return body;
  const allowed = new Set(user.gameAdminFor);
  if (Array.isArray(body.gameIds)) body.gameIds = body.gameIds.filter(g => allowed.has(g));
  if (body.gameId && !allowed.has(body.gameId)) body.gameId = body.gameIds?.[0] ?? undefined;
  if (body.primaryGameId && !allowed.has(body.primaryGameId)) body.primaryGameId = body.gameIds?.[0] ?? undefined;
  if (body.gameMainCharacters) {
    for (const g of Object.keys(body.gameMainCharacters)) {
      if (!allowed.has(g)) delete body.gameMainCharacters[g];
    }
  }
  return body;
}

/**
 * Busca la cuenta de usuario vinculada a un participant y verifica que el
 * caller tenga nivel estrictamente superior (nadie toca a un igual/superior).
 */
async function callerOutranksParticipantUser(caller, participant) {
  const allUsers = await users.getAll();
  const linked = allUsers.find(u =>
    u.participantId === participant.id ||
    Object.values(u.participantByCommunity || {}).includes(participant.id) ||
    (u.memberships || []).some(m => m.participantId === participant.id)
  );
  if (!linked) return true; // participant sin cuenta: cualquier admin lo gestiona
  if (linked.id === caller.id) return true;
  return canManageUser(caller, linked);
}

/** Merge per-game profiles: server ELO is authoritative, main character can come from client. */
function mergeGameProfiles(current = {}, incoming = {}) {
  const merged = { ...current };
  for (const gameId of Object.keys(incoming)) {
    const inc = incoming[gameId];
    if (!merged[gameId]) {
      merged[gameId] = { ...inc };
    } else {
      // Keep server ELO values, allow client to update main character
      merged[gameId] = {
        ...merged[gameId],
        mainCharacterId: inc.mainCharacterId ?? merged[gameId].mainCharacterId,
      };
    }
  }
  return merged;
}

/** Build a games map from the request, preserving any existing server profiles and ELO. */
function resolveGames(existing, incoming) {
  const base = migrateParticipantGames({ ...(existing || {}), games: { ...(existing?.games || {}) } }).games;
  const incomingGames = incoming?.games || {};

  // If the client sent legacy single-game ELO but no games object, migrate it
  if (Object.keys(incomingGames).length === 0 && incoming?.eloPoints !== undefined) {
    const fallbackGameId = incoming?.gameId || 'ssbu';
    if (!base[fallbackGameId] || base[fallbackGameId].eloPoints == null) {
      base[fallbackGameId] = {
        gameId: fallbackGameId,
        mainCharacterId: incoming?.mainCharacterId ?? null,
        eloPoints: incoming.eloPoints ?? null,
        eloRank: incoming?.eloRank ?? 'Sin puntos',
      };
    }
    return base;
  }

  return mergeGameProfiles(base, incomingGames);
}

// ── Multi-community membership ───────────────────────────────────────────
// Modelo: UN user puede tener N participants (uno por comunidad).
//   user.participantId / user.communityId → identidad en su comunidad hogar.
//   user.memberships[] → { participantId, communityId, isActive } por comunidad extra.
// Cada participant es una identidad totalmente independiente: nombre, alias,
// juegos, ELO, matches e historial son por comunidad. Solo el user (username,
// password, id) se comparte. isActive es por membresía.
//
// Flujo:
//   - request: el user pide entrar a una comunidad pública → la aprueba un
//     superadmin, community_admin o admin de esa comunidad → se crea un
//     participant nuevo en esa comunidad vinculado al user.
//   - invite: superadmin/community_admin invita al user (desde el perfil de un
//     participant suyo) → el user acepta → mismo resultado.

const APPROVER_ROLES = ['superadmin', 'community_admin', 'admin'];

/** Comunidades donde el user tiene membresía activa (hogar + extras). */
function userCommunityIds(u) {
  const ids = new Set();
  if (u.communityId) ids.add(u.communityId);
  for (const m of u.memberships ?? []) {
    if (m.isActive !== false) ids.add(m.communityId);
  }
  return [...ids];
}

/** participantId del user en una comunidad concreta (hogar o membresía). */
function participantIdForCommunity(u, communityId) {
  if (u.communityId === communityId) return u.participantId ?? null;
  const m = (u.memberships ?? []).find(m => m.communityId === communityId && m.isActive !== false);
  return m?.participantId ?? null;
}

async function notifyCommunityAdmins(communityId, type, title, message, data) {
  try {
    const allUsers = await users.getAll();
    for (const u of allUsers) {
      if (!APPROVER_ROLES.includes(u.role)) continue;
      const isInScope = u.role === 'superadmin' || u.communityId === communityId ||
        (u.memberships ?? []).some(m => m.communityId === communityId && m.isActive !== false);
      if (!isInScope) continue;
      const pid = participantIdForCommunity(u, communityId);
      if (pid) await createNotification(pid, type, title, message, data);
    }
  } catch (err) {
    console.error('[Participants] notifyCommunityAdmins failed:', err);
  }
}

/** Crea un participant nuevo para el user en la comunidad destino. */
async function createMembershipParticipant(user, sourceParticipant, communityId) {
  const p = {
    id: `gp_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    name: sourceParticipant?.name ?? user.username,
    alias: sourceParticipant?.alias ?? '',
    avatarUrl: sourceParticipant?.avatarUrl ?? null,
    tournamentIds: [],
    gameId: null,
    mainCharacterId: null,
    games: {},
    communityId,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  await participants.upsert(p);
  if (!Array.isArray(user.memberships)) user.memberships = [];
  user.memberships.push({ participantId: p.id, communityId, isActive: true });
  user.updatedAt = new Date().toISOString();
  await users.upsert(user);
  return p;
}

// POST /api/participants/:id/join-request — el user pide entrar a una comunidad pública
// :id es el participantId del user en CUALQUIER comunidad donde ya es miembro.
router.post('/:id/join-request', requireAuth, async (req, res) => {
  try {
    const { communityId } = req.body;
    if (!communityId) return res.status(400).json({ error: 'communityId is required' });

    const p = await participants.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Participant not found' });

    const user = await users.findById(req.user.userId);
    if (!user) return res.status(404).json({ error: 'User not found' });

    // Solo el propio user puede pedir entrar (salvo superadmin)
    const ownsParticipant = req.user.participantId === p.id ||
      (user.memberships ?? []).some(m => m.participantId === p.id);
    if (req.user.role !== 'superadmin' && !ownsParticipant) {
      return res.status(403).json({ error: 'You can only request to join for yourself' });
    }

    const community = await communities.findById(communityId);
    if (!community) return res.status(404).json({ error: 'Community not found' });
    if (community.isPublic === false) {
      return res.status(403).json({ error: 'This community is private — you need an invite' });
    }

    if (userCommunityIds(user).includes(communityId)) {
      return res.status(400).json({ error: 'Already a member of this community' });
    }

    const pending = (await membershipRequests.getAll()).find(r =>
      r.userId === user.id && r.communityId === communityId && r.status === 'pending'
    );
    if (pending) return res.status(409).json({ error: 'There is already a pending request/invite' });

    const request = {
      id: `mreq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      userId: user.id,
      sourceParticipantId: p.id,
      communityId,
      direction: 'request',
      status: 'pending',
      requestedBy: req.user.userId,
      createdAt: new Date().toISOString(),
    };
    await membershipRequests.upsert(request);

    await notifyCommunityAdmins(
      communityId,
      'membership_request',
      'Solicitud de ingreso',
      `${p.alias || p.name} quiere unirse a ${community.name}`,
      { requestId: request.id, userId: user.id, communityId }
    );

    res.status(201).json(request);
  } catch (err) {
    console.error('[Participants] POST /:id/join-request error:', err);
    res.status(500).json({ error: 'Failed to create join request' });
  }
});

// POST /api/participants/:id/invite — superadmin / community_admin invita al USER
// del participant :id a unirse a communityId (se crea un participant nuevo allí).
router.post('/:id/invite', requireAuth, async (req, res) => {
  try {
    const { communityId } = req.body;
    if (!communityId) return res.status(400).json({ error: 'communityId is required' });

    const p = await participants.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Participant not found' });

    const community = await communities.findById(communityId);
    if (!community) return res.status(404).json({ error: 'Community not found' });

    // Solo superadmin o community_admin DE ESA comunidad puede invitar
    const canInvite =
      req.user.role === 'superadmin' ||
      (req.user.role === 'community_admin' && isInUserScope(req.user, communityId));
    if (!canInvite) {
      return res.status(403).json({ error: 'Only superadmin or the community owner can invite' });
    }

    // Resolver el user vinculado a este participant (hogar o membresía)
    const allUsers = await users.getAll();
    const targetUser = allUsers.find(u =>
      u.participantId === p.id ||
      (u.memberships ?? []).some(m => m.participantId === p.id)
    );
    if (!targetUser) {
      return res.status(400).json({ error: 'This participant has no user account — cannot invite' });
    }

    if (userCommunityIds(targetUser).includes(communityId)) {
      return res.status(400).json({ error: 'Already a member of this community' });
    }

    const pending = (await membershipRequests.getAll()).find(r =>
      r.userId === targetUser.id && r.communityId === communityId && r.status === 'pending'
    );
    if (pending) return res.status(409).json({ error: 'There is already a pending request/invite' });

    const request = {
      id: `mreq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      userId: targetUser.id,
      sourceParticipantId: p.id,
      communityId,
      direction: 'invite',
      status: 'pending',
      requestedBy: req.user.userId,
      createdAt: new Date().toISOString(),
    };
    await membershipRequests.upsert(request);

    await createNotification(
      p.id,
      'membership_invite',
      'Invitación a comunidad',
      `Te han invitado a unirte a ${community.name}`,
      { requestId: request.id, userId: targetUser.id, communityId }
    );

    res.status(201).json(request);
  } catch (err) {
    console.error('[Participants] POST /:id/invite error:', err);
    res.status(500).json({ error: 'Failed to create invite' });
  }
});

// GET /api/participants/membership-requests — pendientes para admins + propias del user
router.get('/membership-requests', requireAuth, async (req, res) => {
  try {
    const { communityId } = req.query;
    const all = await membershipRequests.getAll();
    const pending = all.filter(r => r.status === 'pending');

    const isAdminOf = (cid) =>
      req.user.role === 'superadmin' ||
      (APPROVER_ROLES.includes(req.user.role) && isInUserScope(req.user, cid));

    const visible = pending.filter(r => {
      // Invites: visibles para el user invitado
      if (r.direction === 'invite' && r.userId === req.user.userId) return true;
      // Requests: visibles para admins de la comunidad destino
      if (r.direction === 'request' && isAdminOf(r.communityId)) return true;
      return false;
    });

    res.json(communityId ? visible.filter(r => r.communityId === communityId) : visible);
  } catch (err) {
    console.error('[Participants] GET /membership-requests error:', err);
    res.status(500).json({ error: 'Failed to read membership requests' });
  }
});

// POST /api/participants/membership-requests/:id/resolve — { action: 'accept' | 'decline' }
router.post('/membership-requests/:id/resolve', requireAuth, async (req, res) => {
  try {
    const { action } = req.body;
    if (!['accept', 'decline'].includes(action)) {
      return res.status(400).json({ error: 'action must be accept or decline' });
    }

    const request = await membershipRequests.findById(req.params.id);
    if (!request) return res.status(404).json({ error: 'Request not found' });
    if (request.status !== 'pending') return res.status(400).json({ error: 'Request already resolved' });

    const targetUser = await users.findById(request.userId);
    if (!targetUser) return res.status(404).json({ error: 'User not found' });

    // Quién puede resolver:
    // - request  → superadmin, community_admin o admin de la comunidad destino
    // - invite   → el propio user invitado (o superadmin)
    let allowed = false;
    if (request.direction === 'request') {
      allowed =
        req.user.role === 'superadmin' ||
        (APPROVER_ROLES.includes(req.user.role) && isInUserScope(req.user, request.communityId));
    } else {
      allowed = req.user.role === 'superadmin' || req.user.userId === request.userId;
    }
    if (!allowed) return res.status(403).json({ error: 'You cannot resolve this request' });

    request.status = action === 'accept' ? 'accepted' : 'declined';
    request.resolvedAt = new Date().toISOString();
    request.resolvedBy = req.user.userId;
    await membershipRequests.upsert(request);

    let newParticipant = null;
    if (action === 'accept' && !userCommunityIds(targetUser).includes(request.communityId)) {
      const source = await participants.findById(request.sourceParticipantId);
      newParticipant = await createMembershipParticipant(targetUser, source, request.communityId);
      await createNotification(
        newParticipant.id,
        'membership_accepted',
        'Membresía aceptada',
        `Ahora eres miembro de una nueva comunidad`,
        { communityId: request.communityId }
      );
    }

    res.json({ request, participant: newParticipant });
  } catch (err) {
    console.error('[Participants] POST /membership-requests/:id/resolve error:', err);
    res.status(500).json({ error: 'Failed to resolve request' });
  }
});

// DELETE /api/participants/:id/communities/:cid — desactiva la membresía del
// user dueño del participant :id en la comunidad :cid (self o admin de esa comunidad).
// El participant queda en la base (conserva historial) pero la membresía pasa a inactiva.
router.delete('/:id/communities/:cid', requireAuth, async (req, res) => {
  try {
    const p = await participants.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Participant not found' });
    const { cid } = req.params;

    // Resolver el user dueño de este participant
    const allUsers = await users.getAll();
    const targetUser = allUsers.find(u =>
      u.participantId === p.id ||
      (u.memberships ?? []).some(m => m.participantId === p.id)
    );
    if (!targetUser) return res.status(404).json({ error: 'No user owns this participant' });

    if (targetUser.communityId === cid && targetUser.participantId === p.id) {
      return res.status(400).json({ error: 'Cannot leave the home community' });
    }

    const isSelf = req.user.userId === targetUser.id;
    const isAdminOfTarget = APPROVER_ROLES.includes(req.user.role) && isInUserScope(req.user, cid);
    if (!isSelf && !isAdminOfTarget) {
      return res.status(403).json({ error: 'Only the member or an admin of that community can remove membership' });
    }

    const membership = (targetUser.memberships ?? []).find(m => m.communityId === cid && m.participantId === p.id);
    if (!membership) return res.status(404).json({ error: 'Membership not found' });
    membership.isActive = false;
    targetUser.updatedAt = new Date().toISOString();
    await users.upsert(targetUser);
    res.json({ ok: true });
  } catch (err) {
    console.error('[Participants] DELETE /:id/communities/:cid error:', err);
    res.status(500).json({ error: 'Failed to remove membership' });
  }
});

// ── Routes ────────────────────────────────────────────────────────────────

// GET /api/participants?communityId=...
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { communityId } = req.query;
    const data = await participants.getAll();
    let filtered = filterByCommunity(req.user, data, communityId);
    // Game-scoped admin: solo ve participantes que compartan alguno de sus juegos
    if (isScopedAdmin(req.user)) {
      filtered = filtered.filter(p => adminSharesGameWithParticipant(req.user, p));
    }
    res.json(filtered);
  } catch (err) {
    console.error('[Participants] GET / error:', err);
    res.status(500).json({ error: 'Failed to read participants' });
  }
});

// GET /api/participants/:id
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const p = await participants.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Participant not found' });
    if (!isInUserScope(req.user, p.communityId)) {
      return res.status(403).json({ error: 'Participant is not in your community scope' });
    }
    // Game-scoped admin: solo puede leer participantes que compartan sus juegos
    if (isScopedAdmin(req.user) && !adminSharesGameWithParticipant(req.user, p)
        && participantIdFor(req.user, p.communityId) !== p.id) {
      return res.status(403).json({ error: 'You are not admin of any of this participant\'s games' });
    }
    res.json(p);
  } catch (err) {
    console.error('[Participants] GET /:id error:', err);
    res.status(500).json({ error: 'Failed to read participant' });
  }
});

// POST /api/participants
// - Array body  → merge sync (preserves ELO fields from JSON if incoming record lacks them)
// - Object body → upsert single participant
router.post('/', requireAuth, async (req, res) => {
  try {
    if (Array.isArray(req.body)) {
      // Load existing records so we can preserve ELO data that the frontend
      // doesn't know about (e.g. updated by the ranking engine after a match).
      const existing = await participants.getAll();
      const existingMap = new Map(existing.map((p) => [p.id, p]));

      // Reject bulk sync if it tries to write to a community outside the user's scope
      const invalidCommunity = req.body.some((incoming) => {
        const communityId = getTargetCommunityId(req.user, incoming.communityId);
        return !isInUserScope(req.user, communityId);
      });
      if (invalidCommunity) {
        return res.status(403).json({ error: 'Cannot sync participants outside your community scope' });
      }

      const merged = req.body.map((incoming) => {
        const current = existingMap.get(incoming.id);
        const communityId = getTargetCommunityId(req.user, incoming.communityId);
        clampGamesToAdminScope(req.user, incoming);

        // Per-game ELO is written by the ranking engine. Preserve the server
        // profiles and only merge in new game profiles / main characters from the client.
        const games = resolveGames(current, incoming);

        return {
          ...incoming,
          games,
          communityId,
        };
      });

      if (isScopedAdmin(req.user)) {
        // Un admin scopenado no ve ni gestiona a los demás: conservar los
        // participantes que no vienen en el payload para no borrarlos.
        const incomingIds = new Set(merged.map(m => m.id));
        const untouched = existing.filter(p => !incomingIds.has(p.id));
        await participants.replaceAll([...untouched, ...merged]);
      } else {
        await participants.replaceAll(merged);
      }
      return res.json({ ok: true, count: merged.length });
    }

    // Single object upsert
    const body = clampGamesToAdminScope(req.user, req.body);
    body.communityId = getTargetCommunityId(req.user, body.communityId);
    if (!isInUserScope(req.user, body.communityId)) {
      return res.status(403).json({ error: 'Cannot create participant in this community' });
    }
    const { valid, errors } = validateParticipant(body);
    if (!valid) return res.status(400).json({ error: 'Invalid participant data', details: errors });

    if (!body.stats) {
      body.stats = { tournamentsPlayed: 0, wins: 0, matchWins: 0, matchLosses: 0 };
    }
    body.games = resolveGames(null, body);

    // Apply explicit game list (with per-game main characters) if provided
    if (Array.isArray(body.gameIds) && body.gameIds.length > 0) {
      setParticipantGameList(body, body.gameIds, body.primaryGameId, body.gameMainCharacters || {});
    } else if (body.gameId) {
      setParticipantPrimaryGame(body, body.gameId, body.mainCharacterId);
    }

    body.createdAt = body.createdAt ?? new Date().toISOString();
    body.updatedAt = new Date().toISOString();

    await participants.upsert(body);
    return res.status(201).json(body);
  } catch (err) {
    console.error('[Participants] POST / error:', err);
    res.status(500).json({ error: 'Failed to save participants' });
  }
});

// PUT /api/participants/:id — upsert (create if not exists, update if exists)
router.put('/:id', requireAuth, async (req, res) => {
  try {
    const existing = await participants.findById(req.params.id);

    if (existing && !isInUserScope(req.user, existing.communityId)) {
      return res.status(403).json({ error: 'Participant is not in your community scope' });
    }

    if (existing) {
      // Solo el dueño del participant o un admin puede editarlo
      const myPid = participantIdFor(req.user, existing.communityId);
      if (myPid !== existing.id && !isAdminRole(req.user)) {
        return res.status(403).json({ error: 'You can only edit your own participant' });
      }
      // Game-scoped admin: el participant debe compartir alguno de sus juegos
      if (!adminSharesGameWithParticipant(req.user, existing)) {
        return res.status(403).json({ error: 'You are not admin of any of this participant\'s games' });
      }
      // Jerarquía: nadie edita el participant de un usuario de nivel igual o superior
      if (isAdminRole(req.user) && !(await callerOutranksParticipantUser(req.user, existing))) {
        return res.status(403).json({ error: 'You cannot edit a participant linked to an equal or higher admin' });
      }
    }

    if (!existing) {
      // CREATE: body must contain the full participant object from the frontend
      const body = { ...req.body, id: req.params.id };
      if (!body.communityId) body.communityId = getTargetCommunityId(req.user);
      const { valid, errors } = validateParticipant(body);
      if (!valid) return res.status(400).json({ error: 'Invalid data', details: errors });

      // Ensure stats block and per-game profiles exist
      if (!body.stats) {
        body.stats = { tournamentsPlayed: 0, wins: 0, matchWins: 0, matchLosses: 0 };
      }
      body.games = resolveGames(null, body);

      if (Array.isArray(body.gameIds) && body.gameIds.length > 0) {
        setParticipantGameList(body, body.gameIds, body.primaryGameId, body.gameMainCharacters || {});
      } else if (body.gameId) {
        setParticipantPrimaryGame(body, body.gameId, body.mainCharacterId);
      }

      body.createdAt = body.createdAt ?? new Date().toISOString();
      body.updatedAt = new Date().toISOString();

      await participants.upsert(body);
      return res.status(201).json(body);
    }

    // UPDATE: merge editable fields only
    const { name, alias, avatarUrl, stats, gameId, mainCharacterId, gameIds, primaryGameId, gameMainCharacters } = req.body;

    // Check for duplicate name if name is changing
    if (name && name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      const all = await participants.getAll();
      const duplicate = all.find(
        (p) => p.id !== req.params.id && p.name.toLowerCase() === name.trim().toLowerCase()
      );
      if (duplicate) {
        return res.status(409).json({ error: 'A participant with that name already exists' });
      }
    }

    const updated = migrateParticipantGames({ ...existing });
    if (name !== undefined) updated.name = name.trim();
    if (alias !== undefined) updated.alias = alias.trim();
    if (avatarUrl !== undefined) updated.avatarUrl = avatarUrl;
    if (stats !== undefined) updated.stats = stats;
    updated.communityId = getTargetCommunityId(req.user, req.body.communityId);
    updated.updatedAt = new Date().toISOString();

    // Update game list and primary game (with per-game main characters)
    if (Array.isArray(gameIds)) {
      let effectiveIds = gameIds;
      let effectivePrimary = primaryGameId;
      let effectiveMains = gameMainCharacters || {};
      if (isScopedAdmin(req.user)) {
        // Solo puede modificar juegos de su scope: los demás se conservan
        const allowed = new Set(req.user.gameAdminFor);
        const preserved = Object.keys(existing.games || {}).filter(g => !allowed.has(g));
        if (existing.gameId && !allowed.has(existing.gameId)) preserved.push(existing.gameId);
        effectiveIds = [...new Set([...preserved, ...gameIds.filter(g => allowed.has(g))])];
        if (effectivePrimary && !allowed.has(effectivePrimary)) {
          effectivePrimary = effectiveIds.find(g => allowed.has(g)) ?? effectiveIds[0] ?? null;
        }
        for (const g of Object.keys(effectiveMains)) {
          if (!allowed.has(g)) delete effectiveMains[g];
        }
      }
      setParticipantGameList(updated, effectiveIds, effectivePrimary, effectiveMains);
    } else if (gameId !== undefined) {
      setParticipantPrimaryGame(updated, gameId, mainCharacterId !== undefined ? mainCharacterId : updated.mainCharacterId);
    } else if (mainCharacterId !== undefined && updated.gameId) {
      setParticipantGameMain(updated, updated.gameId, mainCharacterId);
    }

    // Merge any incoming game profiles (preserving server ELO) only if no explicit game list was sent
    if (!Array.isArray(gameIds)) {
      updated.games = mergeGameProfiles(updated.games, req.body.games || {});
    }

    const { valid, errors } = validateParticipant(updated);
    if (!valid) return res.status(400).json({ error: 'Invalid data', details: errors });

    await participants.upsert(updated);
    res.json(updated);
  } catch (err) {
    console.error('[Participants] PUT /:id error:', err);
    res.status(500).json({ error: 'Failed to update participant' });
  }
});

// DELETE /api/participants/:id
router.delete('/:id', requireAuth, requireAdmin, async (req, res) => {
  try {
    const p = await participants.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Participant not found' });
    if (!isInUserScope(req.user, p.communityId)) {
      return res.status(403).json({ error: 'Participant is not in your community scope' });
    }
    if (!adminSharesGameWithParticipant(req.user, p)) {
      return res.status(403).json({ error: 'You are not admin of any of this participant\'s games' });
    }
    if (!(await callerOutranksParticipantUser(req.user, p))) {
      return res.status(403).json({ error: 'You cannot delete a participant linked to an equal or higher admin' });
    }
    const deleted = await participants.remove(req.params.id);
    if (!deleted) return res.status(404).json({ error: 'Participant not found' });
    res.json({ ok: true });
  } catch (err) {
    console.error('[Participants] DELETE /:id error:', err);
    res.status(500).json({ error: 'Failed to delete participant' });
  }
});

// POST /api/participants/:id/stats — merge-update stats after a tournament
router.post('/:id/stats', async (req, res) => {
  try {
    const existing = await participants.findById(req.params.id);
    // If participant doesn't exist in JSON yet (was only in localStorage), skip silently
    if (!existing) return res.json({ ok: true, skipped: true });

    const { tournamentsPlayed = 0, wins = 0, matchWins = 0, matchLosses = 0 } = req.body;

    const updated = {
      ...existing,
      stats: {
        tournamentsPlayed: (existing.stats?.tournamentsPlayed ?? 0) + tournamentsPlayed,
        wins: (existing.stats?.wins ?? 0) + wins,
        matchWins: (existing.stats?.matchWins ?? 0) + matchWins,
        matchLosses: (existing.stats?.matchLosses ?? 0) + matchLosses,
      },
      updatedAt: new Date().toISOString(),
    };

    await participants.upsert(updated);
    res.json(updated);
  } catch (err) {
    console.error('[Participants] POST /:id/stats error:', err);
    res.status(500).json({ error: 'Failed to update stats' });
  }
});

// GET /api/participants/:id/tournaments — only tournaments this participant joined
router.get('/:id/tournaments', async (req, res) => {
  try {
    const p = await participants.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Participant not found' });
    const ids = new Set(p.tournamentIds ?? []);
    const all = await tournaments.getAll();
    const joined = all.filter((t) => ids.has(t.id));
    res.json(joined);
  } catch (err) {
    console.error('[Participants] GET /:id/tournaments error:', err);
    res.status(500).json({ error: 'Failed to read participant tournaments' });
  }
});

// GET /api/participants/:id/league-stats — league results and match record
router.get('/:id/league-stats', async (req, res) => {
  try {
    const p = await participants.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Participant not found' });

    const allLeagues = await leagues.getAll();
    const allLeagueMatches = await leagueMatches.getAll();
    const myLeagueIds = new Set();

    const results = [];

    for (const league of allLeagues) {
      if (!league.participantIds?.includes(req.params.id)) continue;
      myLeagueIds.add(league.id);

      const leagueMatchList = allLeagueMatches.filter((m) => m.leagueId === league.id);
      const myMatches = leagueMatchList.filter(
        (m) => m.participant1Id === req.params.id || m.participant2Id === req.params.id
      );

      let wins = 0;
      let losses = 0;
      let noShows = 0;
      let eloChange = 0;

      for (const m of myMatches) {
        if (m.status !== 'completed' && m.status !== 'no_show') continue;

        if (m.status === 'no_show') {
          if (m.noShowParticipantId === req.params.id) {
            losses++;
            noShows++;
            eloChange += (m.participant1Id === req.params.id ? m.participant1EloChange : m.participant2EloChange) ?? 0;
          } else {
            wins++;
          }
        } else {
          if (m.winnerId === req.params.id) {
            wins++;
          } else {
            losses++;
          }
          eloChange += (m.participant1Id === req.params.id ? m.participant1EloChange : m.participant2EloChange) ?? 0;
        }
      }

      // Rank by current ELO within the league (recompute simple standings)
      const standings = [];
      for (const pid of league.participantIds) {
        const playerMatches = leagueMatchList.filter(
          (m) => (m.participant1Id === pid || m.participant2Id === pid) &&
                 (m.status === 'completed' || m.status === 'no_show')
        );
        let playerEloChange = 0;
        for (const m of playerMatches) {
          playerEloChange += (m.participant1Id === pid ? m.participant1EloChange : m.participant2EloChange) ?? 0;
        }
        const otherP = migrateParticipantGames(await participants.findById(pid));
        const baseElo = getEffectiveElo(otherP, league.gameId) ?? 1500;
        standings.push({ participantId: pid, currentElo: baseElo + playerEloChange });
      }
      standings.sort((a, b) => b.currentElo - a.currentElo);
      const rank = standings.findIndex((s) => s.participantId === req.params.id) + 1;

      results.push({
        leagueId: league.id,
        leagueName: league.name,
        status: league.status,
        rank,
        matchesPlayed: wins + losses,
        wins,
        losses,
        noShows,
        eloChange,
        gamesPerMatch: league.gamesPerMatch,
        date: league.updatedAt,
      });
    }

    // Only show results for completed leagues in the profile
    const completedResults = results.filter((r) => r.status === 'completed');

    const totalLeagueMatches = completedResults.reduce((sum, r) => sum + r.matchesPlayed, 0);
    const totalLeagueWins = completedResults.reduce((sum, r) => sum + r.wins, 0);
    const totalLeagueLosses = completedResults.reduce((sum, r) => sum + r.losses, 0);
    const leagueWinRate = totalLeagueMatches > 0
      ? Math.round((totalLeagueWins / totalLeagueMatches) * 100)
      : 0;

    res.json({
      leagues: completedResults,
      totalMatches: totalLeagueMatches,
      totalWins: totalLeagueWins,
      totalLosses: totalLeagueLosses,
      winRate: leagueWinRate,
    });
  } catch (err) {
    console.error('[Participants] GET /:id/league-stats error:', err);
    res.status(500).json({ error: 'Failed to read league stats' });
  }
});

export default router;
