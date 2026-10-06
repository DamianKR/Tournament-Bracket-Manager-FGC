/**
 * UsersAdminPage — Superadmin only
 *
 * Lists every non-superadmin user with their community memberships as
 * expandable sub-rows.  Two distinct delete actions:
 *   • Delete user       → removes account + all linked participants (all communities)
 *   • Delete membership → removes ONE community's participant record only
 *
 * Superadmin accounts are excluded from the list intentionally.
 */

import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useToast } from '@/contexts/NotificationContext';
import { useAuth } from '@/contexts/AuthContext';
import type { AuthUser, CommunityMembership } from '@/models/auth';
import type { GlobalParticipant } from '@/models/types';
import type { Community } from '@/models/community';
import { listUsers, deleteUserAccountOffline } from '@/services/auth/authService';
import { getAllParticipantsAsync, removeParticipant } from '@/services/participants/participantService';
import { getAllCommunities } from '@/services/communities/communityService';
import { initials, avatarColor } from '@/pages/Participants/ParticipantsPage';
import ConfirmModal from '@/components/ConfirmModal/ConfirmModal';
import Loading from '@/components/Loading/Loading';
import './UsersAdminPage.css';

// ── Types ──────────────────────────────────────────────────────────────────

interface MembershipRow {
  communityId: string;
  participantId: string;
  role: string;
  isHome: boolean;
}

interface DeleteMemberTarget {
  user: AuthUser;
  communityId: string;
  participantId: string;
  communityName: string;
  participantName: string;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

/** Collects all community memberships for a user, deduped by communityId. */
function getUserMemberships(u: AuthUser): MembershipRow[] {
  const seen = new Set<string>();
  const rows: MembershipRow[] = [];

  if (u.communityId && u.participantId) {
    seen.add(u.communityId);
    const homeRole =
      (u.memberships ?? []).find(m => m.communityId === u.communityId)?.role ?? 'user';
    rows.push({
      communityId: u.communityId,
      participantId: u.participantId,
      role: homeRole,
      isHome: true,
    });
  }

  for (const m of u.memberships ?? []) {
    if (m.communityId && m.participantId && !seen.has(m.communityId)) {
      seen.add(m.communityId);
      rows.push({
        communityId: m.communityId,
        participantId: m.participantId,
        role: m.role ?? 'user',
        isHome: false,
      });
    }
  }

  return rows;
}

function roleBadge(role: string) {
  if (role === 'community_admin') return <span className="ua-badge ua-badge--owner">{role}</span>;
  if (role === 'admin')           return <span className="ua-badge ua-badge--admin">{role}</span>;
  return                                  <span className="ua-badge ua-badge--user">{role}</span>;
}

// ── Component ──────────────────────────────────────────────────────────────

function UsersAdminPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const toast = useToast();
  const { isSuperAdmin, isLoading: authLoading } = useAuth();

  const [users, setUsers] = useState<AuthUser[]>([]);
  const [communities, setCommunities] = useState<Community[]>([]);
  const [participantMap, setParticipantMap] = useState<Map<string, GlobalParticipant>>(new Map());
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [communityFilter, setCommunityFilter] = useState('all');
  const [expandedUsers, setExpandedUsers] = useState<Set<string>>(new Set());

  const [deleteUserTarget, setDeleteUserTarget] = useState<AuthUser | null>(null);
  const [deletingUser, setDeletingUser] = useState(false);
  const [deleteMemberTarget, setDeleteMemberTarget] = useState<DeleteMemberTarget | null>(null);
  const [deletingMember, setDeletingMember] = useState(false);

  // Guard
  useEffect(() => {
    if (!authLoading && !isSuperAdmin) navigate('/communities', { replace: true });
  }, [authLoading, isSuperAdmin, navigate]);

  useEffect(() => {
    if (isSuperAdmin) loadAll();
  }, [isSuperAdmin]);

  async function loadAll() {
    setLoading(true);
    setLoadError('');
    try {
      const [userList, communityList, allParticipants] = await Promise.all([
        listUsers(),
        getAllCommunities(),
        getAllParticipantsAsync(),
      ]);
      // Exclude superadmin accounts from this management page
      const manageable = userList.filter(u => u.role !== 'superadmin');
      setUsers(manageable);
      setCommunities(communityList);
      const pMap = new Map<string, GlobalParticipant>();
      for (const p of allParticipants) pMap.set(p.id, p);
      setParticipantMap(pMap);
      setExpandedUsers(new Set(manageable.map(u => u.id)));
    } catch (err: any) {
      setLoadError(err.message || 'Failed to load users');
    } finally {
      setLoading(false);
    }
  }

  // ── Filtering ─────────────────────────────────────────────────────────────

  const filtered = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return users.filter(u => {
      if (q && !u.username.toLowerCase().includes(q)) return false;
      if (communityFilter === 'all') return true;
      if (u.communityId === communityFilter) return true;
      return (u.memberships ?? []).some(
        m => m.communityId === communityFilter && m.isActive !== false,
      );
    });
  }, [users, searchQuery, communityFilter]);

  // ── Expand toggle ─────────────────────────────────────────────────────────

  function toggleExpand(uid: string) {
    setExpandedUsers(prev => {
      const next = new Set(prev);
      if (next.has(uid)) next.delete(uid); else next.add(uid);
      return next;
    });
  }

  // ── Delete user ───────────────────────────────────────────────────────────

  async function confirmDeleteUser() {
    if (!deleteUserTarget) return;
    const u = deleteUserTarget;
    setDeletingUser(true);
    try {
      for (const m of getUserMemberships(u)) {
        try { await removeParticipant(m.participantId); } catch {}
      }
      await deleteUserAccountOffline(u.id);
      setUsers(prev => prev.filter(x => x.id !== u.id));
      toast.success(t('usersAdmin.deleteUserSuccess', { username: u.username }));
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete user');
    } finally {
      setDeletingUser(false);
      setDeleteUserTarget(null);
    }
  }

  // ── Delete membership ─────────────────────────────────────────────────────

  async function confirmDeleteMembership() {
    if (!deleteMemberTarget) return;
    const { user, participantId } = deleteMemberTarget;
    setDeletingMember(true);
    try {
      await removeParticipant(participantId);
      setUsers(prev => prev.map(u => {
        if (u.id !== user.id) return u;
        return {
          ...u,
          participantId: u.participantId === participantId ? null : u.participantId,
          communityId:   u.participantId === participantId ? null : u.communityId,
          memberships:   (u.memberships ?? []).filter(
            (m: CommunityMembership) => m.participantId !== participantId,
          ),
        };
      }));
      toast.success(t('usersAdmin.deleteMemberSuccess'));
    } catch (err: any) {
      toast.error(err.message || 'Failed to delete membership');
    } finally {
      setDeletingMember(false);
      setDeleteMemberTarget(null);
    }
  }

  // ── Display helpers ───────────────────────────────────────────────────────

  const communityName = (cid: string) =>
    communities.find(c => c.id === cid)?.name ?? cid;

  const participantName = (pid: string) =>
    participantMap.get(pid)?.name ?? null;

  // ── Render ────────────────────────────────────────────────────────────────

  if (authLoading || (!isSuperAdmin && loading)) return null;

  return (
    <div className="ua-page">

      {/* ── Dark hero ─────────────────────────────────────────────── */}
      <div className="ua-hero">
        <div className="container">
          <div className="ua-hero-inner">
            <div className="ua-hero-left">
              <div className="ua-hero-badges">
                <span className="ua-superadmin-pill">SUPERADMIN</span>
              </div>
              <h1 className="ua-hero-title">
                <i className="fas fa-users-cog" />
                {t('usersAdmin.title')}
                {!loading && (
                  <span className="ua-hero-count">{filtered.length}</span>
                )}
              </h1>
              <p className="ua-hero-sub">
                {t('usersAdmin.subtitle')}
              </p>
            </div>
            <div className="ua-hero-right">
              {!loading && users.length > 0 && (
                <>
                  <button
                    className="ua-hero-btn"
                    onClick={() => setExpandedUsers(new Set(filtered.map(u => u.id)))}
                  >
                    <i className="fas fa-expand-alt" />
                    {t('usersAdmin.expandAll')}
                  </button>
                  <button
                    className="ua-hero-btn"
                    onClick={() => setExpandedUsers(new Set())}
                  >
                    <i className="fas fa-compress-alt" />
                    {t('usersAdmin.collapseAll')}
                  </button>
                </>
              )}
              <button className="ua-hero-btn ua-hero-btn--icon" onClick={loadAll} title={t('common.loading')}>
                <i className="fas fa-sync-alt" />
              </button>
            </div>
          </div>

          {/* Search + filter inside hero */}
          <div className="ua-hero-filters">
            <div className="ua-search-wrap">
              <i className="fas fa-search ua-search-icon" />
              <input
                className="ua-hero-search"
                type="text"
                placeholder={t('usersAdmin.searchPlaceholder')}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
            </div>
            <select
              className="ua-hero-select"
              value={communityFilter}
              onChange={e => setCommunityFilter(e.target.value)}
            >
              <option value="all">
                {t('usersAdmin.allCommunities')}
              </option>
              {communities.map(c => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      <div className="container ua-body">

        {/* ── Content ──────────────────────────────────────────────── */}
        {loading ? (
          <div className="pp-loading">
            <Loading message={t('usersAdmin.loading')} />
          </div>
        ) : loadError ? (
          <div className="error-message">{loadError}</div>
        ) : filtered.length === 0 ? (
          <div className="ua-empty">
            <i className="fas fa-user-slash" />
            <p>{t('usersAdmin.noUsers')}</p>
          </div>
        ) : (
          <div className="pp-list">
            {filtered.map(u => {
              const memberships = getUserMemberships(u);
              const expanded    = expandedUsers.has(u.id);
              const color       = avatarColor(u.username);
              const ini         = initials(u.username);

              return (
                <div key={u.id} className={`ua-user-card${!u.isActive ? ' ua-user-card--inactive' : ''}`}>

                  {/* ── User row ─────────────────────────────────── */}
                  <div className="ua-user-row" onClick={() => toggleExpand(u.id)}>

                    <div className="ua-user-left">
                      {/* Expand chevron */}
                      <i
                        className={`fas fa-chevron-${expanded ? 'down' : 'right'} ua-chevron`}
                        aria-hidden
                      />

                      {/* Avatar */}
                      <div className="pp-item-avatar ua-avatar" style={{ background: color }}>
                        {ini}
                      </div>

                      {/* Name + meta */}
                      <div className="pp-item-name-block">
                        <div className="pp-item-name-row">
                          <span className="pp-item-name">{u.username}</span>
                          {!u.isActive && (
                            <span className="pp-item-alias ua-inactive">
                              {t('usersAdmin.inactive')}
                            </span>
                          )}
                        </div>
                        <div className="pp-item-tags">
                          <span className="ua-member-pill">
                            <i className="fas fa-layer-group" />
                            &nbsp;{memberships.length}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Delete user button */}
                    <div className="pp-item-actions" onClick={e => e.stopPropagation()}>
                      <button
                        className="ua-btn-danger-row"
                        disabled={deletingUser}
                        title={t('usersAdmin.deleteUserConfirmTitle')}
                        onClick={() => setDeleteUserTarget(u)}
                      >
                        <i className="fas fa-trash-alt" />
                        <span className="ua-btn-label">
                          {t('usersAdmin.deleteUser')}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* ── Membership sub-rows ───────────────────────── */}
                  {expanded && (
                    <div className="ua-memberships">
                      {memberships.length === 0 ? (
                        <div className="ua-no-memberships">
                          <i className="fas fa-unlink" />
                          {t('usersAdmin.noMemberships')}
                        </div>
                      ) : (
                        memberships.map(m => {
                          const cName = communityName(m.communityId);
                          const pName = participantName(m.participantId);
                          return (
                            <div key={m.communityId} className="ua-member-row">
                              <div className="ua-member-left">
                                <i className="fas fa-sitemap ua-member-icon" />
                                <div className="ua-member-info">
                                  <span className="ua-community-name">
                                    {cName}
                                    {m.isHome && (
                                      <i
                                        className="fas fa-home ua-home-icon"
                                        title={t('usersAdmin.home')}
                                      />
                                    )}
                                  </span>
                                  {pName && (
                                    <span className="ua-participant-name">
                                      <i className="fas fa-user" />
                                      {pName}
                                    </span>
                                  )}
                                </div>
                                {roleBadge(m.role)}
                              </div>
                              <div className="ua-member-action">
                                <button
                                  className="ua-btn-danger-member"
                                  disabled={deletingMember}
                                  title={t('usersAdmin.deleteMembership')}
                                  onClick={() => setDeleteMemberTarget({
                                    user: u,
                                    communityId: m.communityId,
                                    participantId: m.participantId,
                                    communityName: cName,
                                    participantName: pName ?? m.participantId,
                                  })}
                                >
                                  <i className="fas fa-user-minus" />
                                </button>
                              </div>
                            </div>
                          );
                        })
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Confirm: delete user ──────────────────────────────────── */}
      <ConfirmModal
        isOpen={!!deleteUserTarget}
        title={t('usersAdmin.deleteUserConfirmTitle')}
        message={deleteUserTarget
          ? t('usersAdmin.deleteUserConfirmMsg', { username: deleteUserTarget.username })
          : ''}
        onCancel={() => setDeleteUserTarget(null)}
        onConfirm={confirmDeleteUser}
        confirmText={t('usersAdmin.deleteUserConfirmBtn')}
      />

      {/* ── Confirm: delete membership ────────────────────────────── */}
      <ConfirmModal
        isOpen={!!deleteMemberTarget}
        title={t('usersAdmin.deleteMemberConfirmTitle')}
        message={deleteMemberTarget
          ? t('usersAdmin.deleteMemberConfirmMsg', {
              participant: deleteMemberTarget.participantName,
              community:   deleteMemberTarget.communityName,
            })
          : ''}
        onCancel={() => setDeleteMemberTarget(null)}
        onConfirm={confirmDeleteMembership}
        confirmText={t('common.delete')}
      />
    </div>
  );
}

export default UsersAdminPage;
