/**
 * CommunityAdminPage — panel de control de la comunidad.
 *
 * Acceso: adminLevel >= 2 en esta comunidad (community_admin, superadmin,
 * o admin sin gameAdminFor — admins scopenados por juego no entran).
 *
 * Secciones: feature modules (toggles), juegos habilitados, datos generales
 * y danger zone. Guarda todo con un solo "Save changes".
 */
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import { useToast } from '@/contexts/NotificationContext';
import { GAMES } from '@/data/games';
import { adminLevelOf } from '@/utils/membershipRole';
import { updateCommunityFields } from '@/services/communities/communityService';
import type { CommunityFeatures } from '@/models/community';
import ResetAvailabilityButton from '@/components/ResetAvailabilityButton/ResetAvailabilityButton';
import Loading from '@/components/Loading/Loading';
import './CommunityAdminPage.css';

type FeatureKey = keyof CommunityFeatures;

const MODULES: { key: FeatureKey; icon: string; color: string }[] = [
  { key: 'tournaments', icon: 'fa-trophy', color: '#f59e0b' },
  { key: 'leagues', icon: 'fa-shield-alt', color: '#3b82f6' },
  { key: 'duels', icon: 'fa-khanda', color: '#ef4444' },
  { key: 'matchmaking', icon: 'fa-random', color: '#22c55e' },
];

function CommunityAdminPage() {
  const { t } = useTranslation();
  const { communityId } = useParams<{ communityId: string }>();
  const { user } = useAuth();
  const { allCommunities, refresh } = useCommunity();
  const toast = useToast();
  const navigate = useNavigate();

  const community = allCommunities.find((c) => c.id === communityId) ?? null;
  const canAccess = adminLevelOf(user, communityId) >= 2;

  // ── Local editable state ───────────────────────────────────────────────
  const [features, setFeatures] = useState<CommunityFeatures>({});
  const [gameIds, setGameIds] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [saving, setSaving] = useState(false);

  // Init local state from the community once it loads
  useEffect(() => {
    if (!community) return;
    setFeatures(community.features ?? {});
    // gameIds vacío = todos habilitados → pre-marcar todos
    setGameIds(new Set(community.gameIds && community.gameIds.length > 0 ? community.gameIds : GAMES.map((g) => g.id)));
    setName(community.name ?? '');
    setShortName(community.shortName ?? '');
    setDescription(community.description ?? '');
    setIsPublic(community.isPublic !== false);
  }, [community]);

  const dirty = useMemo(() => {
    if (!community) return false;
    const savedGameIds = community.gameIds && community.gameIds.length > 0
      ? community.gameIds
      : GAMES.map((g) => g.id);
    const sameGames = savedGameIds.length === gameIds.size && savedGameIds.every((g) => gameIds.has(g));
    return (
      !sameGames ||
      name !== (community.name ?? '') ||
      shortName !== (community.shortName ?? '') ||
      description !== (community.description ?? '') ||
      isPublic !== (community.isPublic !== false) ||
      MODULES.some((m) => (features[m.key] !== false) !== (community.features?.[m.key] !== false))
    );
  }, [community, features, gameIds, name, shortName, description, isPublic]);

  if (!community) {
    return <Loading message={t('communityAdmin.loading', { defaultValue: 'Loading community…' })} />;
  }

  if (!canAccess) {
    return (
      <div className="container admin-page">
        <div className="card admin-denied">
          <i className="fas fa-lock" />
          <h2>{t('communityAdmin.deniedTitle', { defaultValue: 'Admin access required' })}</h2>
          <p>{t('communityAdmin.deniedDesc', { defaultValue: 'Only community owners and unscoped admins can manage this community.' })}</p>
          <button className="btn btn-primary" onClick={() => navigate(`/c/${communityId}`)}>
            {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  function toggleFeature(key: FeatureKey) {
    setFeatures((prev) => ({ ...prev, [key]: prev[key] === false }));
  }

  function toggleGame(id: string) {
    setGameIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function handleSave() {
    if (!community || !communityId) return;
    if (!name.trim() || !shortName.trim()) {
      toast.error(t('communityDashboard.errors.requiredFields'));
      return;
    }
    if (gameIds.size === 0) {
      toast.error(t('communityAdmin.noGames', { defaultValue: 'Enable at least one game.' }));
      return;
    }
    setSaving(true);
    try {
      // gameIds con todos seleccionados = [] (semántica: sin restricción)
      const allSelected = gameIds.size === GAMES.length;
      await updateCommunityFields(communityId, {
        name: name.trim(),
        shortName: shortName.trim(),
        description: description.trim(),
        isPublic,
        features,
        gameIds: allSelected ? [] : Array.from(gameIds),
      });
      await refresh();
      toast.success(t('communityAdmin.saved', { defaultValue: 'Community settings saved' }));
    } catch (err: any) {
      toast.error(err.message || t('communityDashboard.errors.save'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="admin-page">
      <div className="admin-hero">
        <div className="container admin-hero-inner">
          <div className="admin-hero-title">
            <span className="admin-hero-icon"><i className="fas fa-shield-halved" /></span>
            <div>
              <h1>{t('communityAdmin.title', { defaultValue: 'Admin Control' })}</h1>
              <p>{community.name}</p>
            </div>
          </div>
          <button
            className="btn btn-primary admin-save-btn"
            onClick={handleSave}
            disabled={saving || !dirty}
          >
            <i className="fas fa-save" />
            {saving ? t('common.saving', { defaultValue: 'Saving…' }) : t('common.saveChanges', { defaultValue: 'Save changes' })}
          </button>
        </div>
      </div>

      <div className="container admin-body">

        {/* ── Modules ── */}
        <section className="admin-section">
          <h2 className="admin-section-title">
            <i className="fas fa-puzzle-piece" /> {t('communityAdmin.modulesTitle', { defaultValue: 'Modules' })}
          </h2>
          <p className="admin-section-desc">
            {t('communityAdmin.modulesDesc', { defaultValue: 'Disabled modules disappear from navigation, event tabs and profile availability options.' })}
          </p>
          <div className="admin-modules-grid">
            {MODULES.map((m) => {
              const enabled = features[m.key] !== false;
              return (
                <button
                  key={m.key}
                  type="button"
                  className={`admin-module-card ${enabled ? 'on' : 'off'}`}
                  style={{ '--mod-color': m.color } as React.CSSProperties}
                  onClick={() => toggleFeature(m.key)}
                >
                  <span className="admin-module-icon"><i className={`fas ${m.icon}`} /></span>
                  <span className="admin-module-name">
                    {t(`communityAdmin.modules.${m.key}`, { defaultValue: m.key })}
                  </span>
                  <span className="admin-module-desc">
                    {t(`communityAdmin.modules.${m.key}Desc`, { defaultValue: '' })}
                  </span>
                  <span className={`admin-toggle ${enabled ? 'on' : ''}`}>
                    <span className="admin-toggle-knob" />
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {/* ── Enabled games ── */}
        <section className="admin-section">
          <h2 className="admin-section-title">
            <i className="fas fa-gamepad" /> {t('communityAdmin.gamesTitle', { defaultValue: 'Enabled games' })}
          </h2>
          <p className="admin-section-desc">
            {t('communityAdmin.gamesDesc', { defaultValue: 'Games offered by this community. They filter every game selector (tournaments, leagues, ranked, profiles).' })}
          </p>
          <div className="admin-games-grid">
            {GAMES.map((g) => {
              const on = gameIds.has(g.id);
              return (
                <button
                  key={g.id}
                  type="button"
                  className={`admin-game-card ${on ? 'on' : 'off'}`}
                  style={{ '--mod-color': g.color } as React.CSSProperties}
                  onClick={() => toggleGame(g.id)}
                >
                  <span className="admin-game-badge" style={{ background: g.color }}>{g.id.toUpperCase()}</span>
                  <span className="admin-game-name">{g.name}</span>
                  <i className={`fas ${on ? 'fa-check-circle' : 'fa-circle'} admin-game-check`} />
                </button>
              );
            })}
          </div>
        </section>

        {/* ── General ── */}
        <section className="admin-section">
          <h2 className="admin-section-title">
            <i className="fas fa-cog" /> {t('communityAdmin.generalTitle', { defaultValue: 'General' })}
          </h2>
          <div className="card admin-general-card">
            <div className="form-group">
              <label>{t('communities.name')}</label>
              <input className="form-control" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('communities.shortName')}</label>
              <input className="form-control" value={shortName} onChange={(e) => setShortName(e.target.value)} />
            </div>
            <div className="form-group admin-field-wide">
              <label>{t('communities.description')}</label>
              <textarea className="form-control" rows={3} value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>
            <div className="admin-visibility-row">
              <button
                type="button"
                className={`admin-module-card admin-visibility-card ${isPublic ? 'on' : 'off'}`}
                onClick={() => setIsPublic((v) => !v)}
                style={{ '--mod-color': isPublic ? '#22c55e' : '#f59e0b' } as React.CSSProperties}
              >
                <span className="admin-module-icon"><i className={`fas ${isPublic ? 'fa-globe' : 'fa-lock'}`} /></span>
                <span className="admin-module-name">{t(isPublic ? 'communities.public' : 'communities.private')}</span>
                <span className="admin-module-desc">{t('communityAdmin.visibilityDesc', { defaultValue: 'Public communities are visible to everyone.' })}</span>
                <span className={`admin-toggle ${isPublic ? 'on' : ''}`}>
                  <span className="admin-toggle-knob" />
                </span>
              </button>
            </div>
          </div>
        </section>

        {/* ── Danger zone ── */}
        <section className="admin-section">
          <h2 className="admin-section-title admin-danger-title">
            <i className="fas fa-triangle-exclamation" /> {t('communityAdmin.dangerTitle', { defaultValue: 'Danger zone' })}
          </h2>
          <div className="card admin-danger-card">
            <div className="admin-danger-row">
              <div>
                <strong>{t('communityAdmin.availabilityTitle', { defaultValue: 'Mass availability' })}</strong>
                <p className="admin-danger-desc">
                  {t('communityAdmin.availabilityDesc', { defaultValue: 'Activate or deactivate ranked/league/tournament availability for every participant of a game.' })}
                </p>
              </div>
              <ResetAvailabilityButton />
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

export default CommunityAdminPage;
