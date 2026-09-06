/**
 * Localiza el título/mensaje de una notificación a partir de su `type` y `data`.
 * El servidor guarda textos literales (legacy en inglés/español); para los
 * tipos soportados aquí el texto se reconstruye con i18n según el idioma de la UI.
 * Si faltan datos (notificaciones antiguas), se usa el texto almacenado.
 */

import type { TFunction } from 'i18next';
import type { AppNotification } from '@/models/notification';

export function localizedNotification(
  notif: Pick<AppNotification, 'type' | 'title' | 'message' | 'data'>,
  t: TFunction,
  communityName?: (id: string) => string | undefined
): { title: string; message: string } {
  const d = (notif.data ?? {}) as Record<string, unknown>;
  const community =
    (d.communityName as string | undefined) ??
    (d.communityId ? communityName?.(d.communityId as string) : undefined);

  switch (notif.type) {
    case 'membership_request': {
      const name = d.applicantName as string | undefined;
      if (!name || !community) return { title: notif.title, message: notif.message };
      const reason = d.reason ? ` - "${d.reason}"` : '';
      return {
        title: t('notifications.membership.requestTitle'),
        message: t('notifications.membership.requestMessage', { name, community }) + reason,
      };
    }
    case 'membership_invite': {
      if (!community) return { title: notif.title, message: notif.message };
      return {
        title: t('notifications.membership.inviteTitle'),
        message: t('notifications.membership.inviteMessage', { community }),
      };
    }
    case 'membership_accepted': {
      return {
        title: t('notifications.membership.acceptedTitle'),
        message: community
          ? t('notifications.membership.acceptedMessage', { community })
          : t('notifications.membership.acceptedMessageGeneric'),
      };
    }
    default:
      return { title: notif.title, message: notif.message };
  }
}
