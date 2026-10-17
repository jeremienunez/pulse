#!/usr/bin/env node

import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

const COMMANDS = { antigravity: "agy", claude: "claude", codex: "codex" };
const ALIASES = { agy: "antigravity", "claude-code": "claude" };
const MCP = {
  deepseek: { server: "deepseek-coder", tools: ["delegate_code"] },
};
const OUTPUT_BYTES = 2 * 1024 * 1024;
const canonical = (name) => ALIASES[name] ?? name;
const inside = (file, directory) => file === directory || file.startsWith(`${directory}${path.sep}`);

function executable(name, env) {
  for (const directory of (env.PATH ?? "").split(path.delimiter)) {
    if (!directory) continue;
    const file = path.resolve(directory, name);
    try {
      fs.accessSync(file, fs.constants.X_OK);
      if (fs.statSync(file).isFile()) return file;
    } catch { /* Continue searching the caller's PATH. */ }
  }
  return null;
}

export function listTargets({ env = process.env } = {}) {
  return {
    targets: [
      ...Object.entries(COMMANDS).map(([target, name]) => ({ target, transport: "cli", executable: executable(name, env) })),
      ...Object.entries(MCP).map(([target, route]) => ({ target, transport: "mcp", ...route, availability: "caller_must_check_tools" })),
    ],
    filesystem_launcher: process.platform === "linux" ? executable("bwrap", env) : null,
  };
}

export function prepareRequest(request, { env = process.env, ownerCwd = process.cwd() } = {}) {
  if (!request || typeof request !== "object" || Array.isArray(request)) throw new Error("Request must be a JSON object.");
  const allowed = new Set(["caller", "target", "cwd", "prompt", "mode", "output_dir", "timeout_ms", "model"]);
  if (Object.keys(request).some((key) => !allowed.has(key))) throw new Error("Unknown request field.");
  const caller = canonical(request.caller), target = canonical(request.target);
  const names = [...Object.keys(COMMANDS), ...Object.keys(MCP)];
  if (!names.includes(caller) || !names.includes(target)) throw new Error("Unknown caller or target; use list to inspect supported transports.");
  if (typeof request.prompt !== "string" || !request.prompt.trim() || Buffer.byteLength(request.prompt) > 65536) {
    throw new Error("A nonempty prompt of at most 64 KiB is required.");
  }
  const mode = request.mode ?? "consult";
  if (!["consult", "work"].includes(mode)) throw new Error("Mode must be consult or explicitly authorized work.");
  if (typeof request.cwd !== "string" || !path.isAbsolute(request.cwd)) throw new Error("cwd must be an absolute existing workspace path.");
  const cwd = fs.realpathSync(request.cwd);
  if (!fs.statSync(cwd).isDirectory()) throw new Error("cwd must be a directory.");
  if (typeof request.output_dir !== "string" || !path.isAbsolute(request.output_dir)) throw new Error("output_dir must be an absolute new call directory.");
  const output = path.resolve(request.output_dir);
  if (inside(cwd, output)) throw new Error("The writable call directory cannot contain the workspace.");
  const timeout = request.timeout_ms ?? 180000;
  if (!Number.isInteger(timeout) || timeout < 100 || timeout > 900000) throw new Error("timeout_ms must be between 100 and 900000.");
  if (request.model !== undefined && (typeof request.model !== "string" || !request.model.trim() || request.model.length > 160)) {
    throw new Error("model must be a nonempty model identifier of at most 160 characters.");
  }
  let chain = env.PULSE_CLI_BRIDGE_CHAIN ? JSON.parse(env.PULSE_CLI_BRIDGE_CHAIN) : [caller];
  if (!Array.isArray(chain) || !chain.length || !chain.every((n) => names.includes(n)) || chain.at(-1) !== caller) {
    throw new Error("The inherited call chain does not match the caller.");
  }
  if (chain.includes(target)) throw new Error("CLI call cycle refused; report to the existing coordinator.");
  if (chain.length >= 4) throw new Error("CLI call depth limit reached.");
  chain = [...chain, target];
  if (MCP[target]) {
    return { status: "requires_mcp", caller, target, mode, cwd, output_dir: output, chain, route: MCP[target], task_verified: false };
  }
  if (mode === "work") {
    const owner = fs.realpathSync(ownerCwd);
    if (inside(cwd, owner) || inside(owner, cwd)) throw new Error("Work requires a separate workspace outside the coordinator checkout.");
  }
  const binary = executable(COMMANDS[target], env);
  if (!binary) throw new Error(`CLI executable unavailable: ${COMMANDS[target]}`);
  const launcher = process.platform === "linux" ? executable("bwrap", env) : null;
  if (!launcher) throw new Error("This filesystem adapter requires the installed Linux bwrap launcher; no unrestricted fallback is used.");
  const stateName = { antigravity: ".gemini", claude: ".claude", codex: ".codex" }[target];
  const runtime = [path.join(os.homedir(), stateName), path.join(os.homedir(), ".cache")]
    .filter((p) => fs.existsSync(p)).map((p) => fs.realpathSync(p));
  if (runtime.some((p) => inside(cwd, p))) throw new Error("Workspace overlaps writable CLI runtime state; choose a separate project directory.");
  return {
    status: "prepared", caller, target, mode, cwd, output_dir: output, timeout_ms: timeout,
    model: request.model ?? null, chain, binary, launcher, runtime, task_verified: false,
  };
}

function delegationPrompt(prepared, prompt) {
  return [
    `Bounded delegation from ${prepared.caller}; workspace: ${prepared.cwd}.`,
    prepared.mode === "consult" ? "Consultation only: return analysis or a proposal, without project edits or external effects." : "Execute only the explicitly authorized task in this isolated workspace.",
    "The caller owns acceptance and any existing Pulse run. Do not initialize a second delivery lifecycle or approve human gates.",
    "Keep the inherited PULSE_CLI_BRIDGE_CHAIN for any authorized follow-on CLI call. Report uncertainty and denied tools to the caller.",
    "TASK AND SUPPLIED DATA:", prompt,
  ].join("\n\n");
}

function cliArguments(prepared, prompt) {
  const consult = prepared.mode === "consult";
  let args, input = null;
  if (prepared.target === "antigravity") {
    args = ["--print", prompt, "--output-format", "json", "--mode", consult ? "plan" : "accept-edits"];
  } else if (prepared.target === "claude") {
    args = ["--print", prompt, "--output-format", "json", "--permission-mode", consult ? "plan" : "acceptEdits", "--no-session-persistence", "--no-chrome"];
    if (consult) args.push("--tools", "Read,Glob,Grep", "--strict-mcp-config", "--mcp-config", '{"mcpServers":{}}', "--disable-slash-commands");
  } else if (prepared.target === "codex") {
    args = ["--no-daemon", "exec", "--json", "--color", "never", "--sandbox", consult ? "read-only" : "workspace-write", "--cd", prepared.cwd, "--skip-git-repo-check", "--ephemeral"];
    input = prompt;
  } else {
    throw new Error("Unsupported CLI transport.");
  }
  if (prepared.model) args.push("--model", prepared.model);
  if (input !== null) args.push("-");
  return { args, input };
}

export function normalizeOutput(target, { stdout = "", stderr = "", exitCode, signal = null, stopped = null }) {
  if (!Object.hasOwn(COMMANDS, target)) throw new Error("Unsupported CLI transport.");
  const result = { status: "invalid_output", response: "", exit_code: exitCode, signal, task_verified: false, effect_uncertain: false, tool_denied: false };
  if (stopped) return { ...result, status: stopped, effect_uncertain: true };
  let value;
  try {
    if (target === "codex") {
      const events = stdout.split(/\r?\n/u).filter((s) => s.trim()).map((s) => JSON.parse(s));
      value = { events };
      result.response = events.filter((e) => e.type === "item.completed" && e.item?.type === "agent_message").map((e) => e.item.text ?? "").join("\n").trim();
      const completed = events.some((e) => e.type === "turn.completed");
      const failed = events.some((e) => e.type === "turn.failed");
      result.status = failed ? "failed" : completed && result.response ? "completed" : "invalid_output";
    } else {
      value = JSON.parse(stdout);
      if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid envelope");
      if (target === "antigravity") {
        result.response = typeof value.response === "string" ? value.response : "";
        result.status = value.status === "SUCCESS" && result.response.trim() ? "completed" : "failed";
      } else if (target === "claude") {
        result.response = typeof value.result === "string" ? value.result : "";
        result.status = value.type === "result" && value.is_error === false && result.response.trim() ? "completed" : "failed";
        result.tool_denied = Array.isArray(value.permission_denials) && value.permission_denials.length > 0;
      }
      if (typeof value.model === "string") result.model_reported = value.model;
    }
  } catch {
    result.status = "invalid_output";
  }
  result.tool_denied ||= /soft[- ]denied|permission denied|(?:tool|run_command).{0,80}(?:denied|refus)|requires (?:your )?(?:approval|confirmation)/iu.test(stderr);
  if (result.tool_denied) result.status = "denied";
  else if (exitCode !== 0 || signal) result.status = "failed";
  if (!["completed", "denied"].includes(result.status)) result.effect_uncertain = true;
  return result;
}

const writeJson = (file, value, flag = "wx") => fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, { mode: 0o600, flag });

export async function runRequest(request, { env = process.env, ownerCwd = process.cwd() } = {}) {
  const prepared = prepareRequest(request, { env, ownerCwd });
  if (prepared.status === "requires_mcp") return prepared;
  // Exclusive creation owns the operation. An existing submission is never replayed.
  fs.mkdirSync(path.dirname(prepared.output_dir), { recursive: true });
  fs.mkdirSync(prepared.output_dir, { mode: 0o700 });
  const tmp = path.join(prepared.output_dir, "tmp");
  fs.mkdirSync(tmp, { mode: 0o700 });
  const prompt = delegationPrompt(prepared, request.prompt);
  const { args, input } = cliArguments(prepared, prompt);
  const writable = [...new Set([prepared.output_dir, ...prepared.runtime, ...(prepared.mode === "work" ? [prepared.cwd] : [])])];
  const wrapper = ["--die-with-parent", "--unshare-pid", "--ro-bind", "/", "/", "--proc", "/proc", "--dev", "/dev"];
  for (const directory of writable) wrapper.push("--bind", directory, directory);
  wrapper.push("--chdir", prepared.cwd, "--", prepared.binary, ...args);
  const id = randomUUID(), start = Date.now();
  writeJson(path.join(prepared.output_dir, "request.json"), { id, state: "submitted", prepared, request, submitted_at: new Date(start).toISOString() });
  const stdoutFd = fs.openSync(path.join(prepared.output_dir, "stdout.log"), "wx", 0o600);
  const stderrFd = fs.openSync(path.join(prepared.output_dir, "stderr.log"), "wx", 0o600);
  const stdoutChunks = [], stderrChunks = [];
  let size = 0, stopped = null, killTimer, child;
  const stop = (reason) => {
    if (!stopped) stopped = reason;
    if (!child?.pid) return;
    try { process.kill(-child.pid, "SIGTERM"); } catch { /* Already exited. */ }
    killTimer ??= setTimeout(() => { try { process.kill(-child.pid, "SIGKILL"); } catch { /* Already exited. */ } }, 750);
  };
  const signalHandler = () => stop("interrupted");
  process.once("SIGINT", signalHandler);
  process.once("SIGTERM", signalHandler);
  let timer;
  try {
    const terminal = await new Promise((resolve) => {
      child = spawn(prepared.launcher, wrapper, {
        cwd: prepared.cwd, detached: true, shell: false,
        env: { ...env, TMPDIR: tmp, PULSE_CLI_BRIDGE_CHAIN: JSON.stringify(prepared.chain) },
        stdio: ["pipe", "pipe", "pipe"],
      });
      const capture = (chunk, channel, fd) => {
        const remaining = Math.max(0, OUTPUT_BYTES - size);
        if (remaining > 0) {
          const saved = chunk.subarray(0, remaining);
          fs.writeSync(fd, saved);
          (channel === "stdout" ? stdoutChunks : stderrChunks).push(saved);
        }
        size += chunk.length;
        if (size > OUTPUT_BYTES) stop("output_limit");
      };
      child.stdout.on("data", (data) => capture(data, "stdout", stdoutFd));
      child.stderr.on("data", (data) => capture(data, "stderr", stderrFd));
      child.once("error", (error) => { stderrChunks.push(Buffer.from(`Local launch failure: ${error.code ?? error.message}`)); });
      child.once("close", (exitCode, signal) => resolve({ exitCode, signal }));
      child.stdin.on("error", () => { /* A failed startup may close stdin before the prompt. */ });
      child.stdin.end(input ?? "");
      timer = setTimeout(() => stop("timed_out"), prepared.timeout_ms);
    });
    const result = {
      id, caller: prepared.caller, target: prepared.target, cwd: prepared.cwd, mode: prepared.mode,
      model_requested: prepared.model, chain: prepared.chain,
      ...normalizeOutput(prepared.target, { stdout: Buffer.concat(stdoutChunks).toString("utf8"), stderr: Buffer.concat(stderrChunks).toString("utf8"), ...terminal, stopped }),
      duration_ms: Date.now() - start, output_dir: prepared.output_dir, retry_performed: false,
      filesystem: { launcher: "bwrap", project: prepared.mode === "consult" ? "read-only" : "writable", writable_paths: writable },
    };
    writeJson(path.join(prepared.output_dir, "result.json"), result);
    return result;
  } finally {
    clearTimeout(timer); clearTimeout(killTimer);
    process.off("SIGINT", signalHandler); process.off("SIGTERM", signalHandler);
    fs.closeSync(stdoutFd); fs.closeSync(stderrFd);
  }
}

if (process.argv[1] && fs.realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const command = process.argv[2];
    let result;
    if (command === "list") result = listTargets();
    else {
      if (!["prepare", "run"].includes(command)) throw new Error("Usage: cli_bridge.mjs list | prepare --request <json> | run --request <json>");
      const { values } = parseArgs({ args: process.argv.slice(3), options: { request: { type: "string" } } });
      if (!values.request || fs.statSync(values.request).size > 262144) throw new Error("A request file of at most 256 KiB is required.");
      const request = JSON.parse(fs.readFileSync(values.request, "utf8"));
      result = command === "prepare" ? prepareRequest(request) : await runRequest(request);
    }
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (result.status && !["prepared", "completed", "requires_mcp"].includes(result.status)) process.exitCode = 1;
  } catch (error) {
    process.stdout.write(`${JSON.stringify({ status: "rejected", error: error.message, task_verified: false, retry_performed: false })}\n`);
    process.exitCode = 1;
  }
}
