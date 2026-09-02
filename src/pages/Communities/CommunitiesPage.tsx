import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import { createCommunity } from '@/services/communities/communityService';
import './CommunitiesPage.css';

function CommunitiesPage() {
  const { isSuperAdmin } = useAuth();
  const { allCommunities, currentCommunity, refresh } = useCommunity();
  const [showCreate, setShowCreate] = useState(false);
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [description, setDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  function resetForm() {
    setName('');
    setShortName('');
    setDescription('');
    setError(null);
  }

  function openCreate() {
    resetForm();
    setShowCreate(true);
  }

  function closeCreate() {
    resetForm();
    setShowCreate(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreating(true);
    try {
      await createCommunity(name.trim(), shortName.trim(), description.trim());
      resetForm();
      setShowCreate(false);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create community');
    } finally {
      setCreating(false);
    }
  }

  const hasCommunities = allCommunities.length > 0;

  return (
    <div className="communities-page">
      <div className="container">
        <div className="communities-header">
          <h1 className="communities-title">Communities</h1>
          {isSuperAdmin && hasCommunities && (
            <button className="btn-primary" onClick={openCreate}>
              <i className="fas fa-plus" /> New Community
            </button>
          )}
        </div>

        {hasCommunities ? (
          <section className="card communities-list">
            <h2 className="communities-section-title">Existing communities</h2>
            <ul>
              {allCommunities.map((c) => (
                <li
                  key={c.id}
                  className={`communities-item ${currentCommunity?.id === c.id ? 'active' : ''}`}
                >
                  <Link to={`/c/${c.id}`} className="communities-link">
                    <span className="communities-name">{c.name}</span>
                    <span className="communities-short">{c.shortName}</span>
                    {currentCommunity?.id === c.id && <span className="communities-current">current</span>}
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : (
          <section className="card communities-empty">
            <h2 className="communities-section-title">No communities yet</h2>
            <p className="text-secondary">
              {isSuperAdmin
                ? 'Create the first community to get started.'
                : 'There are no communities available right now. Ask an admin to create one.'}
            </p>
            {isSuperAdmin && (
              <button className="btn-primary" onClick={openCreate}>
                <i className="fas fa-plus" /> Create Community
              </button>
            )}
          </section>
        )}
      </div>

      {showCreate && (
        <div className="communities-modal-overlay" onClick={closeCreate}>
          <div className="card communities-modal" onClick={(e) => e.stopPropagation()}>
            <div className="communities-modal-header">
              <h2 className="communities-section-title">Create community</h2>
              <button className="communities-modal-close" onClick={closeCreate} aria-label="Close">
                <i className="fas fa-times" />
              </button>
            </div>

            <form className="communities-form" onSubmit={handleSubmit}>
              <div className="form-group">
                <label htmlFor="community-name">Name</label>
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
                <label htmlFor="community-short">Short name</label>
                <input
                  id="community-short"
                  type="text"
                  value={shortName}
                  onChange={(e) => setShortName(e.target.value)}
                  required
                />
              </div>
              <div className="form-group">
                <label htmlFor="community-description">Description</label>
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
                  Cancel
                </button>
                <button type="submit" className="btn-primary" disabled={creating}>
                  {creating ? 'Creating...' : 'Create'}
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
