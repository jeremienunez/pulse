#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

const SERVER_NAME = "pulse-opencode-models";
const SERVER_VERSION = "1.0.1";
// A stdio MCP connection owns one stable advisory session, including fallbacks.
const SESSION_ID = randomUUID();
const CLIENT_HEADERS = {
  "User-Agent": `${SERVER_NAME}/${SERVER_VERSION}`,
  "x-opencode-session": SESSION_ID,
};
const DEFAULT_TIMEOUT_MS = 120_000;
const MAX_PROMPT_CHARS = 120_000;
const MAX_SYSTEM_CHARS = 20_000;
const MAX_COMPARISON_MODELS = 4;

const PROVIDERS = {
  zen: {
    authKey: "opencode",
    baseUrl: "https://opencode.ai/zen/v1",
    prefix: "opencode",
  },
  go: {
    authKey: "opencode-go",
    baseUrl: "https://opencode.ai/zen/go/v1",
    prefix: "opencode-go",
  },
};

const tools = [
  {
    name: "list_models",
    title: "List OpenCode Models",
    description:
      "List models currently available through OpenCode Zen, OpenCode Go, or both. Use this before delegation when the exact model id is unknown.",
    inputSchema: {
      type: "object",
      properties: {
        provider: {
          type: "string",
          enum: ["all", "zen", "go"],
          default: "all",
          description: "Catalog to query.",
        },
        search: {
          type: "string",
          maxLength: 100,
          description: "Optional case-insensitive substring filter.",
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: true,
      openWorldHint: true,
    },
  },
  {
    name: "ask_model",
    title: "Ask an OpenCode Model",
    description:
      "Ask one OpenCode model for a read-only advisory answer. Pass only the bounded source context it needs, treat its response as a hypothesis, and verify material claims before acting. This call consumes the selected OpenCode plan or credits.",
    inputSchema: {
      type: "object",
      required: ["model", "prompt"],
      properties: {
        model: {
          type: "string",
          minLength: 1,
          maxLength: 160,
          description:
            "Model id, optionally prefixed with opencode/ or opencode-go/. An explicit provider prefix takes precedence.",
        },
        provider: {
          type: "string",
          enum: ["zen", "go"],
          default: "go",
          description: "Provider used when model has no prefix.",
        },
        prompt: {
          type: "string",
          minLength: 1,
          maxLength: MAX_PROMPT_CHARS,
          description: "Question plus the minimum relevant context.",
        },
        system: {
          type: "string",
          maxLength: MAX_SYSTEM_CHARS,
          description: "Optional concise role or evaluation rubric.",
        },
        reasoning_effort: {
          type: "string",
          enum: ["minimal", "low", "medium", "high"],
          default: "low",
        },
        max_output_tokens: {
          type: "integer",
          minimum: 32,
          maximum: 16_384,
          default: 2_048,
        },
        timeout_ms: {
          type: "integer",
          minimum: 1_000,
          maximum: 300_000,
          default: DEFAULT_TIMEOUT_MS,
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
  {
    name: "compare_models",
    title: "Compare OpenCode Models",
    description:
      "Ask two to four OpenCode models the same bounded question in parallel and return their answers side by side. Each model is a separate usage-bearing request; verify conclusions before acting.",
    inputSchema: {
      type: "object",
      required: ["models", "prompt"],
      properties: {
        models: {
          type: "array",
          minItems: 2,
          maxItems: MAX_COMPARISON_MODELS,
          uniqueItems: true,
          items: { type: "string", minLength: 1, maxLength: 160 },
          description:
            "Model ids. Prefix each with opencode/ or opencode-go/ to mix providers.",
        },
        provider: {
          type: "string",
          enum: ["zen", "go"],
          default: "go",
          description: "Fallback provider for unprefixed model ids.",
        },
        prompt: {
          type: "string",
          minLength: 1,
          maxLength: MAX_PROMPT_CHARS,
        },
        system: {
          type: "string",
          maxLength: MAX_SYSTEM_CHARS,
        },
        reasoning_effort: {
          type: "string",
          enum: ["minimal", "low", "medium", "high"],
          default: "low",
        },
        max_output_tokens: {
          type: "integer",
          minimum: 32,
          maximum: 8_192,
          default: 1_024,
        },
        timeout_ms: {
          type: "integer",
          minimum: 1_000,
          maximum: 300_000,
          default: DEFAULT_TIMEOUT_MS,
        },
      },
      additionalProperties: false,
    },
    annotations: {
      readOnlyHint: true,
      destructiveHint: false,
      idempotentHint: false,
      openWorldHint: true,
    },
  },
];

function authPath() {
  return (
    process.env.OPENCODE_AUTH_PATH ||
    join(homedir(), ".local", "share", "opencode", "auth.json")
  );
}

async function readCredentials() {
  let parsed;
  try {
    parsed = JSON.parse(await readFile(authPath(), "utf8"));
  } catch (error) {
    throw new Error(`Unable to read OpenCode credentials: ${error.message}`);
  }
  return parsed;
}

function normalizeProvider(value, fallback = "go") {
  if (value === "zen" || value === "go") return value;
  if (fallback === "zen" || fallback === "go") return fallback;
  throw new Error(`Unsupported provider: ${String(value)}`);
}

function resolveModel(modelValue, providerValue) {
  if (typeof modelValue !== "string" || modelValue.length === 0) {
    throw new Error("model must be a non-empty string");
  }
  let model = modelValue;
  let provider = normalizeProvider(providerValue);

  if (model.startsWith("opencode-go/")) {
    provider = "go";
    model = model.slice("opencode-go/".length);
  } else if (model.startsWith("opencode/")) {
    provider = "zen";
    model = model.slice("opencode/".length);
  }

  if (!/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(model)) {
    throw new Error(`Invalid model id: ${modelValue}`);
  }
  return { model, provider };
}

function assertText(value, name, maxLength) {
  if (typeof value !== "string" || value.length === 0) {
    throw new Error(`${name} must be a non-empty string`);
  }
  if (value.length > maxLength) {
    throw new Error(`${name} exceeds ${maxLength} characters`);
  }
}

async function fetchJson(url, options, timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const raw = await response.text();
    let body;
    try {
      body = JSON.parse(raw);
    } catch {
      body = null;
    }
    if (!response.ok) {
      const apiMessage =
        body?.error?.message || body?.error?.error?.message || body?.message;
      const error = new Error(
        `${response.status} ${response.statusText}${apiMessage ? `: ${apiMessage}` : ""}`,
      );
      error.status = response.status;
      throw error;
    }
    if (!body) throw new Error("Provider returned a non-JSON response");
    return body;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error(`OpenCode request timed out after ${timeoutMs} ms`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function credentialFor(provider) {
  const credentials = await readCredentials();
  const key = credentials?.[PROVIDERS[provider].authKey]?.key;
  if (typeof key !== "string" || key.length === 0) {
    throw new Error(`OpenCode ${provider} credential is unavailable`);
  }
  return key;
}

async function listProviderModels(provider, search) {
  const config = PROVIDERS[provider];
  const key = await credentialFor(provider);
  const payload = await fetchJson(
    `${config.baseUrl}/models`,
    { headers: { ...CLIENT_HEADERS, Authorization: `Bearer ${key}` } },
    30_000,
  );
  const needle = typeof search === "string" ? search.toLowerCase() : "";
  return (Array.isArray(payload.data) ? payload.data : [])
    .map((entry) => entry?.id)
    .filter((id) => typeof id === "string" && (!needle || id.toLowerCase().includes(needle)))
    .map((id) => `${config.prefix}/${id}`)
    .sort();
}

function extractOutputText(payload) {
  if (typeof payload.output_text === "string" && payload.output_text.length > 0) {
    return payload.output_text;
  }
  const pieces = [];
  for (const item of Array.isArray(payload.output) ? payload.output : []) {
    for (const content of Array.isArray(item?.content) ? item.content : []) {
      if (
        (content?.type === "output_text" || content?.type === "text") &&
        typeof content.text === "string"
      ) {
        pieces.push(content.text);
      }
    }
  }
  return pieces.join("\n").trim();
}

function extractChatOutputText(payload) {
  const content = payload?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (!Array.isArray(content)) return "";
  return content
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .filter(Boolean)
    .join("\n")
    .trim();
}

function shouldTryChatFallback(error) {
  return (
    error?.code === "NO_ASSISTANT_TEXT" ||
    error?.status === 404 ||
    error?.status === 405 ||
    (Number.isInteger(error?.status) && error.status >= 500)
  );
}

function outputTokenLimit(value, minimum = 32) {
  const requested = Number.isInteger(value) ? value : 2_048;
  return Math.min(16_384, Math.max(minimum, requested));
}

async function askOne(args) {
  const { model, provider } = resolveModel(args.model, args.provider || "go");
  assertText(args.prompt, "prompt", MAX_PROMPT_CHARS);
  if (args.system !== undefined) assertText(args.system, "system", MAX_SYSTEM_CHARS);

  const config = PROVIDERS[provider];
  const key = await credentialFor(provider);
  const request = {
    model,
    input: args.prompt,
    stream: false,
    max_output_tokens: outputTokenLimit(args.max_output_tokens),
  };
  if (args.system) request.instructions = args.system;
  if (args.reasoning_effort) {
    request.reasoning = { effort: args.reasoning_effort };
  }

  const timeoutMs = args.timeout_ms ?? DEFAULT_TIMEOUT_MS;
  let payload;
  let text;
  let api = "responses";
  let responsesError;

  try {
    payload = await fetchJson(
      `${config.baseUrl}/responses`,
      {
        method: "POST",
        headers: {
          ...CLIENT_HEADERS,
          Authorization: `Bearer ${key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      },
      timeoutMs,
    );
    text = extractOutputText(payload);
    if (!text) {
      const error = new Error("OpenCode response did not contain assistant text");
      error.code = "NO_ASSISTANT_TEXT";
      throw error;
    }
  } catch (error) {
    if (!shouldTryChatFallback(error)) throw error;
    responsesError = error;
    api = "chat_completions";

    const messages = [];
    if (args.system) messages.push({ role: "system", content: args.system });
    messages.push({ role: "user", content: args.prompt });
    const chatRequest = {
      model,
      messages,
      stream: false,
      // Reasoning models can consume small limits before emitting visible text.
      max_tokens: outputTokenLimit(args.max_output_tokens, 256),
    };
    if (args.reasoning_effort) {
      chatRequest.reasoning_effort =
        args.reasoning_effort === "minimal" ? "low" : args.reasoning_effort;
    }

    try {
      payload = await fetchJson(
        `${config.baseUrl}/chat/completions`,
        {
          method: "POST",
          headers: {
            ...CLIENT_HEADERS,
            Authorization: `Bearer ${key}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(chatRequest),
        },
        timeoutMs,
      );
      text = extractChatOutputText(payload);
      if (!text) throw new Error("Chat fallback did not contain assistant text");
    } catch (chatError) {
      throw new Error(
        `Responses API failed (${responsesError.message}); Chat Completions fallback failed (${chatError.message})`,
      );
    }
  }

  return {
    provider,
    model,
    label: `${config.prefix}/${model}`,
    text,
    api,
    usage: payload.usage || null,
    responseId: payload.id || null,
  };
}

function textResult(text, structuredContent) {
  return {
    content: [{ type: "text", text }],
    ...(structuredContent ? { structuredContent } : {}),
  };
}

async function callTool(name, args = {}) {
  if (name === "list_models") {
    const provider = args.provider || "all";
    const selected = provider === "all" ? ["zen", "go"] : [normalizeProvider(provider)];
    const settled = await Promise.allSettled(
      selected.map(async (item) => [item, await listProviderModels(item, args.search)]),
    );
    const catalogs = {};
    const errors = {};
    for (let index = 0; index < settled.length; index += 1) {
      const providerName = selected[index];
      const result = settled[index];
      if (result.status === "fulfilled") catalogs[providerName] = result.value[1];
      else errors[providerName] = result.reason?.message || String(result.reason);
    }
    const lines = [];
    for (const providerName of selected) {
      if (catalogs[providerName]) {
        lines.push(`## ${providerName === "go" ? "OpenCode Go" : "OpenCode Zen"}`);
        lines.push(...catalogs[providerName].map((model) => `- ${model}`));
      } else {
        lines.push(`## ${providerName}\nUnavailable: ${errors[providerName]}`);
      }
    }
    return textResult(lines.join("\n"), { catalogs, errors });
  }

  if (name === "ask_model") {
    const result = await askOne(args);
    const usage = result.usage ? `\n\nUsage: ${JSON.stringify(result.usage)}` : "";
    return textResult(`## ${result.label}\n\n${result.text}${usage}`, result);
  }

  if (name === "compare_models") {
    if (!Array.isArray(args.models) || args.models.length < 2 || args.models.length > MAX_COMPARISON_MODELS) {
      throw new Error(`models must contain 2 to ${MAX_COMPARISON_MODELS} unique model ids`);
    }
    if (new Set(args.models).size !== args.models.length) {
      throw new Error("models must not contain duplicates");
    }
    const settled = await Promise.allSettled(
      args.models.map((model) => askOne({ ...args, model, models: undefined })),
    );
    const results = settled.map((entry, index) =>
      entry.status === "fulfilled"
        ? entry.value
        : { label: args.models[index], error: entry.reason?.message || String(entry.reason) },
    );
    const text = results
      .map((result) =>
        result.error
          ? `## ${result.label}\n\nError: ${result.error}`
          : `## ${result.label}\n\n${result.text}`,
      )
      .join("\n\n---\n\n");
    return textResult(text, { results });
  }

  throw new Error(`Unknown tool: ${name}`);
}

function writeMessage(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

async function handleMessage(message) {
  if (!message || message.jsonrpc !== "2.0") return;
  if (message.id === undefined) return;

  try {
    let result;
    if (message.method === "initialize") {
      result = {
        protocolVersion: message.params?.protocolVersion || "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: SERVER_NAME, version: SERVER_VERSION },
        instructions:
          "Use OpenCode models as read-only consultants. Send bounded context and verify their material claims before changing code or Pulse artifacts.",
      };
    } else if (message.method === "ping") {
      result = {};
    } else if (message.method === "tools/list") {
      result = { tools };
    } else if (message.method === "tools/call") {
      result = await callTool(message.params?.name, message.params?.arguments || {});
    } else {
      writeMessage({
        jsonrpc: "2.0",
        id: message.id,
        error: { code: -32601, message: `Method not found: ${message.method}` },
      });
      return;
    }
    writeMessage({ jsonrpc: "2.0", id: message.id, result });
  } catch (error) {
    writeMessage({
      jsonrpc: "2.0",
      id: message.id,
      result: {
        content: [{ type: "text", text: `OpenCode delegation failed: ${error.message}` }],
        isError: true,
      },
    });
  }
}

let buffered = "";
let queue = Promise.resolve();

process.stdin.setEncoding("utf8");
process.stdin.on("data", (chunk) => {
  buffered += chunk;
  while (true) {
    const newline = buffered.indexOf("\n");
    if (newline < 0) break;
    const line = buffered.slice(0, newline).replace(/\r$/, "");
    buffered = buffered.slice(newline + 1);
    if (!line.trim()) continue;
    queue = queue.then(async () => {
      try {
        await handleMessage(JSON.parse(line));
      } catch (error) {
        process.stderr.write(`Invalid MCP message: ${error.message}\n`);
      }
    });
  }
});

process.stdin.on("end", async () => {
  if (buffered.trim()) {
    queue = queue.then(() => handleMessage(JSON.parse(buffered)));
  }
  await queue;
});
