import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { validatePolicy } from './code-quality/policy.mjs';
import { toolContext, parseSARIF } from './code-quality/adapters.mjs';
import { collectPython, collectRust, collectBindings } from './code-quality/native.mjs';
const tools = process.env.PULSE_QUALITY_TOOLCHAIN;
function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quality native-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [p, s] of Object.entries(files)) fs.writeFileSync(path.join(root, p), s);
  const candidate = { root, env: process.env, entries: Object.keys(files).map((path) => ({ path })) };
  return { root, ctx: toolContext(candidate, tools, path.join(root, 'logs')), files: Object.keys(files) };
}
const policy = validatePolicy({
  schema_version: '1.0',
  mode: 'observe',
  profiles: ['native'],
  include: ['**/*'],
});
test(
  'real Python AST/tokenize and Ruff distinguish code strings from comments and flag undefined names',
  { skip: !tools },
  async (t) => {
    const f = fixture(t, {
      'a.py': 'def read_value():\n    # comment\n    marker = "# value"\n    return missing + len(marker)\n',
    });
    const r = await collectPython(f.ctx, f.files, policy);
    assert.ok(r.findings.some((x) => x.ruleId === 'ruff/F821'));
    assert.equal(r.findings.find((x) => x.metric === 'function_lines').value, 3);
  },
);
test('Rust build checks are explicitly not scheduled at commit, never passed due to missing Cargo context', async (t) => {
  const f = fixture(t, { 'lib.rs': 'pub fn value() -> u32 { 1 }\n' });
  assert.equal((await collectRust(f.ctx, f.files, policy, 'commit')).coverage[0].status, 'not_scheduled');
  await assert.rejects(collectRust(f.ctx, f.files, policy, 'ci'), /Cargo.toml/u);
});
test(
  'real Cargo/Clippy checks the snapshot offline and returns native diagnostics',
  { skip: !tools || spawnSync('cargo', ['clippy', '--version']).status !== 0 },
  async (t) => {
    const f = fixture(t, {
      'Cargo.toml':
        '[package]\nname="pulse_quality_case"\nversion="0.0.0"\nedition="2021"\n[lib]\npath="lib.rs"\n',
      'lib.rs': 'pub fn value() -> u32 { let bad: u32 = "text"; bad }\n',
    });
    assert.equal(spawnSync('cargo', ['generate-lockfile', '--offline'], { cwd: f.root }).status, 0);
    const r = await collectRust(f.ctx, f.files, policy, 'ci');
    assert.ok(r.findings.some((x) => x.severity === 'error' && x.ruleId.startsWith('rust/')));
  },
);
test('SARIF bridge accepts a language-independent result and rejects foreign files or failed invocations', () => {
  const doc = {
    version: '2.1.0',
    runs: [
      {
        tool: { driver: { name: 'native-tool' } },
        results: [
          {
            ruleId: 'N1',
            message: { text: 'Naming' },
            level: 'error',
            locations: [{ physicalLocation: { artifactLocation: { uri: 'src/a.go' } } }],
          },
        ],
      },
    ],
  };
  assert.equal(
    parseSARIF(JSON.stringify(doc), '/tmp/quality', 'go', new Set(['src/a.go']))[0].language,
    'go',
  );
  assert.throws(() => parseSARIF(JSON.stringify(doc), '/tmp/quality', 'go', new Set()), /outside/u);
  doc.runs[0].invocations = [{ executionSuccessful: false }];
  assert.throws(
    () => parseSARIF(JSON.stringify(doc), '/tmp/quality', 'go', new Set(['src/a.go'])),
    /incomplete/u,
  );
});
test('a missing required native analyzer yields unavailable and cannot quietly downgrade to N/A', async (t) => {
  const f = fixture(t, { 'a.go': 'package main\n' });
  const p = validatePolicy({
    ...policy,
    checks: [
      {
        id: 'go-architecture',
        language: 'go',
        profile: 'ci',
        format: 'sarif',
        required: true,
        command: ['missing-quality-go'],
      },
    ],
  });
  const r = await collectBindings(f.ctx, f.files, p, 'ci');
  assert.equal(r.coverage[0].status, 'unavailable');
  assert.equal(r.coverage[0].required, true);
});
test('new language bindings can match declared patterns without changing the core language registry', async (t) => {
  const f = fixture(t, {
    'source.newlang': 'module example\n',
    'emit.mjs':
      'console.log(JSON.stringify({success:true,findings:[{ruleId:"bad-name",path:"source.newlang",kind:"violation",severity:"error",message:"Bad name"}]}));',
  });
  const p = validatePolicy({
    ...policy,
    checks: [
      {
        id: 'new-language',
        language: 'new-language',
        patterns: ['*.newlang'],
        profile: 'ci',
        format: 'json',
        required: true,
        command: [process.execPath, 'emit.mjs'],
      },
    ],
  });
  const r = await collectBindings(f.ctx, ['source.newlang'], p, 'ci');
  assert.equal(r.coverage[0].status, 'checked');
  assert.equal(r.findings[0].language, 'new-language');
});
