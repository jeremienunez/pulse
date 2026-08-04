#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function fail(message) {
  console.error(`FAIL: ${message}`);
  process.exitCode = 1;
}

function readJson(targetPath) {
  return JSON.parse(fs.readFileSync(targetPath, "utf8"));
}

function resolveArtifact(root, relativePath) {
  if (typeof relativePath !== "string" || !relativePath || path.isAbsolute(relativePath)) {
    throw new Error(`invalid artifact path: ${relativePath ?? "(missing)"}`);
  }
  const resolved = path.resolve(root, relativePath);
  const relative = path.relative(root, resolved);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`artifact escapes bundle root: ${relativePath}`);
  }
  return resolved;
}

function sha256(targetPath) {
  return crypto.createHash("sha256").update(fs.readFileSync(targetPath)).digest("hex");
}

const manifestPath = path.resolve(process.argv[2] || "manifest.json");
const bundleRoot = path.dirname(manifestPath);

let manifest;
try {
  manifest = readJson(manifestPath);
} catch (error) {
  fail(`cannot read manifest ${manifestPath}: ${error.message}`);
  process.exit();
}

if (manifest.kind !== "pulse-tuning-replay-manifest" || manifest.schemaVersion !== 1) {
  fail("unsupported manifest kind or schemaVersion");
}

const artifacts = Array.isArray(manifest.artifacts) ? manifest.artifacts : [];
for (const artifact of artifacts) {
  try {
    const targetPath = resolveArtifact(bundleRoot, artifact.path);
    const stat = fs.lstatSync(targetPath);
    if (!stat.isFile() || stat.isSymbolicLink()) {
      fail(`${artifact.path} is not a regular non-symlink file`);
      continue;
    }
    const actual = sha256(targetPath);
    if (actual !== artifact.sha256) fail(`${artifact.path} hash mismatch`);
  } catch (error) {
    fail(`${artifact.path ?? "(missing path)"}: ${error.message}`);
  }
}

const expectedCases = Array.isArray(manifest.certified_case_ids) ? manifest.certified_case_ids : [];
if (expectedCases.length !== 45 || new Set(expectedCases).size !== 45) {
  fail("manifest must declare exactly 45 unique certified_case_ids");
}

const profiles = Array.isArray(manifest.profiles) ? manifest.profiles : [];
if (profiles.length !== 2) fail("manifest must declare exactly two certified profiles");

let passed = 0;
for (const profile of profiles) {
  try {
    const evidencePath = resolveArtifact(bundleRoot, profile.evidence);
    const evidence = readJson(evidencePath);
    if (evidence.kind !== "pulse-exact-profile-case-results" || evidence.schemaVersion !== 1) {
      fail(`${profile.profile_id}: unsupported evidence kind or schemaVersion`);
      continue;
    }
    if (evidence.profile_id !== profile.profile_id) {
      fail(`${profile.profile_id}: evidence profile_id mismatch`);
    }
    if (JSON.stringify(evidence.runner) !== JSON.stringify(profile.runner)) {
      fail(`${profile.profile_id}: exact runner tuple mismatch`);
    }
    const cases = Array.isArray(evidence.cases) ? evidence.cases : [];
    const ids = cases.map((entry) => entry.case_id);
    if (JSON.stringify(ids) !== JSON.stringify(expectedCases) || new Set(ids).size !== ids.length) {
      fail(`${profile.profile_id}: case IDs are incomplete, duplicated, or reordered`);
    }
    for (const entry of cases) {
      const choicePresent = Array.isArray(entry.observed_choice)
        ? entry.observed_choice.length > 0
        : typeof entry.observed_choice === "string" && entry.observed_choice.length > 0;
      if (!choicePresent || typeof entry.rationalization !== "string" || !entry.rationalization.trim()) {
        fail(`${profile.profile_id}/${entry.case_id}: missing choice or rationalization`);
      }
      if (entry.verdict !== "PASS") fail(`${profile.profile_id}/${entry.case_id}: verdict is not PASS`);
      else passed += 1;
    }
  } catch (error) {
    fail(`${profile.profile_id ?? "(missing profile)"}: ${error.message}`);
  }
}

if (passed !== 90) fail(`expected 90 PASS verdicts, found ${passed}`);

for (const [name, commit] of Object.entries(manifest.commit_chain || {})) {
  if (!/^[0-9a-f]{7,40}$/u.test(commit)) fail(`invalid ${name} commit: ${commit}`);
}

if (!process.exitCode) {
  console.log(`PASS: ${artifacts.length} artifact hashes, 45 cases × 2 exact profiles, 90/90 verdicts`);
}
