import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cssVars, loadStyles} from '../src/html.js';

test('cssVars maps camelCase keys to --pdf-* variables and skips empty values', () => {
  assert.equal(cssVars({accent: '#f00', headerFontSize: '9px', subtitle: ''}), '--pdf-accent: #f00; --pdf-header-font-size: 9px;');
});

test('cssVars rejects values that would break out of the declaration', () => {
  assert.throws(() => cssVars({accent: 'red; } body { display: none'}));
  assert.throws(() => cssVars({'a b': 'red'}));
});

test('loadStyles puts theme variables after the built-in defaults', async () => {
  const {document, margins} = await loadStyles({vars: {accent: '#f00'}});
  for (const css of [document, margins]) {
    assert.ok(css.indexOf('--pdf-accent: #f00') > css.indexOf('--pdf-accent:'));
    assert.match(css, /^<style>[\s\S]*<\/style>$/);
  }
});
