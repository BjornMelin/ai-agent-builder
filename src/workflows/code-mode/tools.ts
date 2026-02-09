import type { JSONSchema7 } from "@ai-sdk/provider";
import { jsonSchema, type ToolSet, tool } from "ai";

import {
  sandboxCatStep,
  sandboxExecStep,
  sandboxFindStep,
  sandboxLsStep,
  sandboxRgStep,
} from "@/workflows/code-mode/steps/sandbox-tools.step";

type SandboxExecToolInput = Readonly<{
  cmd: string;
  args?: readonly string[] | undefined;
  cwd?: string | undefined;
  timeoutMs?: number | undefined;
}>;

const sandboxExecTool = tool({
  description:
    "Execute an allowlisted command inside the Vercel Sandbox workspace. Prefer dedicated tools (ls/cat/rg/find) when possible.",
  execute: sandboxExecStep,
  inputSchema: jsonSchema<SandboxExecToolInput>({
    additionalProperties: false,
    properties: {
      args: {
        items: { minLength: 1, type: "string" },
        maxItems: 64,
        type: "array",
      },
      cmd: { minLength: 1, type: "string" },
      cwd: { minLength: 1, type: "string" },
      timeoutMs: { maximum: 120000, minimum: 1, type: "integer" },
    },
    required: ["cmd"],
    type: "object",
  } satisfies JSONSchema7),
});

type SandboxLsToolInput = Readonly<{ path?: string | undefined }>;
const sandboxLsTool = tool({
  description: "List directory contents inside the sandbox workspace.",
  execute: sandboxLsStep,
  inputSchema: jsonSchema<SandboxLsToolInput>({
    additionalProperties: false,
    properties: {
      path: { minLength: 1, type: "string" },
    },
    type: "object",
  } satisfies JSONSchema7),
});

type SandboxCatToolInput = Readonly<{ path: string }>;
const sandboxCatTool = tool({
  description:
    "Read a file inside the sandbox workspace (redacted + bounded output).",
  execute: sandboxCatStep,
  inputSchema: jsonSchema<SandboxCatToolInput>({
    additionalProperties: false,
    properties: {
      path: { minLength: 1, type: "string" },
    },
    required: ["path"],
    type: "object",
  } satisfies JSONSchema7),
});

type SandboxRgToolInput = Readonly<{
  pattern: string;
  path?: string | undefined;
}>;
const sandboxRgTool = tool({
  description:
    "Search for a pattern using ripgrep inside the sandbox workspace.",
  execute: sandboxRgStep,
  inputSchema: jsonSchema<SandboxRgToolInput>({
    additionalProperties: false,
    properties: {
      path: { minLength: 1, type: "string" },
      pattern: { minLength: 1, type: "string" },
    },
    required: ["pattern"],
    type: "object",
  } satisfies JSONSchema7),
});

type SandboxFindToolInput = Readonly<{
  path?: string | undefined;
  name?: string | undefined;
  maxDepth?: number | undefined;
}>;
const sandboxFindTool = tool({
  description:
    "Find files by name within the sandbox workspace (bounded depth).",
  execute: sandboxFindStep,
  inputSchema: jsonSchema<SandboxFindToolInput>({
    additionalProperties: false,
    properties: {
      maxDepth: { maximum: 8, minimum: 1, type: "integer" },
      name: { minLength: 1, type: "string" },
      path: { minLength: 1, type: "string" },
    },
    type: "object",
  } satisfies JSONSchema7),
});

/**
 * Code Mode toolset (Vercel Sandbox exploration + execution).
 */
export const codeModeTools: ToolSet = {
  sandbox_cat: sandboxCatTool,
  sandbox_exec: sandboxExecTool,
  sandbox_find: sandboxFindTool,
  sandbox_ls: sandboxLsTool,
  sandbox_rg: sandboxRgTool,
};
