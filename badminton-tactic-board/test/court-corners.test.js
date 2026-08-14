const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const court = fs.readFileSync(path.join(__dirname, '..', 'court.js'), 'utf8');
assert.match(court, /const FLOOR_RADIUS\s*=\s*\d+/);
assert.match(court, /rect\(0, 0, VIEW_W, VIEW_H, 'floor', \{ rx: FLOOR_RADIUS, ry: FLOOR_RADIUS \}\)/);
