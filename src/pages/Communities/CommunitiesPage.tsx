import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import { createCommunity, updateCommunity } from '@/services/communities/communityService';
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
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [updating, setUpdating] = useState(false);

  function resetForm() {
    setName('');
    setShortName('');
    setDescription('');
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
    setError(null);
    setShowCreate(true);
  }

  function canEdit(community: Community): boolean {
    if (isSuperAdmin) return true;
    if (user?.role === 'community_admin' && community.ownerAdminId === user.id) return true;
    return false;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (editingCommunity) {
      setUpdating(true);
      try {
        await updateCommunity(editingCommunity.id, name.trim(), shortName.trim(), description.trim());
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
      await createCommunity(name.trim(), shortName.trim(), description.trim());
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
