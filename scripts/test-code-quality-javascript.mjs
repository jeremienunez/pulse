import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { validatePolicy } from './code-quality/policy.mjs';
import { toolContext } from './code-quality/adapters.mjs';
import { collectJavaScript, javascriptFacts } from './code-quality/javascript.mjs';
const tools = process.env.PULSE_QUALITY_TOOLCHAIN;
function fixture(t, files) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'quality JS-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  for (const [p, s] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(root, p)), { recursive: true });
    fs.writeFileSync(path.join(root, p), s);
  }
  const candidate = { root, env: process.env, entries: Object.keys(files).map((path) => ({ path })) };
  return { root, ctx: toolContext(candidate, tools, path.join(root, 'logs')), files: Object.keys(files) };
}
const policy = (extra) =>
  validatePolicy({
    schema_version: '1.0',
    mode: 'observe',
    profiles: ['javascript'],
    include: ['src/**'],
    ...extra,
  });
test(
  'native TypeScript/JSX AST counts methods/comments and recognizes actual lint failures',
  { skip: !tools },
  async (t) => {
    const f = fixture(t, {
      'src/value.ts':
        'export class Owner {\n // comment\n private state = 1;\n read(): number {\n debugger;\n return this.state;\n }\n}\n',
    });
    const r = await collectJavaScript(f.ctx, f.files, policy(), 'commit');
    assert.ok(r.findings.some((x) => x.ruleId === 'eslint/no-debugger' && x.severity === 'error'));
    const facts = await javascriptFacts(f.ctx, f.files[0]);
    assert.equal(facts.classes[0].public_methods, 1);
    assert.equal(facts.functions[0].nloc, 4);
    assert.equal(facts.classes[0].nloc, 7);
  },
);
test(
  'declared ownership forbids domain-to-storage imports even when only an import changed',
  { skip: !tools },
  async (t) => {
    const f = fixture(t, {
      'src/domain/a.ts': "import { value } from '../storage/b.js'; export const a = value;\n",
      'src/storage/b.ts': 'export const value = 1;\n',
    });
    const r = await collectJavaScript(
      f.ctx,
      f.files,
      policy({
        ownership: {
          required: true,
          zones: [
            { id: 'domain', patterns: ['src/domain/**'], allows: [] },
            { id: 'storage', patterns: ['src/storage/**'], allows: ['domain'] },
          ],
        },
      }),
      'commit',
    );
    assert.ok(r.findings.some((x) => x.ruleId === 'owner/import' && x.path === 'src/domain/a.ts'));
  },
);
test(
  'a resource class with one consumer is reviewed rather than rejected or auto-extracted',
  { skip: !tools },
  async (t) => {
    const f = fixture(t, {
      'src/resource.ts': 'export class Resource { private value = 1; read() { return this.value; } }\n',
    });
    const r = await collectJavaScript(f.ctx, f.files, policy(), 'commit');
    assert.ok(r.findings.some((x) => x.kind === 'review'));
    assert.equal(r.findings.filter((x) => x.severity === 'error').length, 0);
  },
);
test('anonymous review identities survive unrelated blank lines', { skip: !tools }, async (t) => {
  const f = fixture(t, { 'src/a.ts': 'export const first = [1].map(x => x + 1);\n' });
  const a = await javascriptFacts(f.ctx, 'src/a.ts');
  const g = fixture(t, { 'src/a.ts': '\n\nexport const first = [1].map(x => x + 1);\n' });
  const b = await javascriptFacts(g.ctx, 'src/a.ts');
  assert.equal(a.functions[0].symbol, b.functions[0].symbol);
});
test(
  'I/O-free owners reject actual globals but accept an injected port with the same local name',
  { skip: !tools },
  async (t) => {
    const p = policy({
      ownership: { required: true, zones: [{ id: 'domain', patterns: ['src/**'], allows: [], io: false }] },
    });
    const bad = fixture(t, {
      'src/a.ts': 'export async function load() { return fetch("https://example.invalid"); }',
    });
    assert.ok(
      (await collectJavaScript(bad.ctx, bad.files, p, 'commit')).findings.some(
        (x) => x.ruleId === 'eslint/no-restricted-globals',
      ),
    );
    const good = fixture(t, { 'src/a.ts': 'export function load(fetch: () => string) { return fetch(); }' });
    assert.equal(
      (await collectJavaScript(good.ctx, good.files, p, 'commit')).findings.filter(
        (x) => x.severity === 'error',
      ).length,
      0,
    );
  },
);
test(
  'optional native CI audits expose actionable findings with stable identities, not timestamps',
  { skip: !tools },
  async (t) => {
    const body =
      'export function repeated(input) {\n' +
      Array.from({ length: 20 }, (_, i) => `  input = input + ${i};`).join('\n') +
      '\n  return input;\n}\n';
    const f = fixture(t, {
      'package.json': '{"name":"audit-case","version":"1.0.0","type":"module"}',
      'knip.json': '{"entry":["src/index.js"],"project":["src/*.js"]}',
      'src/index.js': 'import {used} from "./a.js"; console.log(used);',
      'src/a.js': 'export const used=1; export const unused=2;\n' + body,
      'src/b.js': body,
    });
    const files = f.files.filter((p) => p.endsWith('.js'));
    const p = policy({ unused: true, clones: true });
    const a = await collectJavaScript(f.ctx, files, p, 'ci');
    assert.ok(a.findings.some((x) => x.ruleId === 'unused/exports' && x.symbol === 'unused'));
    assert.ok(a.findings.some((x) => x.ruleId === 'duplication/block'));
    const second = toolContext(f.ctx.candidate, tools, path.join(f.root, 'logs-second'));
    const b = await collectJavaScript(second, files, p, 'ci');
    assert.deepEqual(a.findings, b.findings);
  },
);
test(
  'explicit public signatures change review identity while unrelated bodies and positions do not',
  { skip: !tools },
  async (t) => {
    const a = fixture(t, { 'src/a.ts': 'export function read(value: number): number { return value + 1; }' }),
      b = fixture(t, { 'src/a.ts': '\nexport function read(value: number): number { return value + 2; }' }),
      c = fixture(t, { 'src/a.ts': 'export function read(value: string): string { return value; }' });
    const first = await javascriptFacts(a.ctx, 'src/a.ts'),
      second = await javascriptFacts(b.ctx, 'src/a.ts'),
      changed = await javascriptFacts(c.ctx, 'src/a.ts');
    assert.equal(first.functions[0].signature, second.functions[0].signature);
    assert.notEqual(first.functions[0].signature, changed.functions[0].signature);
  },
);
test(
  'required ownership cannot misclassify an unresolved undeclared alias as a proven external package',
  { skip: !tools },
  async (t) => {
    const f = fixture(t, { 'src/a.ts': "import { value } from '@project/domain'; export const a=value;" });
    await assert.rejects(
      collectJavaScript(
        f.ctx,
        f.files,
        policy({ ownership: { required: true, zones: [{ id: 'ui', patterns: ['src/**'], allows: [] }] } }),
        'commit',
      ),
      /Unresolved/u,
    );
  },
);
