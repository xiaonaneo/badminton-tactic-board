const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const css = fs.readFileSync(path.join(__dirname, '..', 'styles.css'), 'utf8');
const annotationRule = css.match(/\.annotation text\s*\{([^}]*)\}/i);
assert.ok(annotationRule, 'annotation text rule should exist');
assert.doesNotMatch(annotationRule[1], /\bstroke\s*:/i);
assert.doesNotMatch(annotationRule[1], /paint-order\s*:/i);
