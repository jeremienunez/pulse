#!/usr/bin/env node

import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { buildPluginDist, refreshDistManifest } from "./build-plugin-dist.mjs";

export function buildAntigravityDist(sourceRoot, outputRoot, { installRoot, sourceCommit, excludeMcpServers = [] } = {}) {
  if (typeof installRoot !== "string" || !path.isAbsolute(installRoot)) {
    throw new Error("An absolute installRoot is required for the installed MCP script paths.");
  }
  const source = fs.realpathSync(sourceRoot);
  const target = path.resolve(installRoot);
  const claude = JSON.parse(fs.readFileSync(path.join(source, ".claude-plugin/plugin.json"), "utf8"));
  const codex = JSON.parse(fs.readFileSync(path.join(source, ".codex-plugin/plugin.json"), "utf8"));
  if (claude.name !== "pulse" || codex.name !== "pulse" || claude.version !== codex.version) {
    throw new Error("The canonical Pulse manifests must agree on plugin name and version.");
  }
  const commit = sourceCommit ?? execFileSync("git", ["-C", source, "rev-parse", "HEAD"], {
    encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"],
  }).trim();
  if (!/^[a-f0-9]{40,64}$/u.test(commit)) throw new Error("A source commit identity is required.");
  const config = JSON.parse(fs.readFileSync(path.join(source, ".mcp.json"), "utf8"));
  if (!config.mcpServers || typeof config.mcpServers !== "object") throw new Error("Missing canonical MCP definitions.");
  if (!Array.isArray(excludeMcpServers) || excludeMcpServers.some((name) => typeof name !== "string" || !Object.hasOwn(config.mcpServers, name))) {
    throw new Error("Excluded MCP servers must name existing canonical definitions.");
  }
  const excluded = [...new Set(excludeMcpServers)].sort();
  for (const name of excluded) delete config.mcpServers[name];

  const built = buildPluginDist(source, outputRoot);
  const snapshot = createHash("sha256").update(JSON.stringify(built.manifest.files)).digest("hex");
  const metadata = {
    schema_version: "1.0", plugin: "pulse", target: "antigravity-cli",
    version: claude.version, source_commit: commit, source_snapshot_sha256: snapshot,
    install_root: target, excluded_mcp_servers: excluded,
  };
  if (config.mcpServers["opencode-models"]) {
    config.mcpServers["opencode-models"].command = process.execPath;
    config.mcpServers["opencode-models"].args = [path.join(target, "scripts/opencode-models-mcp.mjs")];
  }
  const additions = {
    "plugin.json": { name: "pulse", description: claude.description },
    "mcp_config.json": config,
    "pulse-package.json": metadata,
  };
  for (const [name, value] of Object.entries(additions)) {
    fs.writeFileSync(path.join(built.output, name), `${JSON.stringify(value, null, 2)}\n`, { flag: "wx" });
  }
  const manifest = refreshDistManifest(built.output);
  return { output: built.output, file_count: manifest.files.length, metadata, manifest };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const { values } = parseArgs({
      options: {
        source: { type: "string", default: process.cwd() }, output: { type: "string" },
        "install-root": { type: "string" },
        "exclude-mcp": { type: "string", multiple: true, default: [] },
      },
    });
    if (!values.output) throw new Error("Usage: build-antigravity-dist.mjs --source <source> --output <new-directory> --install-root <final-plugin-path>");
    const result = buildAntigravityDist(values.source, values.output, { installRoot: values["install-root"], excludeMcpServers: values["exclude-mcp"] });
    process.stdout.write(`${JSON.stringify({ output: result.output, file_count: result.file_count, ...result.metadata }, null, 2)}\n`);
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
