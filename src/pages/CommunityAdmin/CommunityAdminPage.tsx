/**
 * CommunityAdminPage — panel de control de la comunidad.
 *
 * Acceso: adminLevel >= 2 en esta comunidad (community_admin, superadmin,
 * o admin sin gameAdminFor — admins scopenados por juego no entran).
 *
 * Secciones: feature modules (toggles), juegos habilitados, datos generales
 * y danger zone. Guarda todo con un solo "Save changes".
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import { useToast } from '@/contexts/NotificationContext';
import { GAMES } from '@/data/games';
import { adminLevelOf } from '@/utils/membershipRole';
import { updateCommunityFields } from '@/services/communities/communityService';
import {
  previewStartggTournament,
  importStartggEvent,
  getImportedTournaments,
  enrichTournamentCharacters,
  enableTournamentPoints,
  type StartggTournamentPreview,
  type ImportSummary,
  type ImportedTournament,
} from '@/services/startgg/startggService';
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

  // ── start.gg import state ──────────────────────────────────────────────
  const [importSlug, setImportSlug] = useState('');
  const [importBusy, setImportBusy] = useState(false);
  const [importPreview, setImportPreview] = useState<StartggTournamentPreview | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportSummary | null>(null);
  const [importedList, setImportedList] = useState<ImportedTournament[]>([]);
  const [importingEventId, setImportingEventId] = useState<number | null>(null);
  const [enrichingId, setEnrichingId] = useState<string | null>(null);
  const [enrichResult, setEnrichResult] = useState<{ id: string; sets: number } | null>(null);
  const [importGivesPoints, setImportGivesPoints] = useState(true);
  const [importPointsDepth, setImportPointsDepth] = useState<8 | 16 | 32>(8);
  const [applyingPointsId, setApplyingPointsId] = useState<string | null>(null);
  const [applyPointsDepth, setApplyPointsDepth] = useState<8 | 16 | 32>(8);

  // Init local state from the community once it loads
  useEffect(() => {
    if (!community) return;
    setFeatures(community.features ?? {});
    setGameIds(new Set(community.gameIds && community.gameIds.length > 0 ? community.gameIds : GAMES.map((g) => g.id)));
    setName(community.name ?? '');
    setShortName(community.shortName ?? '');
    setDescription(community.description ?? '');
    setIsPublic(community.isPublic !== false);
  }, [community]);

  // Load imported tournaments list
  const loadImported = useCallback(async () => {
    if (!communityId) return;
    const list = await getImportedTournaments(communityId);
    setImportedList(list);
  }, [communityId]);

  useEffect(() => { loadImported(); }, [loadImported]);

  // Aviso al salir de la página si hay una importación o enriquecimiento en curso
  const isBusyImporting = importingEventId !== null || enrichingId !== null;
  useEffect(() => {
    if (!isBusyImporting) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [isBusyImporting]);

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

  // ── start.gg handlers ─────────────────────────────────────────────────

  async function handlePreview() {
    if (!importSlug.trim()) return;
    setImportBusy(true);
    setImportError(null);
    setImportPreview(null);
    setImportResult(null);
    try {
      const data = await previewStartggTournament(importSlug.trim());
      setImportPreview(data);
    } catch (err: any) {
      setImportError(err.message ?? t('communityAdmin.startgg.sectionTitle'));
    } finally {
      setImportBusy(false);
    }
  }

  async function handleEnrichCharacters(imp: ImportedTournament) {
    if (!communityId || !imp.startggEventId || !imp.gameId) return;
    setEnrichingId(imp.id);
    setEnrichResult(null);
    setImportError(null);
    try {
      const summary = await enrichTournamentCharacters(imp.id, imp.startggEventId, imp.gameId, communityId);
      setEnrichResult({ id: imp.id, sets: summary.setsUpdated });
    } catch (err: any) {
      setImportError(err.message ?? 'Error al importar personajes');
    } finally {
      setEnrichingId(null);
    }
  }

  async function handleApplyPoints(tournamentId: string) {
    setApplyingPointsId(tournamentId);
    try {
      const awarded = await enableTournamentPoints(tournamentId, applyPointsDepth);
      toast?.success?.(t('communityAdmin.startgg.pointsApplied', { count: awarded }));
      await loadImported();
    } catch (err: any) {
      toast?.error?.(err.message ?? t('communityAdmin.startgg.pointsError'));
    } finally {
      setApplyingPointsId(null);
    }
  }

  async function handleImportEvent(eventId: number) {
    if (!communityId || !importPreview) return;
    setImportingEventId(eventId);
    setImportError(null);
    setImportResult(null);
    try {
      const summary = await importStartggEvent(
        importPreview.normalizedSlug,
        eventId,
        communityId,
        importGivesPoints,
        importPointsDepth
      );
      setImportResult(summary);
      await loadImported();
      setImportPreview(null);
      setImportSlug('');
    } catch (err: any) {
      setImportError(err.message ?? t('communityAdmin.startgg.sectionTitle'));
    } finally {
      setImportingEventId(null);
    }
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

        {/* ── start.gg import ── */}
        <section className="admin-section">
          <h2 className="admin-section-title admin-startgg-title">
            <i className="fas fa-file-import" /> {t('communityAdmin.startgg.sectionTitle')}
          </h2>
          <p className="admin-section-desc">
            {t('communityAdmin.startgg.sectionDesc')}
          </p>

          <div className="card admin-startgg-card">
            {/* Input + Preview */}
            <div className="admin-startgg-input-row">
              <input
                className="form-control"
                placeholder={t('communityAdmin.startgg.inputPlaceholder')}
                value={importSlug}
                onChange={(e) => { setImportSlug(e.target.value); setImportPreview(null); setImportError(null); setImportResult(null); }}
                onKeyDown={(e) => e.key === 'Enter' && handlePreview()}
                disabled={importBusy}
              />
              <button
                className="btn btn-primary"
                onClick={handlePreview}
                disabled={importBusy || !importSlug.trim()}
              >
                {importBusy
                  ? <><i className="fas fa-spinner fa-spin" /> {t('communityAdmin.startgg.searching')}</>
                  : <><i className="fas fa-search" /> {t('communityAdmin.startgg.preview')}</>
                }
              </button>
            </div>

            {/* Error / result */}
            {importError && <div className="error-message">{importError}</div>}
            {importResult && (
              <div className="success-message">
                <i className="fas fa-check-circle" /> {importResult.tournamentName}
                {' · '}{importResult.entrants} {t('communityAdmin.startgg.players')}
                {' · '}{importResult.sets} {t('communityAdmin.startgg.sets')}
                {importResult.linked > 0 && <> · {t('communityAdmin.startgg.linked', { count: importResult.linked })}</>}
                {importResult.stubs  > 0 && <> · {t('communityAdmin.startgg.stubs',  { count: importResult.stubs  })}</>}
              </div>
            )}

            {/* Preview result */}
            {importPreview && (
              <div className="admin-startgg-preview">
                <div className="admin-startgg-preview-header">
                  <i className="fas fa-trophy" />
                  <div>
                    <strong>{importPreview.name}</strong>
                    <span className="admin-startgg-slug">start.gg/{importPreview.slug}</span>
                  </div>
                  {importPreview.numAttendees != null && (
                    <span className="admin-startgg-attendees">
                      {importPreview.numAttendees} {t('communityAdmin.startgg.attendees')}
                    </span>
                  )}
                </div>

                {/* Points option */}
                <div className="admin-startgg-points-option">
                  <label className="checkbox-label">
                    <input
                      type="checkbox"
                      checked={importGivesPoints}
                      onChange={(e) => setImportGivesPoints(e.target.checked)}
                      disabled={importingEventId !== null}
                    />
                    <span>{t('communityAdmin.startgg.awardPoints')}</span>
                  </label>
                  {importGivesPoints && (
                    <div className="admin-startgg-depth-row">
                      <label htmlFor="importPointsDepth" className="admin-startgg-depth-label">
                        {t('communityAdmin.startgg.pointsDepth')}
                      </label>
                      <select
                        id="importPointsDepth"
                        className="admin-startgg-depth-select"
                        value={importPointsDepth}
                        onChange={(e) => setImportPointsDepth(Number(e.target.value) as 8 | 16 | 32)}
                        disabled={importingEventId !== null}
                      >
                        {[8, 16, 32].map((n) => (
                          <option key={n} value={n}>
                            {t('communityAdmin.startgg.topN', { n })}
                          </option>
                        ))}
                      </select>
                    </div>
                  )}
                  <p className="admin-startgg-points-hint">
                    {importGivesPoints
                      ? t('communityAdmin.startgg.awardPointsHintYes', { n: importPointsDepth })
                      : t('communityAdmin.startgg.awardPointsHintNo')}
                  </p>
                </div>

                <p className="admin-startgg-events-label">{t('communityAdmin.startgg.selectEvent')}</p>
                <div className="admin-startgg-events-list">
                  {importPreview.events.length === 0 && (
                    <p className="text-muted" style={{ padding: '0.65rem 1rem' }}>
                      {t('communityAdmin.startgg.noEvents')}
                    </p>
                  )}
                  {importPreview.events.map((ev) => {
                    const isImporting = importingEventId === ev.id;
                    const alreadyImported = importedList.some((i) => i.startggEventId === ev.id);
                    return (
                      <div key={ev.id} className={`admin-startgg-event-row ${alreadyImported ? 'imported' : ''}`}>
                        <div className="admin-startgg-event-info">
                          <span className="admin-startgg-event-name">{ev.name}</span>
                          <span className="admin-startgg-event-meta">
                            {ev.videogame?.name ?? ev.type} · {ev.numEntrants ?? '?'} {t('communityAdmin.startgg.players')}
                          </span>
                          {alreadyImported && (
                            <span className="admin-startgg-imported-badge">
                              <i className="fas fa-check" /> {t('communityAdmin.startgg.alreadyImported')}
                            </span>
                          )}
                        </div>
                        <button
                          className={`btn ${alreadyImported ? 'btn-outline' : 'btn-primary'} btn-sm`}
                          onClick={() => handleImportEvent(ev.id)}
                          disabled={isImporting}
                        >
                          {isImporting
                            ? <><i className="fas fa-spinner fa-spin" /> {t('communityAdmin.startgg.importing')}</>
                            : alreadyImported
                              ? <><i className="fas fa-rotate" /> {t('communityAdmin.startgg.reimport')}</>
                              : <><i className="fas fa-download" /> {t('communityAdmin.startgg.import')}</>
                          }
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Already imported list */}
            {importedList.length > 0 && (
              <div className="admin-startgg-imported-list">
                <p className="admin-startgg-events-label">{t('communityAdmin.startgg.importedListTitle')}</p>
                <div className="admin-startgg-events-list">
                  {importedList.map((imp) => {
                    const isEnriching = enrichingId === imp.id;
                    const enriched    = enrichResult?.id === imp.id;
                    const canEnrich   = !!imp.startggEventId && !!imp.gameId;
                    return (
                      <div key={imp.id} className="admin-startgg-event-row imported">
                        <div className="admin-startgg-event-info">
                          <span className="admin-startgg-event-name">{imp.name}</span>
                          <span className="admin-startgg-event-meta">
                            {imp.gameId ?? '?'} · {imp.entrants} {t('communityAdmin.startgg.players')} ·{' '}
                            {imp.importedAt
                              ? new Date(imp.importedAt).toLocaleDateString()
                              : t('communityAdmin.startgg.unknownDate')
                            }
                          </span>
                          {enriched && (
                            <span className="admin-startgg-imported-badge" style={{ background: '#eff6ff', borderColor: '#bfdbfe', color: '#1d4ed8' }}>
                              <i className="fas fa-user-ninja" /> {t('communityAdmin.startgg.enrichedBadge', { sets: enrichResult!.sets })}
                            </span>
                          )}
                        </div>
                        <div className="admin-startgg-event-actions">
                          <span className="admin-startgg-imported-badge">
                            <i className="fas fa-check" /> {t('communityAdmin.startgg.importedBadge')}
                          </span>
                          {imp.eloApplied ? (
                            <span className="admin-startgg-imported-badge" style={{ background: '#f0fdf4', borderColor: '#bbf7d0', color: '#15803d' }}>
                              <i className="fas fa-star" /> {t('communityAdmin.startgg.pointsAppliedBadge')}
                            </span>
                          ) : (
                            <div className="admin-startgg-apply-points-group">
                              <select
                                className="admin-startgg-depth-select admin-startgg-depth-select--sm"
                                value={applyPointsDepth}
                                onChange={(e) => setApplyPointsDepth(Number(e.target.value) as 8 | 16 | 32)}
                                disabled={applyingPointsId !== null}
                                title={t('communityAdmin.startgg.pointsDepth')}
                              >
                                {[8, 16, 32].map((n) => (
                                  <option key={n} value={n}>Top {n}</option>
                                ))}
                              </select>
                              <button
                                className="btn btn-outline btn-sm"
                                onClick={() => handleApplyPoints(imp.id)}
                                disabled={applyingPointsId === imp.id}
                                title={t('communityAdmin.startgg.applyPointsTitle')}
                              >
                                {applyingPointsId === imp.id
                                  ? <><i className="fas fa-spinner fa-spin" /> {t('communityAdmin.startgg.applyingPoints')}</>
                                  : <><i className="fas fa-star" /> {t('communityAdmin.startgg.applyPoints')}</>
                                }
                              </button>
                            </div>
                          )}
                          {canEnrich && (
                            <button
                              className="btn btn-outline btn-sm"
                              onClick={() => handleEnrichCharacters(imp)}
                              disabled={isEnriching}
                              title={t('communityAdmin.startgg.fetchCharsTitle')}
                            >
                              {isEnriching
                                ? <><i className="fas fa-spinner fa-spin" /> {t('communityAdmin.startgg.fetchingChars')}</>
                                : <><i className="fas fa-user-ninja" /> {t('communityAdmin.startgg.fetchChars')}</>
                              }
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
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

      {/* ── Overlay bloqueante durante importación ── */}
      {isBusyImporting && (
        <div className="import-overlay" role="status" aria-live="polite">
          <div className="import-overlay-content">
            <i className="fas fa-spinner fa-spin import-overlay-icon" />
            <p className="import-overlay-title">
              {importingEventId !== null
                ? t('communityAdmin.startgg.importingOverlay')
                : t('communityAdmin.startgg.enrichingOverlay')}
            </p>
            <p className="import-overlay-desc">
              {t('communityAdmin.startgg.importingOverlayDesc')}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default CommunityAdminPage;
