const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');

assert.match(html, /<div class="action-group adds">[\s\S]*id="add-red"[\s\S]*id="add-blue"[\s\S]*id="add-shuttle"[\s\S]*<\/div>/);
assert.match(html, /<div class="action-group ops">[\s\S]*id="undo"[\s\S]*id="delete"[\s\S]*id="clear"[\s\S]*<\/div>/);
assert.match(html, /<div class="action-group share">[\s\S]*id="save"[\s\S]*<\/div>/);
assert.match(css, /\.seg,\s*\.action-group,\s*\.board\s*\{[^}]*border:/is);
assert.match(css, /\.action-group:not\(\.share\) button\s*\{[^}]*background:\s*transparent;/is);
assert.match(css, /\.action-group\.share button\.primary\s*\{[^}]*background:\s*transparent;[^}]*color:\s*var\(--green\);/is);
