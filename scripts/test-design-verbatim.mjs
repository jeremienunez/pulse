import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { buildPluginDist } from "./build-plugin-dist.mjs";

const ROOT = fileURLToPath(new URL("../", import.meta.url));
const REFS = "skills/design/references/";
const SOURCE_COMMIT = "f193f6745aae738e9d54a0ca28792822e4777a63";
const MAP_SHA = "6dedd78592f1471ef88f57fe88c42c9d481bd1774879bdeed45c465f9a2c5a6a";
const LICENSE_SHA = "26577196d8f396c81c0b17c1ba71800f957a0af72b3681cecfc832800bfa4a06";
const KINDS = new Set(["deduplicate", "ownership", "recipe-clarification", "reference-path", "artefact-path", "historical-status", "helper-path", "attribution", "annotation", "coverage"]);
const digest = bytes => createHash("sha256").update(bytes).digest("hex");
const readJson = (root, relative) => JSON.parse(fs.readFileSync(path.join(root, relative), "utf8"));

function uniqueSources(records) {
  assert.ok(Array.isArray(records));
  const result = new Map(records.map(record => [record.source, record]));
  assert.equal(result.size, 19, "all nineteen source identities are required");
  assert.equal(records.length, result.size, "source identities must be unique");
  return result;
}

function reconstruct(bytes, operations) {
  assert.ok(Array.isArray(operations));
  let current = bytes;
  for (const operation of [...operations].reverse()) {
    assert.ok(Number.isSafeInteger(operation.offset) && operation.offset >= 0);
    assert.ok(KINDS.has(operation.kind), "known local adaptation category");
    assert.ok(typeof operation.reason === "string" && operation.reason.trim());
    assert.match(operation.arbitration, /^A(?:[1-9]|1[0-2])(?:\/A(?:[1-9]|1[0-2]))*$/u);
    assert.equal(typeof operation.before, "string");
    assert.equal(typeof operation.after, "string");
    const after = Buffer.from(operation.after, "utf8");
    assert.ok(operation.offset + after.length <= current.length);
    assert.ok(current.subarray(operation.offset, operation.offset + after.length).equals(after), "exact after-bytes at the recorded byte offset");
    current = Buffer.concat([current.subarray(0, operation.offset), Buffer.from(operation.before, "utf8"), current.subarray(operation.offset + after.length)]);
  }
  return current;
}

function verifyRetainedCorpus(root) {
  const lock = readJson(root, REFS + "awwwards-source-lock.json");
  const ledger = readJson(root, REFS + "awwwards-adaptations.json");
  assert.equal(lock.schema_version, "1.0");
  assert.equal(ledger.schema_version, "1.0");
  assert.equal(lock.commit, SOURCE_COMMIT);
  assert.equal(ledger.source_commit, SOURCE_COMMIT);
  assert.equal(lock.approved_source_map_sha256, MAP_SHA);
  assert.equal(digest(JSON.stringify(lock.approved_source_map, null, 2) + "\n"), MAP_SHA, "the approved map is pinned independently of mutable output hashes");
  assert.equal(lock.canonical_quality_bar, "jury/references/quality-bar.md");
  assert.equal(lock.helper_execution_or_installation, false);
  assert.equal(lock.license.source, "LICENSE", "this is an external source label, not Pulse's root licence");
  assert.equal(lock.license.destination, "skills/design/LICENSE.juliobsz-skills");
  assert.equal(lock.license.sha256, LICENSE_SHA);
  assert.equal(digest(fs.readFileSync(path.join(root, lock.license.destination))), LICENSE_SHA);
  const approved = uniqueSources(lock.approved_source_map.files);
  const locked = uniqueSources(lock.text_sources);
  const retained = uniqueSources(ledger.files);
  const destinations = new Set();
  let operations = 0;
  for (const [source, expected] of approved) {
    const record = retained.get(source), identity = locked.get(source);
    assert.ok(record && identity, "missing or foreign source identity");
    for (const item of [record, identity]) {
      assert.equal(item.source_sha256, expected.source_sha256);
      assert.equal(item.destination, expected.destination);
    }
    assert.deepEqual(record.section_inventory, expected.section_inventory);
    assert.match(record.destination, /^skills\/design\/references\/[a-z-]+\.md$/u);
    assert.equal(record.source_bytes, identity.source_bytes);
    assert.equal(record.destination_sha256, identity.destination_sha256);
    assert.equal(record.destination_bytes, identity.destination_bytes);
    const bytes = fs.readFileSync(path.join(root, record.destination));
    assert.equal(digest(bytes), record.destination_sha256, "undeclared destination content change");
    assert.equal(bytes.length, record.destination_bytes);
    const original = reconstruct(bytes, record.operations);
    assert.equal(digest(original), expected.source_sha256, "exact pinned source reconstruction");
    assert.equal(original.length, record.source_bytes);
    destinations.add(record.destination);
    operations += record.operations.length;
  }
  assert.equal(destinations.size, 18, "only the generated quality-bar copy is deduplicated");
  return { sources: approved.size, destinations: destinations.size, operations };
}

function withCorpus(action) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-verbatim-"));
  try {
    fs.mkdirSync(path.join(root, "skills"));
    fs.cpSync(path.join(ROOT, "skills/design"), path.join(root, "skills/design"), { recursive: true });
    return action(root);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

function mutateText(root, name, before, after) {
  const file = path.join(root, REFS, name);
  const text = fs.readFileSync(file, "utf8");
  assert.ok(text.includes(before), "the intended mutation target exists");
  fs.writeFileSync(file, text.replace(before, after));
}

test("design corpus reconstructs all nineteen pinned sources without an upstream checkout", () => {
  const result = verifyRetainedCorpus(ROOT);
  assert.deepEqual([result.sources, result.destinations], [19, 18]);
  assert.ok(result.operations > 0);
});

for (const [name, file, before, after] of [
  ["deleted section", "awwwards-content.md", "## Case study structure (each project page)", ""],
  ["changed numeric prescription", "awwwards-typography.md", "line-height: 0.85;", "line-height: 0.86;"],
  ["lost style exception", "awwwards-art-direction.md", "These are defaults, not crimes.", ""],
]) {
  test(`design corpus rejects an undeclared ${name}`, () => withCorpus(root => {
    mutateText(root, file, before, after);
    assert.throws(() => verifyRetainedCorpus(root));
  }));
}

test("design corpus rejects a missing destination or an incomplete source matrix", () => withCorpus(root => {
  fs.rmSync(path.join(root, REFS, "awwwards-content.md"));
  assert.throws(() => verifyRetainedCorpus(root));
}));

test("design corpus rejects duplicate identities, unknown operations and bad byte offsets", () => {
  for (const mutate of [
    ledger => ledger.files.push(ledger.files[0]),
    ledger => { ledger.files[0].operations[0].kind = "undeclared-rewrite"; },
    ledger => { ledger.files[0].operations[0].offset = -1; },
    ledger => { ledger.files[0].section_inventory.pop(); },
  ]) withCorpus(root => {
    const ledger = readJson(root, REFS + "awwwards-adaptations.json");
    mutate(ledger);
    fs.writeFileSync(path.join(root, REFS, "awwwards-adaptations.json"), JSON.stringify(ledger));
    assert.throws(() => verifyRetainedCorpus(root));
  });
});

test("design corpus cannot repin its approved source map by changing its own digest field", () => withCorpus(root => {
  const lock = readJson(root, REFS + "awwwards-source-lock.json");
  lock.approved_source_map.files[0].source_sha256 = "0".repeat(64);
  lock.approved_source_map_sha256 = digest(JSON.stringify(lock.approved_source_map, null, 2) + "\n");
  fs.writeFileSync(path.join(root, REFS, "awwwards-source-lock.json"), JSON.stringify(lock));
  assert.throws(() => verifyRetainedCorpus(root));
}));

test("declared reversible edits still require semantic review rather than a hash certificate", () => withCorpus(root => {
  const destination = REFS + "awwwards-typography.md";
  const file = path.join(root, destination), bytes = fs.readFileSync(file);
  const before = "line-height: 0.85;", after = "line-height: 0.86;";
  const offset = bytes.indexOf(Buffer.from(before));
  assert.ok(offset >= 0);
  const changed = Buffer.concat([bytes.subarray(0, offset), Buffer.from(after), bytes.subarray(offset + Buffer.byteLength(before))]);
  fs.writeFileSync(file, changed);
  const ledger = readJson(root, REFS + "awwwards-adaptations.json");
  const record = ledger.files.find(item => item.destination === destination);
  record.operations.push({ offset, before, after, kind: "annotation", reason: "Synthetic boundary demonstration; not an accepted semantic change", arbitration: "A8" });
  record.destination_sha256 = digest(changed); record.destination_bytes = changed.length;
  const lock = readJson(root, REFS + "awwwards-source-lock.json");
  Object.assign(lock.text_sources.find(item => item.destination === destination), { destination_sha256: record.destination_sha256, destination_bytes: changed.length });
  fs.writeFileSync(path.join(root, REFS, "awwwards-adaptations.json"), JSON.stringify(ledger));
  fs.writeFileSync(path.join(root, REFS, "awwwards-source-lock.json"), JSON.stringify(lock));
  assert.equal(verifyRetainedCorpus(root).sources, 19, "byte reconstruction alone accepts this declared edit; the actual meaning must be reviewed separately");
}));

test("design guidance routes to concrete references and keeps calibration outside the critic packet", () => {
  const expected = {
    "SKILL.md": ["awwwards.md", "jury.md", "awwwards-typography.md", "awwwards-layout.md", "awwwards-content.md", "awwwards-motion.md", "awwwards-quality-bar.md"],
    "references/framing.md": ["awwwards-concepts.md", "awwwards-art-direction.md"],
    "references/implementation.md": ["awwwards-typography.md", "awwwards-layout.md", "awwwards-content.md"],
    "references/motion.md": ["awwwards-motion.md", "awwwards-patterns.md"],
    "references/review.md": ["jury.md", "awwwards-quality-bar.md"],
  };
  for (const [guide, topics] of Object.entries(expected)) {
    const body = fs.readFileSync(path.join(ROOT, "skills/design", guide), "utf8");
    for (const topic of topics) assert.ok(body.includes(`](${guide === "SKILL.md" ? "references/" : ""}${topic}`), `${guide} links ${topic}`);
  }
  const critic = fs.readFileSync(path.join(ROOT, REFS, "awwwards-quality-bar.md"), "utf8");
  assert.ok(!critic.includes("jury-calibration.md") && !critic.includes("awwwards-adaptation.md"));
  assert.ok(!critic.includes("+1.1") && !critic.includes("+ 1.1"));
  for (const name of ["awwwards.md", "awwwards-nextjs.md", "awwwards-astro.md", "jury.md"]) {
    const body = fs.readFileSync(path.join(ROOT, REFS, name), "utf8");
    for (const command of body.split("\n").filter(line => /^node .*scripts\/shoot\.mjs/u.test(line))) {
      assert.ok(command.includes('--out "$PULSE_DESIGN_EVIDENCE/shots"'), `${name} preserves fresh evidence destinations`);
    }
  }
});

test("extracted design package preserves the complete corpus and licence without external helpers", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pulse-verbatim-package-"));
  try {
    const output = path.join(root, "package");
    buildPluginDist(ROOT, output);
    assert.equal(verifyRetainedCorpus(output).sources, 19);
    const catalog = readJson(output, "skill-catalog.json");
    assert.equal(catalog.skillCount, 26);
    assert.equal(catalog.skills.find(item => item.name === "design").metadata.version, "1.2");
    assert.equal(fs.existsSync(path.join(output, "skills/design/scripts")), false);
    assert.equal(fs.existsSync(path.join(output, "history")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
