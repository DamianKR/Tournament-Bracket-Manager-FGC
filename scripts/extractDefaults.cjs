const fs = require('fs');
const files = [];
function walk(d) {
  for (const e of fs.readdirSync(d, { withFileTypes: true })) {
    const p = d + '/' + e.name;
    if (e.isDirectory()) walk(p);
    else if (/\.(tsx|ts)$/.test(e.name)) files.push(p);
  }
}
walk('src');
// capture t('key', { ... }) including multiline up to 300 chars
const re = /t\(\s*'([a-zA-Z][a-zA-Z0-9.]*)'\s*,?\s*(\{[\s\S]{0,400}?\})?\s*\)/g;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = re.exec(s))) {
    const opts = m[2] || '';
    if (opts.includes('defaultValue')) {
      const dv = opts.match(/defaultValue:\s*'([^']*)'|defaultValue:\s*`([^`]*)`/);
      const hasCount = /count:/.test(opts);
      console.log(m[1] + ' | ' + (dv ? (dv[1] || dv[2]) : '(no dv)') + (hasCount ? ' | [count]' : ''));
    }
  }
}
