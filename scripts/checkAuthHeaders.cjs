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
// Find fetch( ... { method: 'POST|PUT|DELETE|PATCH' ... } blocks missing auth header
const fetchRe = /fetch\([^)]*\{[\s\S]{0,500}?method:\s*'(POST|PUT|DELETE|PATCH)'[\s\S]{0,500}?\}\s*\)/g;
for (const f of files) {
  const s = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = fetchRe.exec(s))) {
    const block = m[0];
    const headerPart = block.match(/headers:\s*\{[\s\S]{0,300}?\}/);
    const hasAuth = headerPart && /getAuthHeader|Authorization|authHeader/.test(headerPart[0]);
    if (!hasAuth) {
      const line = s.slice(0, m.index).split('\n').length;
      console.log(`${f}:${line} method=${m[1]} headers=${headerPart ? headerPart[0].slice(0, 120) : 'NONE'}`);
    }
  }
}
console.log('scan done');
