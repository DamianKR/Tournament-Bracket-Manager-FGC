import { useState, useEffect } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import { createCommunity, updateCommunity } from '@/services/communities/communityService';
import {
  requestJoinCommunity,
  getMembershipRequests,
  type MembershipRequest,
} from '@/services/participants/participantService';
import type { Community } from '@/models/community';
import { isCommunityAdminOf } from '@/utils/membershipRole';
import './CommunitiesPage.css';

function CommunitiesPage() {
  const { t } = useTranslation();
  const { isSuperAdmin, user } = useAuth();
  const navigate = useNavigate();
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
  const [requestSuccess, setRequestSuccess] = useState<string | null>(null);
  const [joinTarget, setJoinTarget] = useState<Community | null>(null);
  const [joinName, setJoinName] = useState('');
  const [joinAlias, setJoinAlias] = useState('');
  const [joinReason, setJoinReason] = useState('');
  const [joinLoading, setJoinLoading] = useState(false);


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

  async function handleRequestJoin() {
    if (!user?.participantId || !joinTarget) return;
    setRequestError(null);
    setRequestSuccess(null);
    setJoinLoading(true);
    try {
      await requestJoinCommunity(user.participantId, joinTarget.id, {
        name: joinName,
        alias: joinAlias,
        reason: joinReason,
      });
      setJoinTarget(null);
      setJoinName('');
      setJoinAlias('');
      setJoinReason('');
      setRequestSuccess(t('communities.requestSuccess', { name: joinTarget.name, defaultValue: `Solicitud enviada a ${joinTarget.name}` }));
      await reloadRequests();
    } catch (err) {
      setRequestError(err instanceof Error ? err.message : 'Failed to request join');
    } finally {
      setJoinLoading(false);
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
    setRequestSuccess(null);
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
    setRequestSuccess(null);
    setShowCreate(true);
  }

  function canEdit(community: Community): boolean {
    // superadmin o community_admin DE esa comunidad (por membership).
    return isCommunityAdminOf(user, community.id);
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
        setRequestSuccess(t('communities.updateSuccess', { defaultValue: 'Comunidad actualizada correctamente' }));
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
      setRequestSuccess(t('communities.createSuccess', { defaultValue: 'Comunidad creada correctamente' }));
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

        {requestError && <p className="communities-error">{requestError}</p>}
        {requestSuccess && <p className="communities-success" role="status">{requestSuccess}</p>}

        {membershipRequests.length > 0 && (
          <section className="card communities-requests communities-requests-notice">
            <span className="communities-requests-text">
              <i className="fas fa-user-plus" />
              {t('communities.pendingRequestsNotice', { count: membershipRequests.length, defaultValue: 'Tienes solicitudes o invitaciones pendientes.' })}
            </span>
            <button className="btn-primary" onClick={() => navigate('/membership-requests')}>
              {t('communities.viewRequests', { defaultValue: 'Ver solicitudes' })}
            </button>
          </section>
        )}

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
                        onClick={() => {
                          setJoinTarget(c);
                          setJoinName(user.username);
                          setJoinAlias('');
                          setJoinReason('');
                        }}
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

      </div>

      {joinTarget && (
        <div className="communities-modal-overlay" onClick={() => setJoinTarget(null)}>
          <div className="card communities-modal" onClick={(e) => e.stopPropagation()}>
            <div className="communities-modal-header">
              <h2 className="communities-section-title">
                {t('communities.joinTitle', { name: joinTarget.name, defaultValue: `Unirse a ${joinTarget.name}` })}
              </h2>
              <button className="communities-modal-close" onClick={() => setJoinTarget(null)}>×</button>
            </div>
            <div className="communities-modal-body">
              <div className="form-group">
                <label htmlFor="join-name">{t('communities.joinName', { defaultValue: 'Nombre' })}</label>
                <input id="join-name" type="text" value={joinName} onChange={(e) => setJoinName(e.target.value)} required />
              </div>
              <div className="form-group">
                <label htmlFor="join-alias">{t('communities.joinAlias', { defaultValue: 'Nick / Alias' })}</label>
                <input id="join-alias" type="text" value={joinAlias} onChange={(e) => setJoinAlias(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="join-reason">{t('communities.joinReason', { defaultValue: '¿Por qué quieres unirte?' })}</label>
                <textarea id="join-reason" value={joinReason} onChange={(e) => setJoinReason(e.target.value)} rows={3} />
              </div>
              {requestError && <p className="communities-error">{requestError}</p>}
              <div className="form-actions">
                <button className="btn-outline" onClick={() => setJoinTarget(null)}>
                  {t('common.cancel', { defaultValue: 'Cancelar' })}
                </button>
                <button className="btn-primary" onClick={handleRequestJoin} disabled={!joinName.trim() || joinLoading}>
                  {joinLoading ? t('common.sending', { defaultValue: 'Enviando...' }) : t('communities.sendRequest', { defaultValue: 'Enviar solicitud' })}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

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
