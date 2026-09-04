import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GlobalParticipant, ComputedStats } from '@/models/types';
import type { AuthUser } from '@/models/auth';
import { getCharacter, getGame, GAMES } from '@/data/games';
import {
  getAllParticipants,
  getAllParticipantsAsync,
  createParticipant,
  removeParticipant,
  computeAllStats,
} from '@/services/participants/participantService';
import {
  listUsers,
  createUserAccount,
  deleteUserAccount,
} from '@/services/auth/authService';
import { saveGlobalParticipants } from '@/services/storage/localStorage';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal';
import Loading from '@/components/Loading/Loading';
import './ParticipantsPage.css';

type SortKey = 'name' | 'wins' | 'tournamentsPlayed' | 'winRate';

const DEFAULT_COMMUNITY_ID = 'community_fgc_santa_clara';

function ParticipantsPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { currentCommunity, getPath, isInMyCommunity, canAdminCurrentCommunity } = useCommunity();
  const [participants, setParticipants] = useState<GlobalParticipant[]>([]);
  const [statsMap, setStatsMap] = useState<Map<string, ComputedStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [error, setError] = useState('');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newGameIds, setNewGameIds] = useState<string[]>([]);
  const [newGameMainChars, setNewGameMainChars] = useState<Record<string, string | null>>({});
  const [newPrimaryGameId, setNewPrimaryGameId] = useState<string | null>(null);
  const [newUsername, setNewUsername] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<AuthUser['role']>('user');
  const [creating, setCreating] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // ── Account management ────────────────────────────────────────────────
  const [usersMap, setUsersMap] = useState<Map<string, AuthUser>>(new Map());

  useEffect(() => { loadAll(); }, [currentCommunity?.id]);

  function refreshStats(data: GlobalParticipant[]) {
    setStatsMap(computeAllStats(data));
  }

  const communityId = currentCommunity?.id ?? DEFAULT_COMMUNITY_ID;

  // Only community_admin and superadmin can assign roles.
  // admin assistants can only create regular 'user' accounts.
  const canAssignRole = isInMyCommunity && (user?.role === 'superadmin' || user?.role === 'community_admin');

  // Role options visible in the Create form, based on the actor's own role.
  // - superadmin: can assign any role (including community_admin)
  // - community_admin: can assign user, admin (NOT community_admin or superadmin to others)
  // - admin: no role assignment at all (they always create 'user')
  const roleOptions: AuthUser['role'][] = user?.role === 'superadmin'
    ? ['user', 'admin', 'community_admin']
    : ['user', 'admin'];

  async function loadAll() {
    setLoading(true);
    try {
      const cached = getAllParticipants(communityId);
      if (cached.length > 0) { setParticipants(cached); refreshStats(cached); }

      const [serverData, userList] = await Promise.all([
        getAllParticipantsAsync(communityId),
        listUsers().catch(() => [] as AuthUser[]),
      ]);

      const scoped = serverData;

      if (scoped.length === 0 && cached.length > 0) {
        saveGlobalParticipants(cached);
        setParticipants(cached);
        refreshStats(cached);
      } else {
        setParticipants(scoped);
        refreshStats(scoped);
      }

      const participantIds = new Set(scoped.length > 0 ? scoped.map((p) => p.id) : cached.map((p) => p.id));
      const map = new Map<string, AuthUser>();
      userList.forEach((u) => {
        if (u.participantId && participantIds.has(u.participantId)) {
          map.set(u.participantId, u);
        }
      });
      setUsersMap(map);
    } finally {
      setLoading(false);
    }
  }

  const getStats = (id: string): ComputedStats =>
    statsMap.get(id) ?? { tournamentsPlayed: 0, wins: 0, top3: 0, matchWins: 0, matchLosses: 0, winRate: 0, placements: [] };

  // ── Filtering & sorting ───────────────────────────────────────────────

  const filtered = participants
    .filter((p) => {
      if (!searchQuery) return true;
      const q = searchQuery.toLowerCase();
      const charName = p.gameId && p.mainCharacterId
        ? getCharacter(p.gameId, p.mainCharacterId)?.name.toLowerCase()
        : '';
      return p.name.toLowerCase().includes(q)
        || p.alias?.toLowerCase().includes(q)
        || charName?.includes(q);
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      const sa = getStats(a.id), sb = getStats(b.id);
      if (sortBy === 'wins') return sb.wins - sa.wins;
      if (sortBy === 'tournamentsPlayed') return sb.tournamentsPlayed - sa.tournamentsPlayed;
      if (sortBy === 'winRate') return sb.winRate - sa.winRate;
      return 0;
    });

  // ── Create ────────────────────────────────────────────────────────────

  function generateUsernameFromName(): string {
    const base = newAlias.trim() || newName.trim();
    return base.toLowerCase().replace(/[^a-z0-9]/g, '');
  }

  async function handleCreate() {
    if (!newName.trim()) { setError(t('participants.errors.nameRequired')); return; }
    if (!newPassword.trim()) { setError(t('participants.errors.passwordRequired')); return; }
    if (newPassword.trim().length < 6) { setError(t('participants.errors.passwordTooShort')); return; }
    setCreating(true); setError('');
    try {
      const p = await createParticipant(newName, newAlias, newGameIds, newPrimaryGameId, newGameMainChars, communityId);
      const username = newUsername.trim() || generateUsernameFromName();
      const u = await createUserAccount(p.id, username, newPassword.trim(), newRole, communityId);
      const next = [...participants, p];
      setParticipants(next); refreshStats(next);
      const nextUsers = new Map(usersMap);
      nextUsers.set(p.id, u);
      setUsersMap(nextUsers);
      setNewName(''); setNewAlias(''); setNewGameIds([]); setNewGameMainChars({}); setNewPrimaryGameId(null);
      setNewUsername(''); setNewPassword(''); setNewRole('user');
      setShowCreateForm(false);
    } catch (err: any) { setError(err.message); }
    finally { setCreating(false); }
  }

  // ── Edit ──────────────────────────────────────────────────────────────

  function goToEdit(p: GlobalParticipant) {
    navigate(getPath(`participants/${p.id}`));
  }

  // ── Delete ────────────────────────────────────────────────────────────

  function requestDelete(id: string, name: string) {
    setDeleteTarget({ id, name });
  }

  function cancelDelete() {
    setDeleteTarget(null);
  }

  async function confirmDelete() {
    if (!deleteTarget) return;
    try {
      await removeParticipant(deleteTarget.id);
      const user = usersMap.get(deleteTarget.id);
      if (user) await deleteUserAccount(user.id);
      const next = participants.filter((p) => p.id !== deleteTarget.id);
      const nextUsers = new Map(usersMap);
      nextUsers.delete(deleteTarget.id);
      setParticipants(next); refreshStats(next);
      setUsersMap(nextUsers);
    } catch (err: any) { setError(err.message); }
    setDeleteTarget(null);
  }

  // ── Account management ahora vive en el perfil ────────────────────────

  // ── Render ────────────────────────────────────────────────────────────

  // Authenticated users that don't belong to this community (non-superadmin)
  // must not access the participants roster of another community.
  if (user && !isInMyCommunity) {
    return (
      <div className="participants-page">
        <div className="container">
          <div className="empty-state card" style={{ marginTop: '2rem' }}>
            <h3>{t('participants.accessDenied')}</h3>
            <p className="text-secondary">
              {t('participants.accessDeniedDesc')}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="participants-page">
      <div className="container">

        <div className="pp-header">
          <div>
            <h1>{t('participants.title')} <span className="pp-count">{participants.length}</span></h1>
            <p className="text-secondary">{t('participants.subtitle')}</p>
          </div>
          {canAdminCurrentCommunity && (
            <button className="btn-primary" onClick={() => { setShowCreateForm(true); setError(''); }}>
              + {t('participants.newParticipant')}
            </button>
          )}
        </div>

        {error && <div className="error-message">{error}</div>}

        {showCreateForm && (
          <div className="pp-create-form card">
            <div className="pp-create-header">
              <span className="pp-create-icon"><i className="fas fa-user-plus" /></span>
              <div>
                <h3>{t('participants.createTitle')}</h3>
                <p className="text-secondary">{t('participants.createSubtitle')}</p>
              </div>
            </div>

            <div className="pp-create-grid">
              <div className="pp-create-section">
                <h4>{t('participants.identity')}</h4>
                <div className="form-group">
                  <label>{t('participants.name')} *</label>
                  <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreateForm(false); }}
                    placeholder={t('participants.namePlaceholder')} autoFocus />
                </div>
                <div className="form-group">
                  <label>{t('participants.alias')}</label>
                  <input type="text" value={newAlias} onChange={(e) => setNewAlias(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreateForm(false); }}
                    placeholder={t('participants.aliasPlaceholder')} />
                </div>
              </div>

              <div className="pp-create-section">
                <h4>{t('participants.gameAndMain')}</h4>
                <div className="pp-game-list">
                  {GAMES.map((g) => (
                    <div key={g.id} className="pp-game-row">
                      <label className="pp-game-checkbox">
                        <input
                          type="checkbox"
                          checked={newGameIds.includes(g.id)}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...newGameIds, g.id]
                              : newGameIds.filter((id) => id !== g.id);
                            setNewGameIds(next);
                            if (!next.includes(newPrimaryGameId ?? '')) {
                              setNewPrimaryGameId(next[0] ?? null);
                            }
                            if (!e.target.checked) {
                              const nextMains = { ...newGameMainChars };
                              delete nextMains[g.id];
                              setNewGameMainChars(nextMains);
                            }
                          }}
                        />
                        <span>{g.shortName}</span>
                      </label>
                      {newGameIds.includes(g.id) && (
                        <select
                          className="form-control"
                          value={newGameMainChars[g.id] ?? ''}
                          onChange={(e) => setNewGameMainChars({ ...newGameMainChars, [g.id]: e.target.value || null })}
                        >
                          <option value="">{t('common.noMain')}</option>
                          {g.characters.map((c) => (
                            <option key={c.id} value={c.id}>{c.name}</option>
                          ))}
                        </select>
                      )}
                    </div>
                  ))}
                </div>
                {newGameIds.length > 0 && (
                  <div className="form-group">
                    <label>{t('participants.primaryGame')}</label>
                    <select
                      className="form-control"
                      value={newPrimaryGameId ?? ''}
                      onChange={(e) => setNewPrimaryGameId(e.target.value || null)}
                    >
                      {newGameIds.map((gId) => (
                        <option key={gId} value={gId}>{getGame(gId)?.shortName ?? gId}</option>
                      ))}
                    </select>
                  </div>
                )}
              </div>

              <div className="pp-create-section">
                <h4>{t('participants.loginAccount')}</h4>
                <p className="text-secondary text-sm mb-2">{t('participants.loginAccountHint')}</p>
                <div className="form-group">
                  <label>{t('participants.username')} <span className="text-secondary">{t('participants.usernameAuto')}</span></label>
                  <input type="text" value={newUsername}
                    onChange={(e) => setNewUsername(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setShowCreateForm(false); setNewName(''); setNewAlias(''); setNewGameIds([]); setNewGameMainChars({}); setNewPrimaryGameId(null); setNewUsername(''); setNewPassword(''); setNewRole('user'); setError(''); }}}
                    placeholder={generateUsernameFromName() || t('participants.usernamePlaceholder')} />
                </div>
                <div className="form-group">
                  <label>{t('participants.password')} *</label>
                  <input type="password" value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') { setShowCreateForm(false); setNewName(''); setNewAlias(''); setNewGameIds([]); setNewGameMainChars({}); setNewPrimaryGameId(null); setNewUsername(''); setNewPassword(''); setNewRole('user'); setError(''); }}}
                    placeholder={t('participants.passwordPlaceholder')} />
                </div>
                {canAssignRole && roleOptions.length > 1 && (
                  <div className="form-group">
                    <label>{t('participants.role')}</label>
                    <select value={newRole} onChange={(e) => setNewRole(e.target.value as AuthUser['role'])}>
                      {roleOptions.map((r) => <option key={r} value={r}>{t(`participantProfile.edit.roles.${r}`)}</option>)}
                    </select>
                  </div>
                )}
              </div>
            </div>

            <div className="pp-create-preview">
              <h4>{t('participants.preview')}</h4>
              <div className="pp-preview-item">
                <div className="pp-preview-avatar" style={{ background: avatarColor(newName || '?') }}>
                  {initials(newName || '?')}
                </div>
                <div className="pp-preview-info">
                  <div className="pp-preview-name-row">
                    <span className="pp-preview-name">{newName.trim() || t('participants.namePlaceholder')}</span>
                    {newAlias.trim() && (
                      <span className="pp-preview-alias">{newAlias.trim()}</span>
                    )}
                  </div>
                  {newPrimaryGameId && (
                    <div className="pp-item-tags">
                      <span className="pp-item-tag pp-item-tag-game">{getGame(newPrimaryGameId)?.shortName}</span>
                      <span className="pp-item-tag pp-item-tag-char">{newGameMainChars[newPrimaryGameId] ? getCharacter(newPrimaryGameId, newGameMainChars[newPrimaryGameId])?.name : t('common.noMain')}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pp-create-actions">
              <button className="btn-outline" onClick={() => {
                setShowCreateForm(false);
                setNewName(''); setNewAlias(''); setNewGameIds([]); setNewGameMainChars({}); setNewPrimaryGameId(null);
                setNewUsername(''); setNewPassword(''); setNewRole('user'); setError('');
              }}>{t('participants.cancel')}</button>
              <button className="btn-primary" onClick={handleCreate} disabled={creating}>
                {creating ? t('participants.creating') : t('participants.create')}
              </button>
            </div>
          </div>
        )}

        <div className="pp-filters card">
          <input type="text" className="pp-search" placeholder={t('participants.searchPlaceholder')}
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          <div className="pp-sort">
            <span className="text-secondary text-sm">{t('participants.sortBy')}</span>
            {(['name', 'wins', 'tournamentsPlayed', 'winRate'] as SortKey[]).map((key) => (
              <button key={key} className={`pp-sort-btn ${sortBy === key ? 'active' : ''}`}
                onClick={() => setSortBy(key)}>
                {key === 'name' ? t('participants.sortName') : key === 'wins' ? t('participants.sortWins') : key === 'tournamentsPlayed' ? t('participants.sortPlayed') : t('participants.sortWinRate')}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <Loading message={t('participants.loading')} />
        ) : filtered.length === 0 ? (
          <div className="empty-state card">
            {participants.length === 0
              ? <><h3>{t('participants.emptyNoParticipants')}</h3><p className="text-secondary">{t('participants.emptyNoParticipantsDesc')}</p></>
              : <><h3>{t('participants.emptyNoResults')}</h3><p className="text-secondary">{t('participants.emptyNoResultsDesc', { query: searchQuery })}</p></>}
          </div>
        ) : (
          <div className="pp-list">
            {filtered.map((p) => {
              const s = getStats(p.id);
              return (
                <div key={p.id} className="pp-item card">
                  <div className="pp-item-info" onClick={() => navigate(getPath(`participants/${p.id}`))}>
                    <div className="pp-item-avatar" style={{ background: avatarColor(p.name) }}>
                      {initials(p.name)}
                    </div>
                    <div className="pp-item-name-block">
                      <div className="pp-item-name-row">
                        <span className="pp-item-name">{p.name}</span>
                        {p.alias && <span className="pp-item-alias">{p.alias}</span>}
                      </div>
                      {p.gameId && p.mainCharacterId && (
                        <div className="pp-item-tags">
                          <span className="pp-item-tag pp-item-tag-game">{getGame(p.gameId)?.shortName}</span>
                          <span className="pp-item-tag pp-item-tag-char">
                            {getCharacter(p.gameId, p.mainCharacterId)?.name}
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="pp-item-stats">
                      <span className="pp-stat">
                        <span className="pp-stat-label">{t('participants.stats.played')}</span>
                        <span className="pp-stat-value">{s.tournamentsPlayed}</span>
                      </span>
                      <span className="pp-stat">
                        <span className="pp-stat-label"><i className="fas fa-trophy" /> {t('participants.stats.wins')}</span>
                        <span className="pp-stat-value pp-stat-wins">{s.wins}</span>
                      </span>
                      <span className="pp-stat">
                        <span className="pp-stat-label">{t('participants.stats.winRate')}</span>
                        <span className="pp-stat-value">{s.winRate > 0 ? `${s.winRate}%` : '—'}</span>
                      </span>
                    </div>
                  </div>
                  <div className="pp-item-actions">
                    {/* Account badge */}
                    {(() => {
                      const u = usersMap.get(p.id);
                      return u ? (
                        <span className={`pp-account-badge ${u.isActive ? 'has-account' : 'inactive-account'}`}>
                          <i className="fas fa-user-check" />
                          {u.isActive ? `${u.username} (${u.role})` : t('participants.accountInactive')}
                        </span>
                      ) : (
                        <span className="pp-account-badge no-account">
                          <i className="fas fa-user-slash" />
                          {t('participants.noAccount')}
                        </span>
                      );
                    })()}
                    {canAdminCurrentCommunity && (
                      <button className="btn-icon" onClick={() => goToEdit(p)} title={t('participants.edit')}><i className="fas fa-pen" /></button>
                    )}
                    {canAdminCurrentCommunity && (
                      <button className="btn-icon btn-danger" onClick={() => requestDelete(p.id, p.name)} title={t('participants.delete')}><i className="fas fa-trash" /></button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title={t('participants.deleteTitle')}
        message={deleteTarget ? t('participants.deleteMessage', { name: deleteTarget.name }) : ''}
        onCancel={cancelDelete}
        onConfirm={confirmDelete}
        confirmText={t('participants.deleteConfirm')}
      />

      {/* Account management ahora vive en el perfil del participant */}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────

function initials(name: string): string {
  return name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
}

function avatarColor(name: string): string {
  const colors = ['#6366f1','#8b5cf6','#ec4899','#f59e0b','#10b981','#3b82f6','#ef4444','#14b8a6'];
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
  return colors[Math.abs(hash) % colors.length];
}

export { initials, avatarColor };
export default ParticipantsPage;
