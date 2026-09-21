#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const RUNTIME_DIRECTORIES = [
  ".agents",
  ".codex-plugin",
  ".claude-plugin",
  ".plugin-eval",
  "assets",
  "docs",
  "pulse-eval-workspace",
  "skills",
  "workflow",
  "scripts",
];

const RUNTIME_FILES = [
  ".mcp.json",
  "AGENTS.template.md",
  "README.md",
  "CLAUDE.md",
  "CONTRIBUTING.md",
  "skill-catalog.json",
];

const OPTIONAL_RUNTIME_FILES = ["LICENSE", "NOTICE"];

function hashFile(targetPath) {
  return crypto.createHash("sha256").update(fs.readFileSync(targetPath)).digest("hex");
}

function listFiles(root) {
  const files = [];
  const queue = [root];
  while (queue.length > 0) {
    const current = queue.shift();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolutePath = path.join(current, entry.name);
      if (entry.isSymbolicLink()) {
        throw new Error(`Distribution may not contain symlinks: ${absolutePath}`);
      }
      if (entry.isDirectory()) {
        queue.push(absolutePath);
        continue;
      }
      if (!entry.isFile()) continue;
      const relativePath = path.relative(root, absolutePath).split(path.sep).join("/");
      if (relativePath === "dist-manifest.json") continue;
      files.push(relativePath);
    }
  }
  return files.sort((left, right) => left.localeCompare(right));
}

export function refreshDistManifest(root) {
  const distributionRoot = path.resolve(root);
  const files = listFiles(distributionRoot).map((relativePath) => {
    const absolutePath = path.join(distributionRoot, relativePath);
    return {
      path: relativePath,
      sha256: hashFile(absolutePath),
      size: fs.statSync(absolutePath).size,
    };
  });
  const manifest = {
    schema_version: "1.0",
    plugin: "pulse",
    files,
  };
  fs.writeFileSync(
    path.join(distributionRoot, "dist-manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
    "utf8",
  );
  return manifest;
}

export function buildPluginDist(sourceRoot, outputRoot) {
  const source = path.resolve(sourceRoot);
  const output = path.resolve(outputRoot);
  if (output === source || output.startsWith(`${source}${path.sep}`)) {
    throw new Error("Distribution output must be outside the source repository.");
  }
  if (fs.existsSync(output)) {
    throw new Error(`Distribution output already exists: ${output}`);
  }
  fs.mkdirSync(output, { recursive: true });

  for (const directory of RUNTIME_DIRECTORIES) {
    const from = path.join(source, directory);
    if (!fs.statSync(from).isDirectory()) throw new Error(`Missing runtime directory: ${directory}`);
    fs.cpSync(from, path.join(output, directory), { recursive: true, errorOnExist: true });
  }
  for (const file of RUNTIME_FILES) {
    const from = path.join(source, file);
    if (!fs.statSync(from).isFile()) throw new Error(`Missing runtime file: ${file}`);
    fs.copyFileSync(from, path.join(output, file), fs.constants.COPYFILE_EXCL);
  }
  for (const file of OPTIONAL_RUNTIME_FILES) {
    const from = path.join(source, file);
    if (!fs.existsSync(from)) continue;
    fs.copyFileSync(from, path.join(output, file), fs.constants.COPYFILE_EXCL);
  }

  const manifest = refreshDistManifest(output);
  return { output, file_count: manifest.files.length, manifest };
}

function fileMap(root) {
  return new Map(listFiles(root).map((relativePath) => [relativePath, hashFile(path.join(root, relativePath))]));
}

export function comparePluginDist(leftRoot, rightRoot) {
  const left = fileMap(path.resolve(leftRoot));
  const right = fileMap(path.resolve(rightRoot));
  const differences = [];
  for (const relativePath of [...new Set([...left.keys(), ...right.keys()])].sort()) {
    if (!left.has(relativePath)) {
      differences.push(`unexpected:${relativePath}`);
    } else if (!right.has(relativePath)) {
      differences.push(`missing:${relativePath}`);
    } else if (left.get(relativePath) !== right.get(relativePath)) {
      differences.push(`hash:${relativePath}`);
    }
  }
  return { ok: differences.length === 0, differences };
}

function parseArgs(argv) {
  const args = { command: argv[0] || "build" };
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) continue;
    args[token.slice(2).replace(/-/gu, "_")] = argv[index + 1] || "";
    index += 1;
  }
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.command === "build") {
    process.stdout.write(`${JSON.stringify(buildPluginDist(args.source || process.cwd(), args.output), null, 2)}\n`);
    return;
  }
  if (args.command === "manifest") {
    process.stdout.write(`${JSON.stringify(refreshDistManifest(args.root), null, 2)}\n`);
    return;
  }
  if (args.command === "compare") {
    const result = comparePluginDist(args.left, args.right);
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }
  throw new Error(`Unknown command: ${args.command}.`);
}

const SCRIPT_PATH = fileURLToPath(import.meta.url);
if (process.argv[1] && path.resolve(process.argv[1]) === SCRIPT_PATH) {
  try {
    main();
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
