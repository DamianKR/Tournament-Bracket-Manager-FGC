import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useCommunity } from '@/contexts/CommunityContext';
import {
  getMembershipRequests,
  resolveMembershipRequest,
  type MembershipRequest,
} from '@/services/participants/participantService';
import Loading from '@/components/Loading/Loading';
import './MembershipRequestsPage.css';

function MembershipRequestsPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { allCommunities, currentCommunity } = useCommunity();
  const [requests, setRequests] = useState<MembershipRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processing, setProcessing] = useState<Record<string, boolean>>({});

  async function loadRequests() {
    setLoading(true);
    setError(null);
    try {
      const data = await getMembershipRequests();
      data.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
      setRequests(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load requests');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadRequests();
  }, [currentCommunity?.id]);

  async function handleResolve(req: MembershipRequest, action: 'accept' | 'decline') {
    setProcessing((prev) => ({ ...prev, [req.id]: true }));
    setError(null);
    try {
      await resolveMembershipRequest(req.id, action);
      setRequests((prev) => prev.filter((r) => r.id !== req.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resolve request');
    } finally {
      setProcessing((prev) => ({ ...prev, [req.id]: false }));
    }
  }

  const communityName = (id: string) =>
    allCommunities.find((c) => c.id === id)?.name ?? id;

  const incoming = requests.filter((r) => r.direction === 'request');
  const invites = requests.filter((r) => r.direction === 'invite');

  const canResolveRequest = (r: MembershipRequest) => {
    if (user?.role === 'superadmin') return true;
    if (!['superadmin', 'community_admin', 'admin'].includes(user?.role ?? '')) return false;
    return (
      user?.communityId === r.communityId ||
      (user?.memberships ?? []).some((m) => m.communityId === r.communityId && m.isActive !== false)
    );
  };

  const formatDate = (d: string) =>
    new Date(d).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });

  return (
    <div className="membership-requests-page">
      <div className="container">
        <div className="mr-header">
          <div>
            <h1>{t('membershipRequests.title', { defaultValue: 'Solicitudes de ingreso' })}</h1>
            <p className="text-secondary">
              {t('membershipRequests.subtitle', { defaultValue: 'Revisa y gestiona las peticiones para unirse a tus comunidades.' })}
            </p>
          </div>
          <Link to="/communities" className="btn-primary">
            {t('membershipRequests.toCommunities', { defaultValue: 'Comunidades' })}
          </Link>
        </div>

        {error && <div className="error-message">{error}</div>}

        {loading ? (
          <Loading />
        ) : (
          <>
            {incoming.length === 0 && invites.length === 0 && (
              <section className="card mr-empty">
                <h3>{t('membershipRequests.noneTitle', { defaultValue: 'No hay solicitudes pendientes' })}</h3>
                <p className="text-secondary">
                  {t('membershipRequests.noneDescription', { defaultValue: 'Cuando alguien pida unirse a una comunidad, aparecerá aquí.' })}
                </p>
              </section>
            )}

            {incoming.length > 0 && (
              <section className="mr-section">
                <h2 className="mr-section-title">
                  {t('membershipRequests.incomingTitle', { defaultValue: 'Solicitudes entrantes' })}
                </h2>
                <div className="mr-list">
                  {incoming.map((r) => (
                    <article key={r.id} className="card mr-request">
                      <div className="mr-request-main">
                        <div className="mr-request-meta">
                          <span className="mr-request-date">{formatDate(r.createdAt)}</span>
                          <span className="mr-request-community">{communityName(r.communityId)}</span>
                        </div>
                        <h3 className="mr-request-name">
                          {r.applicantName || t('membershipRequests.unknown', { defaultValue: 'Desconocido' })}
                          {r.applicantAlias ? <span className="mr-request-alias">aka {r.applicantAlias}</span> : null}
                        </h3>
                        {r.reason ? (
                          <p className="mr-request-reason">“{r.reason}”</p>
                        ) : (
                          <p className="mr-request-no-reason text-secondary">
                            {t('membershipRequests.noReason', { defaultValue: 'No indicó un motivo.' })}
                          </p>
                        )}
                      </div>
                      {canResolveRequest(r) && (
                        <div className="mr-request-actions">
                          <button
                            className="btn-primary"
                            disabled={processing[r.id]}
                            onClick={() => handleResolve(r, 'accept')}
                          >
                            {t('common.accept', { defaultValue: 'Aceptar' })}
                          </button>
                          <button
                            className="btn-outline"
                            disabled={processing[r.id]}
                            onClick={() => handleResolve(r, 'decline')}
                          >
                            {t('common.decline', { defaultValue: 'Rechazar' })}
                          </button>
                        </div>
                      )}
                    </article>
                  ))}
                </div>
              </section>
            )}

            {invites.length > 0 && (
              <section className="mr-section">
                <h2 className="mr-section-title">
                  {t('membershipRequests.invitesTitle', { defaultValue: 'Invitaciones recibidas' })}
                </h2>
                <div className="mr-list">
                  {invites.map((r) => (
                    <article key={r.id} className="card mr-request">
                      <div className="mr-request-main">
                        <div className="mr-request-meta">
                          <span className="mr-request-date">{formatDate(r.createdAt)}</span>
                          <span className="mr-request-community">{communityName(r.communityId)}</span>
                        </div>
                        <h3 className="mr-request-name">
                          {t('membershipRequests.inviteText', { name: communityName(r.communityId), defaultValue: `Te invitaron a ${communityName(r.communityId)}` })}
                        </h3>
                      </div>
                      <div className="mr-request-actions">
                        <button
                          className="btn-primary"
                          disabled={processing[r.id]}
                          onClick={() => handleResolve(r, 'accept')}
                        >
                          {t('common.accept', { defaultValue: 'Aceptar' })}
                        </button>
                        <button
                          className="btn-outline"
                          disabled={processing[r.id]}
                          onClick={() => handleResolve(r, 'decline')}
                        >
                          {t('common.decline', { defaultValue: 'Rechazar' })}
                        </button>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default MembershipRequestsPage;
