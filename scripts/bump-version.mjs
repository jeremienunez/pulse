#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SEMVER = /^(\d+)\.(\d+)\.(\d+)$/u;
const BUMP_TYPES = new Set(["patch", "minor", "major"]);
const scriptRoot = path.dirname(fileURLToPath(import.meta.url));

function parseJson(targetPath) {
  try {
    return JSON.parse(fs.readFileSync(targetPath, "utf8"));
  } catch (error) {
    throw new Error(`cannot parse ${targetPath}: ${error.message}`);
  }
}

function assertPulsePlugin(manifest, targetPath) {
  if (manifest?.name !== "pulse" || typeof manifest.version !== "string") {
    throw new Error(`${targetPath} must be the Pulse plugin manifest with a string version`);
  }
  return manifest;
}

function findPulseMarketplaceEntry(marketplace, targetPath) {
  const matches = Array.isArray(marketplace?.plugins)
    ? marketplace.plugins.filter((entry) => entry?.name === "pulse")
    : [];
  if (matches.length !== 1 || typeof matches[0].version !== "string") {
    throw new Error(`${targetPath} must contain exactly one Pulse plugin entry with a string version`);
  }
  return matches[0];
}

function bumpVersion(current, bumpType) {
  const match = current.match(SEMVER);
  if (!match) throw new Error(`unsupported Pulse version: ${current}`);
  let [, major, minor, patchVersion] = match.map(Number);
  if (bumpType === "patch") patchVersion += 1;
  if (bumpType === "minor") {
    minor += 1;
    patchVersion = 0;
  }
  if (bumpType === "major") {
    major += 1;
    minor = 0;
    patchVersion = 0;
  }
  return `${major}.${minor}.${patchVersion}`;
}

function stageFiles(prepared) {
  const staged = [];
  try {
    for (const [index, entry] of prepared.entries()) {
      const tempPath = `${entry.path}.pulse-version-${process.pid}-${index}`;
      const handle = fs.openSync(tempPath, "wx", entry.mode);
      try {
        fs.writeFileSync(handle, entry.content, "utf8");
        fs.fsyncSync(handle);
      } finally {
        fs.closeSync(handle);
      }
      staged.push({ ...entry, tempPath });
    }
    return staged;
  } catch (error) {
    for (const entry of staged) fs.rmSync(entry.tempPath, { force: true });
    throw error;
  }
}

function restoreOriginals(prepared) {
  const errors = [];
  for (const [index, entry] of prepared.entries()) {
    const rollbackPath = `${entry.path}.pulse-version-rollback-${process.pid}-${index}`;
    try {
      const handle = fs.openSync(rollbackPath, "wx", entry.mode);
      try {
        fs.writeFileSync(handle, entry.original, "utf8");
        fs.fsyncSync(handle);
      } finally {
        fs.closeSync(handle);
      }
      fs.renameSync(rollbackPath, entry.path);
    } catch (error) {
      fs.rmSync(rollbackPath, { force: true });
      errors.push(`${entry.path}: ${error.message}`);
    }
  }
  if (errors.length) throw new Error(`rollback failed: ${errors.join("; ")}`);
}

function verifyPostcondition(paths, expectedVersion) {
  const claude = assertPulsePlugin(parseJson(paths.claudePlugin), paths.claudePlugin);
  const codex = assertPulsePlugin(parseJson(paths.codexPlugin), paths.codexPlugin);
  const agentsEntry = findPulseMarketplaceEntry(parseJson(paths.agentsMarketplace), paths.agentsMarketplace);
  const claudeEntry = findPulseMarketplaceEntry(parseJson(paths.claudeMarketplace), paths.claudeMarketplace);
  const versions = [claude.version, codex.version, agentsEntry.version, claudeEntry.version];
  if (!versions.every((version) => version === expectedVersion)) {
    throw new Error(`manifest postcondition failed: ${versions.join(", ")}`);
  }
  const readme = fs.readFileSync(paths.readme, "utf8");
  const badgeVersions = [...readme.matchAll(/version-(\d+\.\d+\.\d+)-/gu)].map((match) => match[1]);
  if (badgeVersions.length !== 1 || badgeVersions[0] !== expectedVersion) {
    throw new Error(`README badge postcondition failed: ${badgeVersions.join(", ") || "missing"}`);
  }
}

function main() {
  const bumpType = process.argv[2] || "patch";
  if (!BUMP_TYPES.has(bumpType)) throw new Error("Usage: scripts/bump-version.sh [patch|minor|major]");

  const root = path.resolve(process.env.PULSE_VERSION_ROOT || path.join(scriptRoot, ".."));
  const paths = {
    claudePlugin: path.join(root, ".claude-plugin/plugin.json"),
    codexPlugin: path.join(root, ".codex-plugin/plugin.json"),
    agentsMarketplace: path.join(root, ".agents/plugins/marketplace.json"),
    claudeMarketplace: path.join(root, ".claude-plugin/marketplace.json"),
    readme: path.join(root, "README.md"),
  };

  for (const targetPath of Object.values(paths)) {
    if (!fs.statSync(targetPath).isFile()) throw new Error(`required version surface not found: ${targetPath}`);
  }

  const claude = assertPulsePlugin(parseJson(paths.claudePlugin), paths.claudePlugin);
  const codex = assertPulsePlugin(parseJson(paths.codexPlugin), paths.codexPlugin);
  const agentsMarketplace = parseJson(paths.agentsMarketplace);
  const claudeMarketplace = parseJson(paths.claudeMarketplace);
  const agentsEntry = findPulseMarketplaceEntry(agentsMarketplace, paths.agentsMarketplace);
  const claudeEntry = findPulseMarketplaceEntry(claudeMarketplace, paths.claudeMarketplace);
  const readme = fs.readFileSync(paths.readme, "utf8");
  const badgeMatches = [...readme.matchAll(/version-(\d+\.\d+\.\d+)-/gu)];

  const currentVersions = [claude.version, codex.version, agentsEntry.version, claudeEntry.version];
  if (new Set(currentVersions).size !== 1) {
    throw new Error(`version surfaces are not aligned: ${currentVersions.join(", ")}`);
  }
  const current = currentVersions[0];
  if (!SEMVER.test(current)) throw new Error(`unsupported Pulse version: ${current}`);
  if (badgeMatches.length !== 1 || badgeMatches[0][1] !== current) {
    throw new Error(`README badge must contain exactly the current version ${current}`);
  }

  const next = bumpVersion(current, bumpType);
  claude.version = next;
  codex.version = next;
  agentsEntry.version = next;
  claudeEntry.version = next;

  const outputByPath = new Map([
    [paths.claudePlugin, `${JSON.stringify(claude, null, 2)}\n`],
    [paths.codexPlugin, `${JSON.stringify(codex, null, 2)}\n`],
    [paths.agentsMarketplace, `${JSON.stringify(agentsMarketplace, null, 2)}\n`],
    [paths.claudeMarketplace, `${JSON.stringify(claudeMarketplace, null, 2)}\n`],
    [paths.readme, readme.replace(/version-(\d+\.\d+\.\d+)-/u, `version-${next}-`)],
  ]);

  const prepared = [...outputByPath].map(([targetPath, content]) => ({
    path: targetPath,
    content,
    original: fs.readFileSync(targetPath, "utf8"),
    mode: fs.statSync(targetPath).mode,
  }));
  const staged = stageFiles(prepared);

  try {
    for (const entry of staged) fs.renameSync(entry.tempPath, entry.path);
    verifyPostcondition(paths, next);
  } catch (error) {
    for (const entry of staged) fs.rmSync(entry.tempPath, { force: true });
    restoreOriginals(prepared);
    throw new Error(`version bump aborted and original surfaces restored: ${error.message}`);
  }

  for (const entry of prepared) console.log(`  updated: ${entry.path}`);
  console.log(`\n${current} → ${next}`);
}

try {
  main();
} catch (error) {
  console.error(`Error: ${error.message}`);
  process.exitCode = 1;
}
