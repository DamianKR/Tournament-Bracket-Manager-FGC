const fs = require('fs');

const es = {
  'notifications.types.membership_request': 'Solicitud de ingreso',
  'notifications.types.membership_invite': 'Invitación',
  'notifications.types.membership_accepted': 'Ingreso aceptado',
};
const en = {
  'notifications.types.membership_request': 'Membership request',
  'notifications.types.membership_invite': 'Invitation',
  'notifications.types.membership_accepted': 'Membership accepted',
};

function apply(file, dict) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  let added = 0;
  for (const [key, value] of Object.entries(dict)) {
    const parts = key.split('.');
    let node = j;
    for (let i = 0; i < parts.length - 1; i++) {
      node = node[parts[i]] = node[parts[i]] || {};
    }
    if (node[parts[parts.length - 1]] === undefined) { node[parts[parts.length - 1]] = value; added++; }
  }
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + '\n');
  console.log(file, 'added', added);
}
apply('src/i18n/locales/es.json', es);
apply('src/i18n/locales/en.json', en);
