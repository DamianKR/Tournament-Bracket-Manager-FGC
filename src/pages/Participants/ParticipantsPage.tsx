import { useEffect, useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlobalParticipant, ComputedStats } from '@/models/types';
import type { AuthUser } from '@/models/auth';
import { getCharacter, getGame } from '@/data/games';
import {
  getAllParticipants,
  getAllParticipantsAsync,
  createParticipant,
  updateParticipant,
  removeParticipant,
  computeAllStats,
} from '@/services/participants/participantService';
import {
  listUsers,
  createUserAccount,
  updateUserAccount,
  deactivateUser,
} from '@/services/auth/authService';
import { saveGlobalParticipants } from '@/services/storage/localStorage';
import CharacterSelect from '@/components/CharacterSelect/CharacterSelect';
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal';
import './ParticipantsPage.css';

type SortKey = 'name' | 'wins' | 'tournamentsPlayed' | 'winRate';

function ParticipantsPage() {
  const navigate = useNavigate();
  const [participants, setParticipants] = useState<GlobalParticipant[]>([]);
  const [statsMap, setStatsMap] = useState<Map<string, ComputedStats>>(new Map());
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<SortKey>('name');
  const [error, setError] = useState('');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newAlias, setNewAlias] = useState('');
  const [newGameId, setNewGameId] = useState<string | null>(null);
  const [newCharacterId, setNewCharacterId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editAlias, setEditAlias] = useState('');
  const editInputRef = useRef<HTMLInputElement>(null);

  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

  // ── Account management ────────────────────────────────────────────────
  const [usersMap, setUsersMap] = useState<Map<string, AuthUser>>(new Map());
  const [accountTarget, setAccountTarget] = useState<{ participant: GlobalParticipant; user: AuthUser | null } | null>(null);
  const [acctUsername, setAcctUsername] = useState('');
  const [acctPassword, setAcctPassword] = useState('');
  const [acctConfirm, setAcctConfirm] = useState('');
  const [acctRole, setAcctRole] = useState<'admin' | 'user'>('user');
  const [acctIsActive, setAcctIsActive] = useState(true);
  const [acctError, setAcctError] = useState('');
  const [acctSaving, setAcctSaving] = useState(false);

  useEffect(() => { loadAll(); }, []);
  useEffect(() => { if (editingId && editInputRef.current) editInputRef.current.focus(); }, [editingId]);

  function refreshStats(data: GlobalParticipant[]) {
    setStatsMap(computeAllStats(data));
  }

  async function loadAll() {
    setLoading(true);
    try {
      const cached = getAllParticipants();
      if (cached.length > 0) { setParticipants(cached); refreshStats(cached); }

      const [serverData, userList] = await Promise.all([
        getAllParticipantsAsync(),
        listUsers().catch(() => [] as AuthUser[]),
      ]);

      if (serverData.length === 0 && cached.length > 0) {
        saveGlobalParticipants(cached);
        setParticipants(cached);
        refreshStats(cached);
      } else {
        setParticipants(serverData);
        refreshStats(serverData);
      }

      const map = new Map<string, AuthUser>();
      userList.forEach(u => { if (u.participantId) map.set(u.participantId, u); });
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

  async function handleCreate() {
    if (!newName.trim()) { setError('Name is required'); return; }
    setCreating(true); setError('');
    try {
      const p = await createParticipant(newName, newAlias, newGameId, newCharacterId);
      const next = [...participants, p];
      setParticipants(next); refreshStats(next);
      setNewName(''); setNewAlias(''); setNewGameId(null); setNewCharacterId(null);
      setShowCreateForm(false);
    } catch (err: any) { setError(err.message); }
    finally { setCreating(false); }
  }

  // ── Edit ──────────────────────────────────────────────────────────────

  function startEdit(p: GlobalParticipant) {
    setEditingId(p.id); setEditName(p.name); setEditAlias(p.alias ?? '');
  }

  async function saveEdit() {
    if (!editingId) return;
    setError('');
    try {
      const updated = await updateParticipant(editingId, { name: editName, alias: editAlias });
      const next = participants.map((p) => (p.id === editingId ? updated : p));
      setParticipants(next); refreshStats(next);
    } catch (err: any) { setError(err.message); }
    finally { setEditingId(null); }
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
      const next = participants.filter((p) => p.id !== deleteTarget.id);
      setParticipants(next); refreshStats(next);
    } catch (err: any) { setError(err.message); }
    setDeleteTarget(null);
  }

  // ── Account modal ────────────────────────────────────────────────────

  function openAccountModal(p: GlobalParticipant) {
    const existing = usersMap.get(p.id) ?? null;
    setAccountTarget({ participant: p, user: existing });
    setAcctUsername(existing?.username ?? '');
    setAcctPassword('');
    setAcctConfirm('');
    setAcctRole(existing?.role ?? 'user');
    setAcctIsActive(existing?.isActive ?? true);
    setAcctError('');
  }

  function closeAccountModal() {
    setAccountTarget(null);
    setAcctError('');
  }

  async function saveAccount() {
    if (!accountTarget) return;
    const { participant, user } = accountTarget;

    if (!user) {
      // Crear nueva cuenta
      if (!acctUsername.trim()) { setAcctError('Username is required'); return; }
      if (acctPassword.length < 6) { setAcctError('Password must be at least 6 characters'); return; }
      if (acctPassword !== acctConfirm) { setAcctError('Passwords do not match'); return; }
    }

    setAcctSaving(true);
    setAcctError('');
    try {
      if (!user) {
        const newUser = await createUserAccount(participant.id, acctUsername.trim(), acctPassword, acctRole);
        const next = new Map(usersMap);
        next.set(participant.id, newUser);
        setUsersMap(next);
      } else {
        const updates: Parameters<typeof updateUserAccount>[1] = {};
        if (acctUsername.trim() && acctUsername.trim() !== user.username) updates.username = acctUsername.trim();
        if (acctPassword.trim()) updates.password = acctPassword.trim();
        if (acctRole !== user.role) updates.role = acctRole;
        if (acctIsActive !== user.isActive) updates.isActive = acctIsActive;

        if (Object.keys(updates).length > 0) {
          const updated = await updateUserAccount(user.id, updates);
          const next = new Map(usersMap);
          next.set(participant.id, updated);
          setUsersMap(next);
        }
      }
      closeAccountModal();
    } catch (err: any) {
      setAcctError(err.message || 'Failed to save account');
    } finally {
      setAcctSaving(false);
    }
  }

  async function handleDeactivateAccount() {
    if (!accountTarget?.user) return;
    setAcctSaving(true);
    try {
      await deactivateUser(accountTarget.user.id);
      const next = new Map(usersMap);
      const updated = { ...accountTarget.user, isActive: false };
      next.set(accountTarget.participant.id, updated);
      setUsersMap(next);
      closeAccountModal();
    } catch (err: any) {
      setAcctError(err.message || 'Failed to deactivate account');
    } finally {
      setAcctSaving(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────

  return (
    <div className="participants-page">
      <div className="container">

        <div className="pp-header">
          <div>
            <h1>Participants <span className="pp-count">{participants.length}</span></h1>
            <p className="text-secondary">Global roster — reusable across all tournaments</p>
          </div>
          <button className="btn-primary" onClick={() => { setShowCreateForm(true); setError(''); }}>
            + New Participant
          </button>
        </div>

        {error && <div className="error-message">{error}</div>}

        {showCreateForm && (
          <div className="pp-create-form card">
            <div className="pp-create-header">
              <span className="pp-create-icon"><i className="fas fa-user-plus" /></span>
              <div>
                <h3>Create New Participant</h3>
                <p className="text-secondary">Add a new player to the global roster</p>
              </div>
            </div>

            <div className="pp-create-grid">
              <div className="pp-create-section">
                <h4>Identity</h4>
                <div className="form-group">
                  <label>Name *</label>
                  <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreateForm(false); }}
                    placeholder="Player name" autoFocus />
                </div>
                <div className="form-group">
                  <label>Alias / Gamertag</label>
                  <input type="text" value={newAlias} onChange={(e) => setNewAlias(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') setShowCreateForm(false); }}
                    placeholder="Optional short name" />
                </div>
              </div>

              <div className="pp-create-section">
                <h4>Game & Main</h4>
                <CharacterSelect
                  gameId={newGameId}
                  characterId={newCharacterId}
                  onGameChange={setNewGameId}
                  onCharacterChange={setNewCharacterId}
                />
              </div>
            </div>

            <div className="pp-create-preview">
              <h4>Preview</h4>
              <div className="pp-preview-item">
                <div className="pp-preview-avatar" style={{ background: avatarColor(newName || '?') }}>
                  {initials(newName || '?')}
                </div>
                <div className="pp-preview-info">
                  <div className="pp-preview-name-row">
                    <span className="pp-preview-name">{newName.trim() || 'Player Name'}</span>
                    {newAlias.trim() && (
                      <span className="pp-preview-alias">{newAlias.trim()}</span>
                    )}
                  </div>
                  {newGameId && newCharacterId && (
                    <div className="pp-item-tags">
                      <span className="pp-item-tag pp-item-tag-game">{getGame(newGameId)?.shortName}</span>
                      <span className="pp-item-tag pp-item-tag-char">{getCharacter(newGameId, newCharacterId)?.name}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="pp-create-actions">
              <button className="btn-outline" onClick={() => setShowCreateForm(false)}>Cancel</button>
              <button className="btn-primary" onClick={handleCreate} disabled={creating}>
                {creating ? 'Creating…' : 'Create Participant'}
              </button>
            </div>
          </div>
        )}

        <div className="pp-filters card">
          <input type="text" className="pp-search" placeholder="Search by name or alias…"
            value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} />
          <div className="pp-sort">
            <span className="text-secondary text-sm">Sort by:</span>
            {(['name', 'wins', 'tournamentsPlayed', 'winRate'] as SortKey[]).map((key) => (
              <button key={key} className={`pp-sort-btn ${sortBy === key ? 'active' : ''}`}
                onClick={() => setSortBy(key)}>
                {key === 'name' ? 'Name' : key === 'wins' ? 'Wins' : key === 'tournamentsPlayed' ? 'Played' : 'Win %'}
              </button>
            ))}
          </div>
        </div>

        {loading ? (
          <div className="pp-loading text-secondary text-center">Loading participants…</div>
        ) : filtered.length === 0 ? (
          <div className="empty-state card">
            {participants.length === 0
              ? <><h3>No participants yet</h3><p className="text-secondary">Create your first participant to get started</p></>
              : <><h3>No results</h3><p className="text-secondary">No participants match "{searchQuery}"</p></>}
          </div>
        ) : (
          <div className="pp-list">
            {filtered.map((p) => {
              const s = getStats(p.id);
              return (
                <div key={p.id} className="pp-item card">
                  {editingId === p.id ? (
                    <div className="pp-item-edit">
                      <input ref={editInputRef} type="text" value={editName}
                        onChange={(e) => setEditName(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                        placeholder="Name" />
                      <input type="text" value={editAlias}
                        onChange={(e) => setEditAlias(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                        placeholder="Alias" />
                      <div className="pp-item-edit-actions">
                        <button className="btn-outline" onClick={() => setEditingId(null)}>Cancel</button>
                        <button className="btn-primary" onClick={saveEdit}>Save</button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="pp-item-info" onClick={() => navigate(`/participants/${p.id}`)}>
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
                            <span className="pp-stat-label">Played</span>
                            <span className="pp-stat-value">{s.tournamentsPlayed}</span>
                          </span>
                          <span className="pp-stat">
                            <span className="pp-stat-label"><i className="fas fa-trophy" /> Wins</span>
                            <span className="pp-stat-value pp-stat-wins">{s.wins}</span>
                          </span>
                          <span className="pp-stat">
                            <span className="pp-stat-label">Win %</span>
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
                              {u.isActive ? u.username : 'Inactive'}
                            </span>
                          ) : (
                            <span className="pp-account-badge no-account">
                              <i className="fas fa-user-slash" />
                              No account
                            </span>
                          );
                        })()}
                        <button className="btn-icon" title="Manage Account" onClick={() => openAccountModal(p)}>
                          <i className="fas fa-key" />
                        </button>
                        <button className="btn-icon" onClick={() => startEdit(p)} title="Edit"><i className="fas fa-pen" /></button>
                        <button className="btn-icon btn-danger" onClick={() => requestDelete(p.id, p.name)} title="Delete"><i className="fas fa-trash" /></button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Delete participant"
        message={deleteTarget ? `Remove "${deleteTarget.name}" from the global roster? This will keep tournaments they played in, but the participant profile will be removed.` : ''}
        onCancel={cancelDelete}
        onConfirm={confirmDelete}
        confirmText="Delete"
      />

      {/* Account Management Modal */}
      {accountTarget && (
        <div className="modal-overlay" onClick={closeAccountModal}>
          <div className="pp-account-modal card" onClick={e => e.stopPropagation()}>
            <div className="pp-account-modal-header">
              <div>
                <h3>{accountTarget.user ? 'Edit Account' : 'Create Account'}</h3>
                <p className="text-secondary">{accountTarget.participant.name}{accountTarget.participant.alias ? ` — ${accountTarget.participant.alias}` : ''}</p>
              </div>
              <button className="btn-icon" onClick={closeAccountModal}><i className="fas fa-times" /></button>
            </div>

            <div className="pp-account-modal-body">
              <div className="form-group">
                <label>Username</label>
                <input
                  type="text"
                  value={acctUsername}
                  onChange={e => setAcctUsername(e.target.value)}
                  placeholder="username"
                  autoFocus
                  autoComplete="off"
                />
              </div>

              <div className="form-group">
                <label>{accountTarget.user ? 'New Password (leave blank to keep current)' : 'Password'}</label>
                <input
                  type="password"
                  value={acctPassword}
                  onChange={e => setAcctPassword(e.target.value)}
                  placeholder={accountTarget.user ? 'Leave blank to keep current' : 'At least 6 characters'}
                  autoComplete="new-password"
                />
              </div>

              {(!accountTarget.user || acctPassword) && (
                <div className="form-group">
                  <label>Confirm Password</label>
                  <input
                    type="password"
                    value={acctConfirm}
                    onChange={e => setAcctConfirm(e.target.value)}
                    placeholder="Repeat password"
                    autoComplete="new-password"
                  />
                </div>
              )}

              <div className="form-group">
                <label>Role</label>
                <select value={acctRole} onChange={e => setAcctRole(e.target.value as 'admin' | 'user')}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>

              {accountTarget.user && (
                <div className="form-group pp-account-active-toggle">
                  <label>
                    <input
                      type="checkbox"
                      checked={acctIsActive}
                      onChange={e => setAcctIsActive(e.target.checked)}
                    />
                    <span>Account active</span>
                  </label>
                </div>
              )}

              {acctError && <div className="error-message">{acctError}</div>}
            </div>

            <div className="pp-account-modal-actions">
              {accountTarget.user && accountTarget.user.isActive && (
                <button className="btn-outline btn-danger-outline" onClick={handleDeactivateAccount} disabled={acctSaving}>
                  Deactivate
                </button>
              )}
              <button className="btn-outline" onClick={closeAccountModal} disabled={acctSaving}>Cancel</button>
              <button className="btn-primary" onClick={saveAccount} disabled={acctSaving}>
                {acctSaving ? 'Saving…' : accountTarget.user ? 'Save Changes' : 'Create Account'}
              </button>
            </div>
          </div>
        </div>
      )}
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
