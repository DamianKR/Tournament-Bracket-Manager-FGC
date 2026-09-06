import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import { createCommunity, updateCommunity } from '@/services/communities/communityService';
import {
  requestJoinCommunity,
  getMembershipRequests,
  resolveMembershipRequest,
  type MembershipRequest,
} from '@/services/participants/participantService';
import type { Community } from '@/models/community';
import './CommunitiesPage.css';

function CommunitiesPage() {
  const { t } = useTranslation();
  const { isSuperAdmin, user } = useAuth();
  const { allCommunities, currentCommunity, refresh } = useCommunity();
  const [showCreate, setShowCreate] = useState(false);
  const [editingCommunity, setEditingCommunity] = useState<Community | null>(null);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [membershipRequests, setMembershipRequests] = useState<MembershipRequest[]>([]);
  const [requestError, setRequestError] = useState<string | null>(null);

  const isAdminRole = ['superadmin', 'community_admin', 'admin'].includes(user?.role ?? '');

  useEffect(() => {
    if (!user) return;
    getMembershipRequests().then(setMembershipRequests).catch(() => {});
  }, [user]);

  async function reloadRequests() {
    setMembershipRequests(await getMembershipRequests().catch(() => []));
  }

  /** Comunidades donde el user ya es miembro (hogar + membresías activas). */
  function myCommunityIds(): Set<string> {
    const ids = new Set<string>();
    if (user?.communityId) ids.add(user.communityId);
    for (const m of user?.memberships ?? []) {
      if (m.isActive !== false) ids.add(m.communityId);
    }
    for (const cid of user?.communityIds ?? []) ids.add(cid);
    return ids;
  }

  function pendingFor(communityId: string): MembershipRequest | undefined {
    return membershipRequests.find(r =>
      r.communityId === communityId &&
      (r.userId === user?.id || r.direction === 'request')
    );
  }

  async function handleRequestJoin(community: Community) {
    if (!user?.participantId) return;
    setRequestError(null);
    try {
      await requestJoinCommunity(user.participantId, community.id);
      await reloadRequests();
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Failed to request join');
    }
  }

  async function handleResolve(request: MembershipRequest, action: 'accept' | 'decline') {
    setRequestError(null);
    try {
      await resolveMembershipRequest(request.id, action);
      await reloadRequests();
      await refresh();
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Failed to resolve request');
    }
  }

  function resetForm() {
    setName('');
    setShortName('');
    setDescription('');
    setIsPublic(true);
    setError(null);
  }

  function openCreate() {
    setEditingCommunity(null);
    resetForm();
    setShowCreate(true);
  }

  function closeCreate() {
    resetForm();
    setShowCreate(false);
    setEditingCommunity(null);
  }

  function openEdit(community: Community) {
    setEditingCommunity(community);
    setName(community.name);
    setShortName(community.shortName);
    setDescription(community.description ?? '');
    setIsPublic(community.isPublic !== false);
    setError(null);
    setShowCreate(true);
  }

  function canEdit(community: Community): boolean {
    if (isSuperAdmin) return true;
    // community_admin puede editar su propia comunidad (ownerAdminId es el user.id, no participantId)
    if (user?.role === 'community_admin' && community.ownerAdminId === user.id) return true;
    // También permitir si la comunidad está en el scope del community_admin
    if (user?.role === 'community_admin' && user.communityId === community.id) return true;
    return false;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (editingCommunity) {
      setUpdating(true);
      try {
        await updateCommunity(editingCommunity.id, name.trim(), shortName.trim(), description.trim(), isPublic);
        resetForm();
        setShowCreate(false);
        setEditingCommunity(null);
        await refresh();
      } catch (err) {
        setError(err instanceof Error ? err.message : t('communities.errors.update'));
      } finally {
        setUpdating(false);
      }
      return;
    }

    setCreating(true);
    try {
      await createCommunity(name.trim(), shortName.trim(), description.trim(), isPublic);
      resetForm();
      setShowCreate(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('communities.errors.create'));
    } finally {
      setCreating(false);
    }
  }

  const hasCommunities = allCommunities.length > 0;

  return (
    <div className="communities-page">
      <div className="container">
        <div className="communities-header">
          <h1 className="communities-title">{t('communities.title')}</h1>
          {isSuperAdmin && hasCommunities && (
            <button className="btn-primary" onClick={openCreate}>
              <i className="fas fa-plus" /> {t('communities.newCommunity')}
            </button>
          )}
        </div>

        {hasCommunities ? (
          <section className="card communities-list">
            <h2 className="communities-section-title">{t('communities.existing')}</h2>
            <ul>
              {allCommunities.map((c) => (
                <li
                  key={c.id}
                  className={`communities-item ${currentCommunity?.id === c.id ? 'active' : ''}`}
                >
                  <Link to={`/c/${c.id}`} className="communities-link">
                    <span className="communities-name">{c.name}</span>
                    <span className="communities-short">{c.shortName}</span>
                    {isSuperAdmin && (
                      <span className={`communities-visibility ${c.isPublic !== false ? 'public' : 'private'}`}>
                        {t(c.isPublic !== false ? 'communities.public' : 'communities.private')}
                      </span>
                    )}
                    {currentCommunity?.id === c.id && <span className="communities-current">{t('communities.current')}</span>}
                  </Link>
                  {canEdit(c) && (
                    <button
                      className="communities-edit-btn"
                      onClick={() => openEdit(c)}
                      title={t('communities.edit')}
                      aria-label={`${t('communities.edit')} ${c.name}`}
                    >
                      <i className="fas fa-edit" />
                    </button>
                  )}
                  {user?.participantId && !myCommunityIds().has(c.id) && c.isPublic !== false && (
                    pendingFor(c.id) ? (
                      <span className="communities-pending">{t('communities.requestPending', { defaultValue: 'Solicitud pendiente' })}</span>
                    ) : (
                      <button
                        className="communities-join-btn btn-outline"
                        onClick={() => handleRequestJoin(c)}
                      >
                        <i className="fas fa-user-plus" /> {t('communities.requestJoin', { defaultValue: 'Solicitar unirse' })}
                      </button>
                    )
                  )}
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="card communities-empty">
            <h2 className="communities-section-title">{t('communities.emptyTitle')}</h2>
            <p className="text-secondary">
              {isSuperAdmin
                ? t('communities.emptyAdmin')
                : t('communities.emptyUser')}
            </p>
            {isSuperAdmin && (
              <button className="btn-primary" onClick={openCreate}>
                <i className="fas fa-plus" /> {t('communities.createCommunity')}
              </button>
            )}
          </section>
        )}

        {requestError && <p className="communities-error">{requestError}</p>}

        {membershipRequests.length > 0 && (
          <section className="card communities-requests">
            <h2 className="communities-section-title">
              {t('communities.pendingRequests', { defaultValue: 'Solicitudes e invitaciones pendientes' })}
            </h2>
            <ul>
              {membershipRequests.map((r) => {
                const community = allCommunities.find(c => c.id === r.communityId);
                const canResolve =
                  r.direction === 'invite'
                    ? r.userId === user?.id || isSuperAdmin
                    : isAdminRole;
                return (
                  <li key={r.id} className="communities-request-item">
                    <span>
                      {r.direction === 'invite'
                        ? t('communities.inviteToYou', { name: community?.name ?? r.communityId, defaultValue: `Te invitaron a unirte a ${community?.name ?? r.communityId}` })
                        : t('communities.requestToYou', { name: community?.name ?? r.communityId, defaultValue: `Solicitud de ingreso a ${community?.name ?? r.communityId}` })}
                    </span>
                    {canResolve && (
                      <span className="communities-request-actions">
                        <button className="btn-primary" onClick={() => handleResolve(r, 'accept')}>
                          {t('common.accept', { defaultValue: 'Aceptar' })}
                        </button>
                        <button className="btn-outline" onClick={() => handleResolve(r, 'decline')}>
                          {t('common.decline', { defaultValue: 'Rechazar' })}
                        </button>
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>

      {showCreate && (
        <div className="communities-modal-overlay" onClick={closeCreate}>
          <div className="card communities-modal" onClick={(e) => e.stopPropagation()}>
            <div className="communities-modal-header">
              <h2 className="communities-section-title">
              {editingCommunity ? t('communities.editTitle') : t('communities.createTitle')}
            </h2>
              <button className="communities-modal-close" onClick={closeCreate} aria-label={t('communities.close')}>
                <i className="fas fa-times" />
              </button>
            </div>

            <form className="communities-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="community-name">{t('communities.name')}</label>
                <input
                  id="community-name"
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  autoFocus
                />
              </div>
              <div className="form-group">
                <label htmlFor="community-short">{t('communityDashboard.shortName')}</label>
                <input
                  id="community-short"
                  type="text"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="community-description">{t('communityDashboard.description')}</label>
                <input
                  id="community-description"
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="form-group">
                <label className="checkbox-label">
                  <input
                    type="checkbox"
                    checked={isPublic}
                    onChange={(e) => setIsPublic(e.target.checked)}
                  />
                  <span>{t('communities.isPublic')}</span>
                </label>
                <p className="form-help">{t('communities.isPublicHint')}</p>
              </div>
              {error && <p className="communities-error">{error}</p>}
              <div className="communities-form-actions">
                <button type="button" className="btn-outline" onClick={closeCreate}>
                  {t('communityDashboard.cancel')}
                </button>
                <button type="submit" className="btn-primary" disabled={creating || updating}>
                  {editingCommunity ? (updating ? t('communities.saving') : t('communities.save')) : (creating ? t('communities.creating') : t('communities.createCommunity'))}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default CommunitiesPage;
