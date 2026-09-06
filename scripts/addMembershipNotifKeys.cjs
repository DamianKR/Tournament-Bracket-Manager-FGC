const fs = require('fs');
const es = {
  'notifications.membership.requestTitle': 'Solicitud de ingreso',
  'notifications.membership.requestMessage': '{{name}} quiere unirse a {{community}}',
  'notifications.membership.inviteTitle': 'Invitación a comunidad',
  'notifications.membership.inviteMessage': 'Te han invitado a unirte a {{community}}',
  'notifications.membership.acceptedTitle': 'Membresía aceptada',
  'notifications.membership.acceptedMessage': 'Ahora eres miembro de {{community}}',
  'notifications.membership.acceptedMessageGeneric': 'Ahora eres miembro de una nueva comunidad',
};
const en = {
  'notifications.membership.requestTitle': 'Membership request',
  'notifications.membership.requestMessage': '{{name}} wants to join {{community}}',
  'notifications.membership.inviteTitle': 'Community invitation',
  'notifications.membership.inviteMessage': 'You have been invited to join {{community}}',
  'notifications.membership.acceptedTitle': 'Membership accepted',
  'notifications.membership.acceptedMessage': 'You are now a member of {{community}}',
  'notifications.membership.acceptedMessageGeneric': 'You are now a member of a new community',
};
function apply(file, dict) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(dict)) {
    const parts = key.split('.');
    let node = j;
    for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]] = node[parts[i]] || {};
    node[parts[parts.length - 1]] = value;
  }
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + '\n');
}
apply('src/i18n/locales/es.json', es);
apply('src/i18n/locales/en.json', en);
console.log('done');
