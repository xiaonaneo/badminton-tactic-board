const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const app = fs.readFileSync(path.join(__dirname, '..', 'app.js'), 'utf8');
assert.match(css, /\.board\s*>\s*svg\s*\{/i);
assert.doesNotMatch(css, /(?:^|\n)svg\s*\{/i);
assert.match(css, /\.sidebar\s*\{[^}]*z-index:\s*10;/is);
assert.match(css, /\.sidebar\s*\{[^}]*align-self:\s*start;/is);
assert.match(css, /\.board\s*\{[^}]*z-index:\s*1;/is);
assert.match(css, /\.board\s*>\s*svg\.is-dragging\s*\{[^}]*cursor:\s*grabbing\s*!important;/is);
assert.match(app, /svg\.classList\.add\(['"]is-dragging['"]\)/);
assert.match(app, /svg\.classList\.remove\(['"]is-dragging['"]\)/);
