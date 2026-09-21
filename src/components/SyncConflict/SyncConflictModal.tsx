import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import {
  getSyncConflicts,
  resolveSyncConflict,
  SyncConflictEntry,
} from '@/services/storage/localStorage';
import './SyncConflictModal.css';

/**
 * Steam-style sync conflict resolver.
 * Listens for 'sync:conflict' events dispatched by the storage layer when a
 * record was changed locally AND on the server since the last sync. The user
 * picks which version survives per record; conflicts persist across reloads
 * until resolved ("Decidir luego" keeps them for the next session).
 */
export default function SyncConflictModal() {
  const { t } = useTranslation();
  const [conflicts, setConflicts] = useState<SyncConflictEntry[]>([]);
  const [dismissed, setDismissed] = useState(false);
  const [resolving, setResolving] = useState<string | null>(null);

  const reload = useCallback(() => {
    const list = getSyncConflicts();
    setConflicts(list);
    if (list.length > 0) setDismissed(false);
  }, []);

  useEffect(() => {
    const handler = () => reload();
    window.addEventListener('sync:conflict', handler);
    reload(); // surface conflicts persisted from a previous session
    return () => window.removeEventListener('sync:conflict', handler);
  }, [reload]);

  if (dismissed || conflicts.length === 0) return null;

  const resolve = async (id: string, choice: 'local' | 'server') => {
    setResolving(id);
    try {
      await resolveSyncConflict(id, choice);
    } finally {
      setResolving(null);
      reload();
    }
  };

  const fmt = (iso: string | null) =>
    iso ? new Date(iso).toLocaleString() : '—';

  return (
    <div className="modal-overlay sync-conflict-overlay">
      <div className="modal-content sync-conflict-modal" onClick={e => e.stopPropagation()}>
        <div className="modal-header">
          <h2>
            <i className="fas fa-cloud-upload-alt" />{' '}
            {t('sync.conflictTitle')}
          </h2>
        </div>
        <div className="modal-body">
          <p className="sync-conflict-desc">{t('sync.conflictDesc')}</p>
          <ul className="sync-conflict-list">
            {conflicts.map(c => (
              <li key={c.id} className="sync-conflict-item">
                <div className="sync-conflict-info">
                  <span className="sync-conflict-kind">
                    {c.kind === 'tournament'
                      ? t('sync.tournament')
                      : t('sync.participant')}
                  </span>
                  <strong className="sync-conflict-name">{c.name}</strong>
                  <div className="sync-conflict-versions">
                    <span>
                      <i className="fas fa-mobile-alt" /> {t('sync.localVersion')}: {fmt(c.localUpdatedAt)}
                    </span>
                    <span>
                      <i className="fas fa-server" /> {t('sync.serverVersion')}: {fmt(c.serverUpdatedAt)}
                    </span>
                  </div>
                </div>
                <div className="sync-conflict-actions">
                  <button
                    className="btn-primary btn-sm"
                    disabled={resolving === c.id}
                    onClick={() => resolve(c.id, 'local')}
                  >
                    <i className="fas fa-mobile-alt" /> {t('sync.useLocal')}
                  </button>
                  <button
                    className="btn-outline btn-sm"
                    disabled={resolving === c.id}
                    onClick={() => resolve(c.id, 'server')}
                  >
                    <i className="fas fa-server" /> {t('sync.useServer')}
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
        <div className="modal-footer">
          <button className="btn-outline" onClick={() => setDismissed(true)}>
            {t('sync.decideLater')}
          </button>
        </div>
      </div>
    </div>
  );
}
