import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validatePolicy } from './code-quality/policy.mjs';
import { toolContext, loadPackage } from './code-quality/adapters.mjs';
import { collectFrontend, inspectValue } from './code-quality/frontend.mjs';
const tools = process.env.PULSE_QUALITY_TOOLCHAIN;
function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quality UI-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [p, s] of Object.entries(files)) fs.writeFileSync(path.join(root, p), s);
  const candidate = { root, env: process.env, entries: Object.keys(files).map((path) => ({ path })) };
  return { root, ctx: toolContext(candidate, tools, path.join(root, 'logs')), files: Object.keys(files) };
}
const policy = () =>
  validatePolicy({
    schema_version: '1.0',
    mode: 'observe',
    profiles: ['frontend'],
    include: ['**/*'],
    tokens: { files: ['tokens.css'], include: ['*.css', '*.tsx'] },
  });
test(
  'real CSS reference files catch a removed token in an unchanged consumer',
  { skip: !tools },
  async (t) => {
    const f = fixture(t, {
      'tokens.css': ':root { --color-text: #123; }',
      'ui.css': '.a { color: var(--color-text); }',
    });
    assert.equal((await collectFrontend(f.ctx, f.files, policy())).findings.length, 0);
    fs.writeFileSync(path.join(f.root, 'tokens.css'), ':root { --color-other: #123; }');
    const r = await collectFrontend(f.ctx, f.files, policy());
    assert.ok(r.findings.some((x) => x.ruleId === 'tokens/unknown' && x.path === 'ui.css'));
  },
);
test('calc and fallback literals cannot bypass the design token policy', { skip: !tools }, async (t) => {
  const f = fixture(t, { 'tokens.css': ':root { --space: 4px; --text: #123; }' });
  const parser = await loadPackage(f.ctx, 'postcss-value-parser');
  const known = new Set(['--space', '--text']);
  const settings = policy().tokens;
  assert.ok(
    inspectValue('calc(var(--space) + 12px)', 'padding', settings, known, parser).some(
      (x) => x.ruleId === 'tokens/literal',
    ),
  );
  assert.ok(
    inspectValue('var(--text, #fff)', 'color', settings, known, parser).some(
      (x) => x.ruleId === 'tokens/literal',
    ),
  );
  assert.ok(
    inspectValue('var(--missing, var(--text))', 'color', settings, known, parser).some(
      (x) => x.ruleId === 'tokens/unknown',
    ),
  );
  assert.equal(inspectValue('calc(var(--space) * 2)', 'padding', settings, known, parser).length, 0);
});
test(
  'JSX literal styles are checked and arbitrary expressions retain explicit incomplete coverage',
  { skip: !tools },
  async (t) => {
    const f = fixture(t, {
      'tokens.css': ':root { --text: #123; }',
      'View.tsx':
        'export const View = () => <div style={{ color: "#fff" }} />; export const Dynamic = ({ theme }) => <div style={theme} />;',
    });
    const r = await collectFrontend(f.ctx, f.files, policy());
    assert.ok(r.findings.some((x) => x.path === 'View.tsx' && x.ruleId === 'tokens/literal'));
    assert.ok(r.coverage.some((x) => x.status === 'unsupported' && x.required === false));
  },
);
test(
  'local variables cannot hide raw token values unless explicitly admitted',
  { skip: !tools },
  async (t) => {
    const f = fixture(t, {
      'tokens.css': ':root { --text: #123; }',
      'ui.css': '.a { --made-up: #fff; color: var(--made-up); }',
    });
    const r = await collectFrontend(f.ctx, f.files, policy());
    assert.ok(r.findings.some((x) => x.ruleId === 'tokens/definition-owner'));
  },
);
test(
  'declared token names are checked and UI without a contract is not silently validated',
  { skip: !tools },
  async (t) => {
    const f = fixture(t, {
      'tokens.css': ':root { --BadName: #123; }',
      'ui.css': '.a { color: var(--BadName); }',
    });
    assert.ok(
      (await collectFrontend(f.ctx, f.files, policy())).findings.some((x) => x.ruleId === 'tokens/name'),
    );
    await assert.rejects(
      collectFrontend(
        f.ctx,
        f.files,
        validatePolicy({ schema_version: '1.0', mode: 'observe', profiles: ['frontend'], include: ['**/*'] }),
      ),
      /contract/u,
    );
  },
);
