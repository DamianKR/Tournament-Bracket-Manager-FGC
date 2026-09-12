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
import { participants, tournaments, tournamentMatches, rankedMatches, leagues, leagueMatches, communities, users, membershipRequests } from '../db/collections.js';
import { validateParticipant } from '../models/participant.js';
import { requireAuth, requireAdmin, optionalAuth } from '../utils/jwtMiddleware.js';
import {
  filterByCommunity,
  isInUserScope,
  getTargetCommunityId,
  participantIdFor,
  communityRole,
  isAdminInCommunity,
  isCommunityAdmin,
  gameAdminForInCommunity,
  canManageUserInCommunity,
} from '../utils/communityScope.js';
import { createNotification } from '../services/notificationService.js';
import {
  migrateParticipantGames,
  setParticipantPrimaryGame,
  setParticipantGameMain,
  setParticipantGameList,
  getEffectiveElo,
} from '../utils/participantGames.js';
import { getRankName, getRankColor } from '../utils/eloEngine.js';

const router = Router();

// ── Helpers ─────────────────────────────────────────────────────────────────

/** true si el usuario tiene cualquier rol admin EN la comunidad del participant. */
function isAdminRole(user, communityId) {
  return isAdminInCommunity(user, communityId);
}

/**
 * Un admin con gameAdminFor (EN esa comunidad) solo puede modificar
 * participantes que compartan alguno de sus juegos administrados.
 * community_admin/superadmin/admin-sin-scope: sin restricción.
 */
function adminSharesGameWithParticipant(user, communityId, participant) {
  if (communityRole(user, communityId) !== 'admin') return true;
  const scope = gameAdminForInCommunity(user, communityId);
  if (scope.length === 0) return true;
  const games = new Set(Object.keys(participant?.games || {}));
  if (participant?.gameId) games.add(participant.gameId);
  return [...games].some(g => scope.includes(g));
}

/** true si el usuario es 'admin' CON gameAdminFor no vacío EN esa comunidad. */
function isScopedAdmin(user, communityId) {
  return communityRole(user, communityId) === 'admin' && gameAdminForInCommunity(user, communityId).length > 0;
}

/**
 * Recorta los juegos de un participant body a los que el scoped admin gestiona
 * EN la comunidad del participant. gameIds, gameId/primaryGameId y
 * gameMainCharacters quedan limitados al scope.
 */
function clampGamesToAdminScope(user, communityId, body) {
  if (!isScopedAdmin(user, communityId)) return body;
  const allowed = new Set(gameAdminForInCommunity(user, communityId));
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
 * caller tenga nivel estrictamente superior EN esa comunidad (nadie toca a
 * un igual/superior).
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
  return canManageUserInCommunity(caller, linked, participant.communityId);
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

/** true si el user administra ingresos/solicitudes de esa comunidad:
 *  superadmin, community_admin, o admin SIN scope de juego (los scopenados no). */
function isMembershipApprover(u, communityId) {
  const role = communityRole(u, communityId);
  if (role === 'superadmin' || role === 'community_admin') return true;
  if (role === 'admin') return gameAdminForInCommunity(u, communityId).length === 0;
  return false;
}

async function notifyCommunityAdmins(communityId, type, title, message, data) {
  try {
    const allUsers = await users.getAll();
    for (const u of allUsers) {
      if (!isMembershipApprover(u, communityId)) continue;
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
  user.memberships.push({ participantId: p.id, communityId, isActive: true, role: 'user', gameAdminFor: [] });
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

    const { name, alias, reason } = req.body;
    const request = {
      id: `mreq_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
      userId: user.id,
      sourceParticipantId: p.id,
      communityId,
      direction: 'request',
      status: 'pending',
      requestedBy: req.user.userId,
      applicantName: (name?.trim() || p.name)?.trim(),
      applicantAlias: (alias?.trim() || p.alias)?.trim() || null,
      reason: reason?.trim() || null,
      createdAt: new Date().toISOString(),
    };
    await membershipRequests.upsert(request);

    const displayName = request.applicantAlias || request.applicantName;
    const reasonLine = request.reason ? ` - "${request.reason}"` : '';
    await notifyCommunityAdmins(
      communityId,
      'membership_request',
      'Solicitud de ingreso',
      `${displayName} quiere unirse a ${community.name}${reasonLine}`,
      {
        requestId: request.id,
        userId: user.id,
        communityId,
        communityName: community.name,
        applicantName: displayName,
        reason: request.reason,
      }
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
    const canInvite = isCommunityAdmin(req.user, communityId);
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
      { requestId: request.id, userId: targetUser.id, communityId, communityName: community.name }
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

    const isAdminOf = (cid) => isMembershipApprover(req.user, cid);

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
      allowed = isMembershipApprover(req.user, request.communityId);
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
      const acceptedCommunity = await communities.findById(request.communityId);
      await createNotification(
        newParticipant.id,
        'membership_accepted',
        'Membresía aceptada',
        `Ahora eres miembro de ${acceptedCommunity?.name ?? 'una nueva comunidad'}`,
        { communityId: request.communityId, communityName: acceptedCommunity?.name }
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
    const isAdminOfTarget = isAdminInCommunity(req.user, cid);
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
    res.json(filtered);
  } catch (err) {
    console.error('[Participants] GET / error:', err);
    res.status(500).json({ error: 'Failed to read participants' });
  }
});

// GET /api/participants/:id/account-summary — info mínima de la cuenta
// vinculada, para que un community_admin de OTRA comunidad pueda saber si el
// participant tiene cuenta invitable sin exponer el listado completo de users.
router.get('/:id/account-summary', requireAuth, async (req, res) => {
  try {
    const p = await participants.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Participant not found' });

    const all = await users.getAll();
    const targetUser = all.find(u =>
      u.participantId === p.id ||
      (u.memberships ?? []).some(m => m.participantId === p.id)
    );
    if (!targetUser) return res.json({ hasAccount: false, communityIds: [] });

    res.json({ hasAccount: true, communityIds: userCommunityIds(targetUser) });
  } catch (err) {
    console.error('[Participants] GET /:id/account-summary error:', err);
    res.status(500).json({ error: 'Failed to read account summary' });
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
        clampGamesToAdminScope(req.user, communityId, incoming);

        // Per-game ELO is written by the ranking engine. Preserve the server
        // profiles and only merge in new game profiles / main characters from the client.
        const games = resolveGames(current, incoming);

        return {
          ...incoming,
          games,
          communityId,
        };
      });

      // Upsert each participant individually. Never replace the whole collection,
      // to avoid deleting participants from other communities if a scoped client
      // only sends one community's data.
      for (const p of merged) {
        await participants.upsert(p);
      }
      return res.json({ ok: true, count: merged.length });
    }

    // Single object upsert
    const newCommunityId = getTargetCommunityId(req.user, req.body.communityId);
    if (!isInUserScope(req.user, newCommunityId)) {
      return res.status(403).json({ error: 'Cannot create participant in this community' });
    }
    const body = clampGamesToAdminScope(req.user, newCommunityId, req.body);
    body.communityId = newCommunityId;
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
      // Solo el dueño del participant o un admin (de esa comunidad) puede editarlo
      const myPid = participantIdFor(req.user, existing.communityId);
      if (myPid !== existing.id && !isAdminRole(req.user, existing.communityId)) {
        return res.status(403).json({ error: 'You can only edit your own participant' });
      }
      // Jerarquía: nadie edita el participant de un usuario de nivel igual o superior
      if (isAdminRole(req.user, existing.communityId) && !(await callerOutranksParticipantUser(req.user, existing))) {
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

    // Check for duplicate name if name is changing (scoped to the participant's community)
    if (name && name.trim().toLowerCase() !== existing.name.toLowerCase()) {
      const all = await participants.getAll();
      const duplicate = all.find(
        (p) => p.id !== req.params.id &&
               p.communityId === existing.communityId &&
               p.name.toLowerCase() === name.trim().toLowerCase()
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
      let effectiveMains = gameMainCharacters || {};
      if (isScopedAdmin(req.user, existing.communityId)) {
        // Solo puede modificar juegos de su scope: los demás se conservan
        const allowed = new Set(gameAdminForInCommunity(req.user, existing.communityId));
        const preserved = Object.keys(existing.games || {}).filter(g => !allowed.has(g));
        if (existing.gameId && !allowed.has(existing.gameId)) preserved.push(existing.gameId);
        if (existing.primaryGameId && !allowed.has(existing.primaryGameId)) preserved.push(existing.primaryGameId);
        effectiveIds = [...new Set([...preserved, ...gameIds.filter(g => allowed.has(g))])];
        // No puede cambiar el default/primary game del participante
        for (const g of Object.keys(effectiveMains)) {
          if (!allowed.has(g)) delete effectiveMains[g];
        }
      }
      const effectivePrimary = existing.primaryGameId || existing.gameId;
      setParticipantGameList(updated, effectiveIds, effectivePrimary, effectiveMains);
    } else if (gameId !== undefined) {
      // Game-scoped admin no puede cambiar el default game del participante
      if (!isScopedAdmin(req.user, existing.communityId)) {
        setParticipantPrimaryGame(updated, gameId, mainCharacterId !== undefined ? mainCharacterId : updated.mainCharacterId);
      }
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
    // Game-scoped admin: solo puede borrar si el primary game del participante
    // está en su scope (no basta con compartir cualquier juego).
    if (isScopedAdmin(req.user, p.communityId) && (!p.gameId || !gameAdminForInCommunity(req.user, p.communityId).includes(p.gameId))) {
      return res.status(403).json({ error: 'You can only delete participants whose primary game you administer' });
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

    // Show results for active and completed leagues (matches themselves are already filtered to completed/no_show)
    const completedResults = results.filter((r) => r.status === 'active' || r.status === 'completed');

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

// GET /api/participants/:id/league-matches — completed/no_show matches for this participant
router.get('/:id/league-matches', async (req, res) => {
  try {
    const p = await participants.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Participant not found' });

    const allLeagues = await leagues.getAll();
    const allLeagueMatches = await leagueMatches.getAll();
    const participantLeagueIds = new Set(
      allLeagues.filter((l) => l.participantIds?.includes(req.params.id)).map((l) => l.id)
    );

    const myMatches = allLeagueMatches.filter(
      (m) =>
        participantLeagueIds.has(m.leagueId) &&
        (m.participant1Id === req.params.id || m.participant2Id === req.params.id) &&
        (m.status === 'completed' || m.status === 'no_show')
    );

    res.json(myMatches);
  } catch (err) {
    console.error('[Participants] GET /:id/league-matches error:', err);
    res.status(500).json({ error: 'Failed to read league matches' });
  }
});

// GET /api/participants/:id/stats — comprehensive player statistics
router.get('/:id/stats', async (req, res) => {
  try {
    const p = await participants.findById(req.params.id);
    if (!p) return res.status(404).json({ error: 'Participant not found' });

    const participantId = p.id;

    // Main characters by game (chosen by the user, not computed from usage)
    const mainCharactersByGame = {};
    for (const [gameId, profile] of Object.entries(p.games || {})) {
      if (profile.mainCharacterId) {
        mainCharactersByGame[gameId] = { id: profile.mainCharacterId };
      }
    }

    const [p1T, p2T, p1R, p2R, p1L, p2L, allTournaments, allLeagues] = await Promise.all([
      tournamentMatches.getByField('player1GlobalId', participantId),
      tournamentMatches.getByField('player2GlobalId', participantId),
      rankedMatches.getByField('playerAId', participantId),
      rankedMatches.getByField('playerBId', participantId),
      leagueMatches.getByField('participant1Id', participantId),
      leagueMatches.getByField('participant2Id', participantId),
      tournaments.getAll(),
      leagues.getAll(),
    ]);

    const tournamentGameMap = new Map(allTournaments.map((t) => [t.id, t.gameId]));
    const leagueGameMap = new Map(allLeagues.map((l) => [l.id, l.gameId]));

    const tMatches = [...p1T, ...p2T];
    const rMatches = [...p1R, ...p2R];
    const lMatches = [...p1L, ...p2L];

    const stats = {
      characterUsage: new Map(),
      opponentCharacterUsage: new Map(),
      characterMatchups: new Map(),
      peakEloByGame: new Map(),
      headToHeadPlayers: new Map(),
      headToHeadPlayersByType: new Map(),
      monthlyActivity: new Map(),
      topPlacements: { top1: 0, top3: 0, top8: 0, top16: 0 },
      allMatchWins: 0,
      allMatchLosses: 0,
      recordByGame: new Map(),
      recordByType: new Map(),
    };

    const monthKey = (date) => (date ?? '').slice(0, 7);

    const recordMatch = (date, won, gameId, myChars, oppChars, oppId, myEloAfter, matchType, games, isP1, myId = participantId) => {
      const mk = monthKey(date);
      if (mk) {
        const ma = stats.monthlyActivity.get(mk) || { month: mk, matches: 0, tournaments: 0, byType: { tournament: { matches: 0 }, ranked: { matches: 0 }, league: { matches: 0 } } };
        ma.matches++;
        if (matchType && ma.byType[matchType]) {
          ma.byType[matchType].matches++;
        }
        stats.monthlyActivity.set(mk, ma);
      }

      // Character stats: per game if available, otherwise per match
      const gameLog = games && games.length > 0 ? games : null;
      const matchGameWon = won;

      if (gameLog && gameId) {
        for (const g of gameLog) {
          const gameWon = g.winnerId === myId;
          const myChar = isP1 ? g.player1Character : g.player2Character;
          const oppChar = isP1 ? g.player2Character : g.player1Character;

          if (myChar) {
            const key = `${gameId}:${myChar}`;
            const cu = stats.characterUsage.get(key) || { gameId, characterId: myChar, count: 0, wins: 0, losses: 0 };
            cu.count++;
            gameWon ? cu.wins++ : cu.losses++;
            stats.characterUsage.set(key, cu);
          }

          if (oppChar) {
            const key = `${gameId}:${oppChar}`;
            const ocu = stats.opponentCharacterUsage.get(key) || { gameId, characterId: oppChar, count: 0, wins: 0, losses: 0 };
            ocu.count++;
            gameWon ? ocu.wins++ : ocu.losses++;
            stats.opponentCharacterUsage.set(key, ocu);
          }

          if (myChar && oppChar) {
            const cm = stats.characterMatchups.get(`${gameId}:${myChar}`) || new Map();
            const rec = cm.get(`${gameId}:${oppChar}`) || {
              wins: 0, losses: 0,
              byType: { tournament: { wins: 0, losses: 0 }, ranked: { wins: 0, losses: 0 }, league: { wins: 0, losses: 0 } }
            };
            gameWon ? rec.wins++ : rec.losses++;
            if (matchType) {
              gameWon ? rec.byType[matchType].wins++ : rec.byType[matchType].losses++;
            }
            cm.set(`${gameId}:${oppChar}`, rec);
            stats.characterMatchups.set(`${gameId}:${myChar}`, cm);
          }
        }
      } else if (myChars && myChars.length > 0 && gameId) {
        for (const c of myChars) {
          const key = `${gameId}:${c}`;
          const cu = stats.characterUsage.get(key) || { gameId, characterId: c, count: 0, wins: 0, losses: 0 };
          cu.count++;
          matchGameWon ? cu.wins++ : cu.losses++;
          stats.characterUsage.set(key, cu);
        }

        if (oppChars && oppChars.length > 0) {
          for (const myC of myChars) {
            const cm = stats.characterMatchups.get(`${gameId}:${myC}`) || new Map();
            for (const oppC of oppChars) {
              const rec = cm.get(`${gameId}:${oppC}`) || {
                wins: 0, losses: 0,
                byType: { tournament: { wins: 0, losses: 0 }, ranked: { wins: 0, losses: 0 }, league: { wins: 0, losses: 0 } }
              };
              matchGameWon ? rec.wins++ : rec.losses++;
              if (matchType) {
                matchGameWon ? rec.byType[matchType].wins++ : rec.byType[matchType].losses++;
              }
              cm.set(`${gameId}:${oppC}`, rec);
            }
            stats.characterMatchups.set(`${gameId}:${myC}`, cm);
          }
        }

        if (oppChars && oppChars.length > 0) {
          for (const oppC of oppChars) {
            const key = `${gameId}:${oppC}`;
            const ocu = stats.opponentCharacterUsage.get(key) || { gameId, characterId: oppC, count: 0, wins: 0, losses: 0 };
            ocu.count++;
            matchGameWon ? ocu.wins++ : ocu.losses++;
            stats.opponentCharacterUsage.set(key, ocu);
          }
        }
      }

      if (myEloAfter != null && gameId) {
        const current = stats.peakEloByGame.get(gameId);
        if (!current || myEloAfter > current.points) {
          stats.peakEloByGame.set(gameId, {
            points: myEloAfter,
            rank: getRankName(myEloAfter),
            color: getRankColor(getRankName(myEloAfter)),
          });
        }
      }

      if (oppId) {
        const h2h = stats.headToHeadPlayers.get(oppId) || { wins: 0, losses: 0 };
        won ? h2h.wins++ : h2h.losses++;
        stats.headToHeadPlayers.set(oppId, h2h);

        if (matchType) {
          const byType = stats.headToHeadPlayersByType.get(matchType) || new Map();
          const h2hT = byType.get(oppId) || { wins: 0, losses: 0 };
          won ? h2hT.wins++ : h2hT.losses++;
          byType.set(oppId, h2hT);
          stats.headToHeadPlayersByType.set(matchType, byType);
        }
      }

      won ? stats.allMatchWins++ : stats.allMatchLosses++;

      if (gameId) {
        const rg = stats.recordByGame.get(gameId) || { wins: 0, losses: 0 };
        won ? rg.wins++ : rg.losses++;
        stats.recordByGame.set(gameId, rg);
      }

      if (matchType) {
        const rt = stats.recordByType.get(matchType) || { wins: 0, losses: 0 };
        won ? rt.wins++ : rt.losses++;
        stats.recordByType.set(matchType, rt);
      }
    };

    // Tournament match records from tournament_matches collection
    for (const m of tMatches) {
      const isP1 = m.player1GlobalId === participantId;
      const isP2 = m.player2GlobalId === participantId;
      if (!isP1 && !isP2) continue;
      const won = m.winnerGlobalId === participantId;
      const oppId = isP1 ? m.player2GlobalId : m.player1GlobalId;
      const myId = isP1 ? m.player1Id : m.player2Id;
      recordMatch(m.createdAt, won, m.gameId, null, null, oppId, null, 'tournament', m.games, isP1, myId);
    }

    // Ranked/duel matches
    for (const m of rMatches) {
      const isP1 = m.playerAId === participantId;
      const isP2 = m.playerBId === participantId;
      if (!isP1 && !isP2) continue;
      const won = m.winnerId === participantId;
      const myChars = isP1 ? m.player1Characters : m.player2Characters;
      const oppChars = isP1 ? m.player2Characters : m.player1Characters;
      const oppId = isP1 ? m.playerBId : m.playerAId;
      const myEloAfter = isP1 ? m.player1EloAfter : m.player2EloAfter;
      recordMatch(m.createdAt, won, m.gameId, myChars, oppChars, oppId, myEloAfter, 'ranked', m.games, isP1);
    }

    // League matches
    for (const m of lMatches) {
      const isP1 = m.participant1Id === participantId;
      const isP2 = m.participant2Id === participantId;
      if (!isP1 && !isP2) continue;
      if (m.status !== 'completed' && m.status !== 'no_show') continue;
      const noShowLoss = m.status === 'no_show' && m.noShowParticipantId === participantId;
      const won = !noShowLoss && m.winnerId === participantId;
      const oppId = isP1 ? m.participant2Id : m.participant1Id;
      const myEloBefore = isP1 ? (m.participant1EloBefore ?? 0) : (m.participant2EloBefore ?? 0);
      const myEloChange = isP1 ? (m.participant1EloChange ?? 0) : (m.participant2EloChange ?? 0);
      const lGameId = m.gameId || leagueGameMap.get(m.leagueId);
      const myEloAfter = myEloBefore + myEloChange;
      recordMatch(m.completedDate ?? m.scheduledDate, won, lGameId, null, null, oppId, myEloAfter, 'league', m.games, isP1);
    }

    // Tournament top placements and monthly tournament count
    for (const t of allTournaments) {
      const tp = t.participants.find((x) => x.globalParticipantId === participantId);
      if (!tp || !tp.finalPosition) continue;
      if (tp.finalPosition === 1) stats.topPlacements.top1++;
      if (tp.finalPosition <= 3) stats.topPlacements.top3++;
      if (tp.finalPosition <= 8) stats.topPlacements.top8++;
      if (tp.finalPosition <= 16) stats.topPlacements.top16++;

      const mk = monthKey(t.updatedAt);
      if (mk) {
        const ma = stats.monthlyActivity.get(mk) || { month: mk, matches: 0, tournaments: 0, byType: { tournament: { matches: 0 }, ranked: { matches: 0 }, league: { matches: 0 } } };
        ma.tournaments++;
        stats.monthlyActivity.set(mk, ma);
      }
    }

    // Resolve opponent names
    const opponentIds = new Set(Array.from(stats.headToHeadPlayers.keys()));
    for (const byType of stats.headToHeadPlayersByType.values()) {
      for (const oid of byType.keys()) opponentIds.add(oid);
    }
    const opponentMap = new Map();
    for (const oid of opponentIds) {
      const op = await participants.findById(oid);
      opponentMap.set(oid, op
        ? { id: op.id, name: op.name, alias: op.alias || null }
        : { id: oid, name: 'Unknown', alias: null }
      );
    }

    const formatUsage = (entry) => ({
      gameId: entry.gameId,
      characterId: entry.characterId,
      count: entry.count,
      wins: entry.wins,
      losses: entry.losses,
      winRate: entry.count > 0 ? Math.round((entry.wins / entry.count) * 100) : 0,
    });

    const characterUsage = Array.from(stats.characterUsage.entries())
      .map(([_, v]) => formatUsage(v))
      .sort((a, b) => b.count - a.count);

    const opponentCharacterUsage = Array.from(stats.opponentCharacterUsage.entries())
      .map(([_, v]) => formatUsage(v))
      .sort((a, b) => b.count - a.count);

    const matchupWinRates = [];
    for (const [myCharKey, oppMap] of stats.characterMatchups.entries()) {
      const [myGameId, myChar] = myCharKey.split(':');
      for (const [oppCharKey, rec] of oppMap.entries()) {
        const [, oppChar] = oppCharKey.split(':');
        matchupWinRates.push({
          gameId: myGameId,
          characterId: myChar,
          opponentCharacterId: oppChar,
          wins: rec.wins,
          losses: rec.losses,
          byType: rec.byType,
          winRate: rec.wins + rec.losses > 0 ? Math.round((rec.wins / (rec.wins + rec.losses)) * 100) : 0,
        });
      }
    }
    matchupWinRates.sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));

    const headToHead = Array.from(stats.headToHeadPlayers.entries())
      .map(([opponentId, rec]) => ({
        ...opponentMap.get(opponentId),
        ...rec,
        winRate: rec.wins + rec.losses > 0 ? Math.round((rec.wins / (rec.wins + rec.losses)) * 100) : 0,
      }))
      .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));

    const headToHeadByType = {};
    for (const [type, byType] of stats.headToHeadPlayersByType.entries()) {
      headToHeadByType[type] = Array.from(byType.entries())
        .map(([opponentId, rec]) => ({
          ...opponentMap.get(opponentId),
          ...rec,
          winRate: rec.wins + rec.losses > 0 ? Math.round((rec.wins / (rec.wins + rec.losses)) * 100) : 0,
        }))
        .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));
    }

    const monthlyActivity = Array.from(stats.monthlyActivity.values())
      .sort((a, b) => b.month.localeCompare(a.month));

    const formatRecord = (rec) => ({
      ...rec,
      winRate: rec.wins + rec.losses > 0 ? Math.round((rec.wins / (rec.wins + rec.losses)) * 100) : 0,
    });

    const recordByGame = Array.from(stats.recordByGame.entries())
      .map(([gameId, rec]) => ({ gameId, ...formatRecord(rec) }))
      .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));

    const recordByType = Array.from(stats.recordByType.entries())
      .map(([type, rec]) => ({ type, ...formatRecord(rec) }))
      .sort((a, b) => (b.wins + b.losses) - (a.wins + a.losses));

    res.json({
      mainCharactersByGame,
      characterUsage,
      peakEloByGame: Array.from(stats.peakEloByGame.entries())
        .map(([gameId, v]) => ({ gameId, ...v }))
        .sort((a, b) => b.points - a.points),
      matchupWinRates,
      opponentCharacterUsage,
      topPlacements: stats.topPlacements,
      headToHead,
      headToHeadByType,
      monthlyActivity,
      recordByGame,
      recordByType,
      allMatchWins: stats.allMatchWins,
      allMatchLosses: stats.allMatchLosses,
      allMatchWinRate: stats.allMatchWins + stats.allMatchLosses > 0
        ? Math.round((stats.allMatchWins / (stats.allMatchWins + stats.allMatchLosses)) * 100)
        : 0,
    });
  } catch (err) {
    console.error('[Participants] GET /:id/stats error:', err);
    res.status(500).json({ error: 'Failed to read participant stats' });
  }
});

export default router;
