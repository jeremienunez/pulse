import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildPluginDist } from './build-plugin-dist.mjs';
import { VISUAL_MAP_SHA, visualDigest, reconstructVisualSource, verifyVisualCorpus } from './lib/pulse-visual-verbatim.mjs';

const ROOT = fileURLToPath(new URL('../', import.meta.url));
const REFS = 'skills/design/references/';
const json = (root, file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const write = (root, file, value) => fs.writeFileSync(path.join(root, file), JSON.stringify(value, null, 2) + '\n');

function withCorpus(action) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-visual-verbatim-'));
  try {
    fs.mkdirSync(path.join(root, 'skills'));
    for (const owner of ['design', 'visual-assets']) fs.cpSync(path.join(ROOT, 'skills', owner), path.join(root, 'skills', owner), { recursive: true });
    return action(root);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
}

const operation = (offset, before, after) => ({ offset, before, after, kind: 'annotation', reason: 'Synthetic byte fixture', arbitration: 'A8' });

test('byte operations preserve multibyte text and successive overlapping edits with repeated arbitration', () => {
  const original = Buffer.from('été 🟠 café');
  const edits = [operation(0, 'été', 'hiver'), operation(0, 'hiver 🟠', 'été 🟢')];
  assert.deepEqual(reconstructVisualSource(Buffer.from('été 🟢 café'), edits), original);
});

test('byte operations reject bad offsets, metadata, after-bytes and reversal order', () => {
  for (const bad of [
    { offset: -1 }, { offset: 0.5 }, { offset: Number.MAX_SAFE_INTEGER },
    { kind: 'silent-rewrite' }, { arbitration: 'A9' }, { reason: '' }, { before: null }, { after: 1 },
    { offset: 1 }, { after: 'other' },
  ]) assert.throws(() => reconstructVisualSource(Buffer.from('été'), [{ ...operation(0, 'old', 'été'), ...bad }]));
  const edits = [operation(0, 'été', 'hiver'), operation(0, 'hiver', 'été long')];
  assert.throws(() => reconstructVisualSource(Buffer.from('été long'), [...edits].reverse()));
});

test('complete visual corpus reconstructs all 17 originals and 176 sections without external resources', () => {
  const result = verifyVisualCorpus(ROOT);
  assert.deepEqual([result.sources, result.sections, result.archive_members, result.protected_references], [17, 176, 49, 28]);
  assert.ok(result.operations > 0);
});

test('visual corpus rejects missing, duplicated, relocated or truncated source records', () => {
  for (const mutate of [
    ledger => ledger.files.pop(),
    ledger => { ledger.files[0] = ledger.files[1]; },
    ledger => { ledger.files[0].destination = 'skills/design/references/../SKILL.md'; },
    ledger => { ledger.files[0].section_inventory.pop(); },
  ]) withCorpus(root => {
    const file = REFS + 'visual-direction-adaptations.json', ledger = json(root, file);
    mutate(ledger); write(root, file, ledger);
    assert.throws(() => verifyVisualCorpus(root));
  });
  withCorpus(root => {
    fs.rmSync(path.join(root, REFS, 'cinematic-composition.md'));
    assert.throws(() => verifyVisualCorpus(root));
  });
});

test('visual corpus rejects undeclared loss of numeric prescriptions, exceptions and UTF-8 context', () => {
  for (const [name, before, after] of [
    ['geometric-composition-director.md', '0.618', '0.619'],
    ['cinematic-prompt-direction.md', 'Imperfection is optional.', ''],
    ['code-animated-explainer.md', '0.35–0.9 sec', '0.3 sec'],
  ]) withCorpus(root => {
    const file = path.join(root, REFS, name), content = fs.readFileSync(file, 'utf8');
    assert.ok(content.includes(before)); fs.writeFileSync(file, content.replace(before, after));
    assert.throws(() => verifyVisualCorpus(root));
  });
});

test('visual corpus rejects symlink inputs and changed protected references or capabilities', () => {
  withCorpus(root => {
    const target = path.join(root, REFS, 'cinematic-composition.md');
    fs.renameSync(target, target + '.original'); fs.symlinkSync(target + '.original', target);
    assert.throws(() => verifyVisualCorpus(root));
  });
  withCorpus(root => {
    fs.appendFileSync(path.join(root, REFS, 'cultural-digging.md'), '\nChanged\n');
    assert.throws(() => verifyVisualCorpus(root));
  });
  withCorpus(root => {
    const file = 'skills/visual-assets/references/capabilities.json', data = json(root, file);
    data.capabilities[0].output.native_vector = 'true'; write(root, file, data);
    assert.throws(() => verifyVisualCorpus(root));
  });
});

test('visual corpus independently pins its map and keeps candidate adapters unavailable', () => {
  withCorpus(root => {
    const file = REFS + 'visual-direction-source-lock.json', lock = json(root, file);
    lock.approved_source_map.files.pop();
    lock.approved_source_map_sha256 = visualDigest(JSON.stringify(lock.approved_source_map, null, 2) + '\n');
    assert.notEqual(lock.approved_source_map_sha256, VISUAL_MAP_SHA); write(root, file, lock);
    assert.throws(() => verifyVisualCorpus(root));
  });
  withCorpus(root => {
    const file = 'skills/visual-assets/references/capabilities.json', data = json(root, file);
    data.capabilities.find(row => row.id === 'beatmap').availability.command = ['node', 'scripts/pulse-beatmap.mjs'];
    write(root, file, data); assert.throws(() => verifyVisualCorpus(root));
  });
});

test('declared reversible semantic loss passes byte checks and still needs substantive review', () => withCorpus(root => {
  const lockFile = REFS + 'visual-direction-source-lock.json', ledgerFile = REFS + 'visual-direction-adaptations.json';
  const lock = json(root, lockFile), ledger = json(root, ledgerFile);
  const row = ledger.files.find(file => file.destination.endsWith('/geometric-composition-director.md'));
  const file = path.join(root, row.destination), bytes = fs.readFileSync(file), offset = bytes.indexOf(Buffer.from('0.618'));
  assert.ok(offset >= 0);
  const changed = Buffer.concat([bytes.subarray(0, offset), Buffer.from('0.619'), bytes.subarray(offset + 5)]);
  row.operations.push(operation(offset, '0.618', '0.619'));
  row.destination_sha256 = visualDigest(changed); row.destination_bytes = changed.length;
  Object.assign(lock.text_sources.find(item => item.source === row.source), { destination_sha256: row.destination_sha256, destination_bytes: row.destination_bytes });
  fs.writeFileSync(file, changed); write(root, lockFile, lock); write(root, ledgerFile, ledger);
  assert.equal(verifyVisualCorpus(root).sources, 17, 'this is byte conservation, not semantic approval');
}));

test('extracted package retains both owners and all method text without archive or helper dependency', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-visual-package-'));
  try {
    const output = path.join(root, 'package'); buildPluginDist(ROOT, output);
    assert.equal(verifyVisualCorpus(output).sources, 17);
    const catalog = json(output, 'skill-catalog.json');
    assert.equal(catalog.skillCount, 27);
    assert.equal(catalog.skills.find(row => row.name === 'design').metadata.version, '1.2');
    assert.equal(catalog.skills.find(row => row.name === 'visual-assets').metadata.version, '1.1');
    assert.equal(fs.existsSync(path.join(output, 'history')), false);
    assert.equal(fs.existsSync(path.join(output, 'skills/design/scripts')), false);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
