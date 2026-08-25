'use strict';
const fs = require('fs');
const path = require('path');
const OUT = path.resolve(__dirname, '..', '..', 'exports', 'teamloop');
const html = fs.readFileSync(path.join(OUT, 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(OUT, 'css', 'styles.css'), 'utf8');
const js = fs.readFileSync(path.join(OUT, 'js', 'main.js'), 'utf8');

const checks = [];
function check(name, ok, detail) { checks.push({ name, ok, detail }); }

// 1. Tag balance for key structural tags
for (const tag of ['html', 'head', 'body', 'header', 'main', 'footer', 'section', 'div', 'article', 'nav', 'form']) {
  const open = (html.match(new RegExp('<' + tag + '(\\s|>)', 'g')) || []).length;
  const close = (html.match(new RegExp('</' + tag + '>', 'g')) || []).length;
  check('tag balance <' + tag + '>', open === close, open + ' open / ' + close + ' close');
}

// 2. Required sections present
for (const id of ['talent', 'how', 'why', 'vacancies', 'faq']) {
  check('section id=' + id, html.includes('id="' + id + '"'));
}

// 3. Required content blocks
check('hero h1', /<h1>/.test(html));
check('search bar', html.includes('class="search-bar"'));
check('8 talent cards', (html.match(/profile-card"/g) || []).length === 8);
check('3 steps', (html.match(/class="step"/g) || []).length === 3);
check('4 benefits', (html.match(/class="benefit"/g) || []).length === 4);
check('cta card', html.includes('cta-card'));
check('footer guides nav', html.includes('aria-label="Hiring guides"'));

// 4. Every class used in HTML exists in CSS
const htmlClasses = new Set();
for (const m of html.matchAll(/class="([^"]+)"/g)) m[1].split(/\s+/).forEach(c => c && htmlClasses.add(c));
const missing = [...htmlClasses].filter(c => !css.includes('.' + c));
check('all HTML classes styled in CSS', missing.length === 0, missing.length ? 'missing: ' + missing.join(', ') : htmlClasses.size + ' classes covered');

// 5. No source-site leakage
const leaks = ['Monthly Staff', 'monthlystaff', 'lovable', 'Rahama', 'Abdul', 'wa.me', 'linkedin.com/in/', 'profile-images'];
const found = leaks.filter(l => html.includes(l) || css.includes(l) || js.includes(l));
check('no source content leaked', found.length === 0, found.length ? 'found: ' + found.join(', ') : 'clean');

// 6. No external image assets (original build only)
check('no external images', !/<img[^>]+src="http/i.test(html));

// 7. JS syntax valid
try { new Function(js); check('main.js parses', true); } catch (e) { check('main.js parses', false, e.message); }

// 8. CSS brace balance
const ob = (css.match(/\{/g) || []).length, cb = (css.match(/\}/g) || []).length;
check('CSS braces balanced', ob === cb, ob + ' / ' + cb);

// report
let pass = 0;
for (const c of checks) {
  console.log((c.ok ? '[PASS] ' : '[FAIL] ') + c.name + (c.detail && !c.ok ? ' — ' + c.detail : ''));
  if (c.ok) pass++;
}
console.log('\n' + pass + '/' + checks.length + ' checks passed');
fs.writeFileSync(path.join(OUT, '..', '..', 'jobs', 'job-001-monthlystaff', 'qa-report.json'),
  JSON.stringify({ run_at: new Date().toISOString(), passed: pass === checks.length, total: checks.length, passed_count: pass, checks }, null, 2));
process.exit(pass === checks.length ? 0 : 1);
