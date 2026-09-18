import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GAMES } from '@/data/games';
import { useCommunity } from '@/contexts/CommunityContext';
import { useToast } from '@/contexts/NotificationContext';
import { resetAvailability } from '@/services/matchmaking/matchmakingService';

type Activity = 'ranked' | 'leagues' | 'tournaments';

const ACTIVITIES: { id: Activity; icon: string }[] = [
  { id: 'ranked',      icon: 'fa-khanda' },
  { id: 'leagues',     icon: 'fa-calendar-week' },
  { id: 'tournaments', icon: 'fa-trophy' },
];

/** Admin control: sets the chosen activity's availability flag to false for
 *  every participant of a game in this community. Ranked covers duels AND
 *  matchmaking. Lives in the Ranked header because it affects all modes. */
function ResetAvailabilityButton() {
  const { t } = useTranslation();
  const toast = useToast();
  const { currentCommunity } = useCommunity();
  const communityId = currentCommunity?.id ?? '';

  const [show, setShow]           = useState(false);
  const [gameId, setGameId]       = useState(GAMES[0]?.id ?? '');
  const [activity, setActivity]   = useState<Activity>('ranked');
  const [resetting, setResetting] = useState(false);

  async function handleReset() {
    if (!gameId) return;
    setResetting(true);
    try {
      const result = await resetAvailability(communityId, gameId, activity);
      setShow(false);
      toast.success(t('ranked.mm.flash.reset', { count: result.updated }));
    } catch (e: any) {
      toast.error(e.message);
    } finally {
      setResetting(false);
    }
  }

  return (
    <>
      <button
        className="btn-outline"
        onClick={() => setShow(true)}
        title={t('ranked.mm.deactivateAllTitle')}
      >
        <i className="fas fa-user-slash" /> {t('ranked.mm.deactivateAll')}
      </button>

      {show && (
        <div className="modal-overlay" onClick={() => setShow(false)}>
          <div className="modal-content" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2><i className="fas fa-user-slash" /> {t('ranked.mm.deactivateAll')}</h2>
              <button className="btn-icon" onClick={() => setShow(false)}><i className="fas fa-times" /></button>
            </div>
            <div className="modal-body">
              <p className="text-secondary" style={{ marginBottom: '1rem' }}>{t('ranked.mm.modals.resetBody')}</p>
              <div className="form-group">
                <label>{t('ranked.mm.modals.game')}</label>
                <select className="form-control" value={gameId} onChange={(e) => setGameId(e.target.value)}>
                  {GAMES.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
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
              <button className="btn-danger" onClick={handleReset} disabled={resetting || !gameId}>
                {resetting ? t('ranked.mm.modals.applying') : t('ranked.mm.modals.resetConfirm')}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default ResetAvailabilityButton;
