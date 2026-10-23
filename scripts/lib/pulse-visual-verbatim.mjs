import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';

export const VISUAL_MAP_SHA = 'ea0039e9b3bc97bace711a69d2d9ec176dda7a154d36f272bfb797054ecdb6cf';
export const VISUAL_ARCHIVE_SHA = 'f6b84201b0214e68fddc294709f97ffcfd6a2fad53bde6056d4641a9e6b5622b';
const DESIGN_REFS = 'skills/design/references/';
const ASSET_REFS = 'skills/visual-assets/references/';
const KINDS = new Set(['ownership', 'reference-path', 'helper-contract', 'artefact-path', 'capability-qualification', 'attribution', 'contract-correction', 'annotation']);
const ROLES = new Set(['retained-text', 'external-document', 'external-script', 'external-test', 'external-example', 'external-asset', 'manifest']);
const CANDIDATES = ['composition-guides', 'shotboard', 'beatmap', 'layered-explainer'];
export const visualDigest = bytes => createHash('sha256').update(bytes).digest('hex');

function readFile(root, relative) {
  assert.equal(typeof relative, 'string');
  assert.ok(relative && !relative.includes('\\') && !path.posix.isAbsolute(relative));
  assert.equal(path.posix.normalize(relative), relative, 'canonical repository-relative path');
  assert.ok(!relative.split('/').includes('..'));
  let file = fs.realpathSync(root);
  for (const part of relative.split('/')) {
    file = path.join(file, part);
    assert.ok(!fs.lstatSync(file).isSymbolicLink(), 'no symlink in a retained input path');
  }
  assert.ok(fs.lstatSync(file).isFile(), 'regular retained input');
  return fs.readFileSync(file);
}

const readJson = (root, relative) => JSON.parse(readFile(root, relative).toString('utf8'));

function unique(rows, key, count) {
  assert.ok(Array.isArray(rows));
  const indexed = new Map(rows.map(row => [row[key], row]));
  assert.equal(rows.length, count, `complete ${key} matrix`);
  assert.equal(indexed.size, rows.length, `unique ${key} identities`);
  return indexed;
}

export function reconstructVisualSource(bytes, operations) {
  assert.ok(Buffer.isBuffer(bytes) && Array.isArray(operations));
  let current = bytes;
  for (const operation of [...operations].reverse()) {
    assert.ok(Number.isSafeInteger(operation.offset) && operation.offset >= 0);
    assert.ok(KINDS.has(operation.kind), 'declared adaptation category');
    assert.match(operation.arbitration, /^A[1-8]$/u);
    assert.ok(typeof operation.reason === 'string' && operation.reason.trim());
    assert.equal(typeof operation.before, 'string');
    assert.equal(typeof operation.after, 'string');
    const after = Buffer.from(operation.after, 'utf8');
    assert.ok(operation.offset + after.length <= current.length, 'bounded byte offset');
    assert.ok(current.subarray(operation.offset, operation.offset + after.length).equals(after), 'exact after-bytes');
    current = Buffer.concat([current.subarray(0, operation.offset), Buffer.from(operation.before, 'utf8'), current.subarray(operation.offset + after.length)]);
  }
  return current;
}

function verifySections(original, sections) {
  assert.ok(Array.isArray(sections) && sections.length);
  let end = 0;
  for (const section of sections) {
    assert.equal(section.start_byte, end, 'contiguous original section partition');
    assert.ok(Number.isSafeInteger(section.end_byte) && section.end_byte > end && section.end_byte <= original.length);
    assert.equal(typeof section.heading, 'string');
    assert.equal(visualDigest(original.subarray(end, section.end_byte)), section.sha256);
    end = section.end_byte;
  }
  assert.equal(end, original.length, 'every original byte belongs to a section');
}

function verifyText(root, expected, record, identity) {
  assert.ok(record && identity, 'each approved source is retained and locked');
  assert.match(expected.destination, /^skills\/(?:design|visual-assets)\/references\/[a-z-]+\.md$/u);
  for (const item of [record, identity]) {
    for (const field of ['source', 'source_sha256', 'source_bytes', 'destination']) assert.deepEqual(item[field], expected[field]);
  }
  assert.deepEqual(record.section_inventory, expected.sections);
  const bytes = readFile(root, expected.destination);
  assert.ok(Buffer.from(bytes.toString('utf8'), 'utf8').equals(bytes), 'valid destination UTF-8');
  assert.equal(bytes.length, record.destination_bytes);
  assert.equal(visualDigest(bytes), record.destination_sha256, 'declared destination bytes');
  assert.equal(identity.destination_bytes, record.destination_bytes);
  assert.equal(identity.destination_sha256, record.destination_sha256);
  const original = reconstructVisualSource(bytes, record.operations);
  assert.equal(original.length, expected.source_bytes);
  assert.equal(visualDigest(original), expected.source_sha256, 'exact pinned original reconstruction');
  verifySections(original, expected.sections);
  return record.operations.length;
}

function verifyMembers(map, lock) {
  const members = unique(map.archive_members, 'path', 49);
  const retained = unique(lock.preserved_members, 'path', 49);
  for (const [name, expected] of members) {
    const actual = retained.get(name);
    assert.ok(actual && ROLES.has(actual.role), 'every archive member has an explicit preservation role');
    for (const field of ['path', 'sha256', 'bytes']) assert.deepEqual(actual[field], expected[field]);
  }
  for (const expected of map.files) {
    const member = members.get(expected.source);
    assert.equal(member?.sha256, expected.source_sha256);
    assert.equal(member?.bytes, expected.source_bytes);
    assert.equal(retained.get(expected.source).role, 'retained-text');
  }
}

function verifyCapabilities(root, map) {
  const records = readJson(root, ASSET_REFS + 'capabilities.json').capabilities;
  const capabilities = unique(records, 'id', 8);
  for (const expected of map.protected_capabilities) assert.deepEqual(capabilities.get(expected.id), expected.expected_record, 'existing capability unchanged');
  assert.equal(unique(map.protected_capabilities, 'id', 4).size, 4);
  for (const id of CANDIDATES) {
    const record = capabilities.get(id);
    assert.equal(record?.kind, 'external-reference');
    assert.equal(record.availability.status, 'no-pulse-local-adapter');
    assert.ok(!Object.hasOwn(record.availability, 'command'), 'no fabricated local adapter');
    assert.equal(record.provenance.archive_sha256, VISUAL_ARCHIVE_SHA);
    assert.equal(record.provenance.runtime_bundled, false);
    const reference = path.posix.normalize(ASSET_REFS + record.reference);
    assert.ok(map.files.some(file => file.destination === reference), 'capability links a retained method');
    readFile(root, reference);
  }
}

export function verifyVisualCorpus(root) {
  const lock = readJson(root, DESIGN_REFS + 'visual-direction-source-lock.json');
  const ledger = readJson(root, DESIGN_REFS + 'visual-direction-adaptations.json');
  assert.equal(lock.schema_version, '1.0');
  assert.equal(ledger.schema_version, '1.0');
  assert.equal(lock.archive.sha256, VISUAL_ARCHIVE_SHA);
  assert.equal(ledger.archive_sha256, VISUAL_ARCHIVE_SHA);
  assert.equal(lock.helper_execution_or_installation, false);
  assert.equal(lock.approved_source_map_sha256, VISUAL_MAP_SHA);
  const map = lock.approved_source_map;
  assert.equal(visualDigest(JSON.stringify(map, null, 2) + '\n'), VISUAL_MAP_SHA, 'independently pinned source map');
  assert.deepEqual(lock.archive, map.archive);
  const approved = unique(map.files, 'source', 17);
  const locked = unique(lock.text_sources, 'source', 17);
  const retained = unique(ledger.files, 'source', 17);
  assert.equal(new Set(map.files.map(file => file.destination)).size, 17);
  verifyMembers(map, lock);
  let operations = 0;
  for (const [source, expected] of approved) operations += verifyText(root, expected, retained.get(source), locked.get(source));
  const protectedRefs = unique(map.protected_references, 'path', 28);
  for (const [relative, expected] of protectedRefs) {
    assert.ok(!map.files.some(file => file.destination === relative));
    assert.equal(visualDigest(readFile(root, relative)), expected.sha256, 'existing reference unchanged');
  }
  assert.equal(map.files.reduce((sum, file) => sum + file.sections.length, 0), 176);
  verifyCapabilities(root, map);
  return { sources: 17, sections: 176, archive_members: 49, protected_references: 28, operations };
}
