const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
assert.match(css, /\.brush\.selected\s+\.brush-line\s*\{[^}]*stroke:\s*#ff6472/i);
assert.match(css, /\.brush\.selected\s+\.brush-line\s*\{[^}]*filter:\s*drop-shadow/i);
assert.match(css, /\.arrow-line\s*\{[^}]*stroke:\s*#ffe16a/i);
