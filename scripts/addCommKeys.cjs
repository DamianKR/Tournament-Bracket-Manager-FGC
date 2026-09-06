const fs = require('fs');
const es = {
  'communities.pendingRequestsNotice': 'Tienes solicitudes o invitaciones pendientes.',
  'communities.viewRequests': 'Ver solicitudes',
};
const en = {
  'communities.pendingRequestsNotice': 'You have pending requests or invites.',
  'communities.viewRequests': 'View requests',
};
function apply(file, dict) {
  const j = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const [key, value] of Object.entries(dict)) {
    const parts = key.split('.');
    let node = j;
    for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]] = node[parts[i]] || {};
    if (node[parts[parts.length - 1]] === undefined) node[parts[parts.length - 1]] = value;
  }
  fs.writeFileSync(file, JSON.stringify(j, null, 2) + '\n');
}
apply('src/i18n/locales/es.json', es);
apply('src/i18n/locales/en.json', en);
console.log('done');
