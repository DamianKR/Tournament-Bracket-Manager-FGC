import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GAMES } from '@/data/games';
import { useCommunity } from '@/contexts/CommunityContext';
import { useToast } from '@/contexts/NotificationContext';
import { setAvailability } from '@/services/matchmaking/matchmakingService';
import './ResetAvailabilityButton.css';

type Activity = 'ranked' | 'leagues' | 'tournaments';
type Action = 'activate' | 'deactivate';

const ACTIVITIES: { id: Activity; icon: string }[] = [
  { id: 'ranked',      icon: 'fa-khanda' },
  { id: 'leagues',     icon: 'fa-calendar-week' },
  { id: 'tournaments', icon: 'fa-trophy' },
];

/** Admin control: sets the chosen activity's availability flag for every
 *  participant of a game in this community. Ranked covers duels AND
 *  matchmaking. Two compact buttons: activate all / deactivate all. */
function ResetAvailabilityButton() {
  const { t } = useTranslation();
  const toast = useToast();
  const { currentCommunity, communityGames } = useCommunity();
  const communityId = currentCommunity?.id ?? '';

  const [show, setShow]           = useState(false);
  const [action, setAction]       = useState<Action>('deactivate');
  const [gameId, setGameId]       = useState(GAMES[0]?.id ?? '');
  const [activity, setActivity]   = useState<Activity>('ranked');
  const [applying, setApplying]   = useState(false);

  const isActivate = action === 'activate';

  // Si la comunidad deshabilita el juego seleccionado → saltar al primero habilitado
  useEffect(() => {
    if (communityGames.length > 0 && !communityGames.some((g) => g.id === gameId)) {
      setGameId(communityGames[0].id);
    }
  }, [communityGames]);

  function open(a: Action) {
    setAction(a);
    setShow(true);
  }

  async function handleApply() {
    if (!gameId) return;
    setApplying(true);
    try {
      const result = await setAvailability(communityId, gameId, activity, isActivate);
      setShow(false);
      toast.success(t(isActivate ? 'ranked.mm.flash.enable' : 'ranked.mm.flash.reset', { count: result.updated }));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setApplying(false);
    }
  }

  return (
    <>
      <div className="availability-actions">
        <button
          className="avail-btn avail-btn-on"
          onClick={() => open('activate')}
          title={t('ranked.mm.activateAllTitle')}
        >
          <i className="fas fa-user-check" />
        </button>
        <button
          className="avail-btn avail-btn-off"
          onClick={() => open('deactivate')}
          title={t('ranked.mm.deactivateAllTitle')}
        >
          <i className="fas fa-user-slash" />
        </button>
      </div>

      {show && (
        <div className="modal-overlay" onClick={() => setShow(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2>
                <i className={`fas ${isActivate ? 'fa-user-check' : 'fa-user-slash'}`} />{' '}
                {isActivate ? t('ranked.mm.activateAll') : t('ranked.mm.deactivateAll')}
              </h2>
              <button className="btn-icon" onClick={() => setShow(false)}><i className="fas fa-times" /></button>
            </div>
            <div className="modal-body">
              <p className="text-secondary" style={{ marginBottom: '1rem' }}>
                {isActivate ? t('ranked.mm.modals.enableBody') : t('ranked.mm.modals.resetBody')}
              </p>
              <div className="form-group">
                <label>{t('ranked.mm.modals.action')}</label>
                <div className="duel-type-selector">
                  <label className="duel-type-option">
                    <input type="radio" name="availAction" checked={isActivate} onChange={() => setAction('activate')} />
                    <span><i className="fas fa-user-check" /> {t('ranked.mm.modals.actionActivate')}</span>
                  </label>
                  <label className="duel-type-option">
                    <input type="radio" name="availAction" checked={!isActivate} onChange={() => setAction('deactivate')} />
                    <span><i className="fas fa-user-slash" /> {t('ranked.mm.modals.actionDeactivate')}</span>
                  </label>
                </div>
              </div>
              <div className="form-group">
                <label>{t('ranked.mm.modals.game')}</label>
                <select className="form-control" value={gameId} onChange={(e) => setGameId(e.target.value)}>
                  {communityGames.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label>{t('ranked.mm.modals.activity')}</label>
                <div className="duel-type-selector">
                  {ACTIVITIES.map((a) => (
                    <label key={a.id} className="duel-type-option">
                      <input
                        type="radio"
                        name="resetActivity"
                        checked={activity === a.id}
                        onChange={() => setActivity(a.id)}
                      />
                      <span><i className={`fas ${a.icon}`} /> {t(`ranked.mm.activities.${a.id}`)}</span>
                      <small>{t(`ranked.mm.activities.${a.id}Desc`)}</small>
                    </label>
                  ))}
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button className="btn-outline" onClick={() => setShow(false)}>{t('ranked.mm.modals.cancel')}</button>
              <button
                className={isActivate ? 'btn-success' : 'btn-danger'}
                onClick={handleApply}
                disabled={applying || !gameId}
              >
                {applying
                  ? t('ranked.mm.modals.applying')
                  : isActivate ? t('ranked.mm.modals.enableConfirm') : t('ranked.mm.modals.resetConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ResetAvailabilityButton;
