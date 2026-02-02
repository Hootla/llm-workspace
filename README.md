# @hootla/llm-workspace

A persistent, isolated execution environment for LLM-driven agents.

## Overview

llm-workspace is a Node.js library that provides a real, stateful workspace for agents. It solves the "dangling state" problem where agents are forced to operate using stateless function calls. Instead, llm-workspace treats the agent's environment as a first-class citizen with a lifecycle, a filesystem, and a shell.

**Core Features:**

* **Isolation:** Execution is strictly sandboxed to a specific directory. Path traversal attacks are blocked.
* **Persistence:** Files, git repositories, and build artifacts persist across agent steps.
* **Stateful Shell:** Environment variables (like `API_KEY`) persist between shell commands.
* **Standard Toolset:** Provides a deterministic set of tools for file manipulation, surgical code editing, and system inspection.
* **Provider Adapters:** Built-in adapters for OpenAI, Anthropic, and Gemini.

## Installation

```bash
npm install @hootla/llm-workspace
```

## Quick Start

This example creates a secure workspace, initializes it, and manually executes a tool.

```typescript
import { Workspace } from "@hootla/llm-workspace";

// 1. Create the workspace instance
const workspace = new Workspace({
  rootDir: "./agent-playground", // The sandbox root
  allowedDomains: ["google.com", "api.github.com"], // Network whitelist
});

async function run() {
  // 2. Initialize (creates the directory)
  await workspace.init();

  // 3. Execute tools
  try {
    // Write a file
    const writeResult = await workspace.tools.find(t => t.name === "write_file")
      .execute({ path: "hello.py", content: "print('Hello World')" });
    console.log(writeResult);

    // Run it
    const execResult = await workspace.tools.find(t => t.name === "run_shell_cmd")
      .execute({ command: "python3", args: ["hello.py"] });
    
    console.log(execResult.stdout);
  } catch (err) {
    console.error(err);
  } finally {
    // 4. Cleanup (optional)
    await workspace.destroy();
  }
}

run();
```

## Provider Integration

The library includes built-in adapters that convert the workspace tools into the exact format expected by major LLM providers. These adapters also handle "Strict Mode" (Structured Outputs) automatically where supported.

### OpenAI

Uses `adapters.toOpenAITools`. Enables Strict Mode by default.

```typescript
import OpenAI from "openai";
import { Workspace, adapters } from "@hootla/llm-workspace";

const workspace = new Workspace({ rootDir: "./playground" });
const client = new OpenAI();

async function main() {
  const completion = await client.chat.completions.create({
    model: "gpt-4-turbo",
    messages: [{ role: "user", content: "List files in the current directory." }],
    // Automatically converts to OpenAI function format with strict: true
    tools: adapters.toOpenAITools(workspace.tools),
  });

  // Handle tool calls as normal...
}
```

### Anthropic

Uses `adapters.toAnthropicTools`.

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { Workspace, adapters } from "@hootla/llm-workspace";

const workspace = new Workspace({ rootDir: "./playground" });
const anthropic = new Anthropic();

async function main() {
  const msg = await anthropic.messages.create({
    model: "claude-3-opus-20240229",
    max_tokens: 1024,
    messages: [{ role: "user", content: "Check the system time." }],
    // Converts to Anthropic tool format
    tools: adapters.toAnthropicTools(workspace.tools),
  });
}
```

### Google Gemini

Uses `adapters.toGeminiTools`.

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Workspace, adapters } from "@hootla/llm-workspace";

const workspace = new Workspace({ rootDir: "./playground" });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro",
  // Converts to Gemini function declarations
  tools: [{ functionDeclarations: adapters.toGeminiTools(workspace.tools) }]
});
```

## Tool Reference

The workspace comes pre-loaded with the following tools. All tools are sandboxed to the `rootDir`.

### File System
| Tool | Description |
| :--- | :--- |
| `read_file` | Read a file as UTF-8 text. Fails on binary files. |
| `write_file` | Create or overwrite a file. Creates parent directories automatically. |
| `append_file` | Append text to an existing file. |
| `delete_file` | Delete a file. |
| `list_files` | List files and directories in a path (non-recursive). |
| `stat_file` | Get metadata (size, created/modified times). |

### Editor (Coding)
| Tool | Description |
| :--- | :--- |
| `replace_in_file` | Surgically replace a string in a file. Handles line-ending differences (CRLF/LF). |
| `search_files` | Recursive grep-style search. Ignores `node_modules` and binary files. |

### Shell
| Tool | Description |
| :--- | :--- |
| `run_shell_cmd` | Execute a shell command. CWD is always the workspace root. |
| `set_env_var` | Set an environment variable (e.g., `API_KEY`) that persists for future commands. |

### Network
| Tool | Description |
| :--- | :--- |
| `http_request` | specific URL. Subject to `allowedDomains` whitelist. |
| `ping_host` | Check if a host is reachable. |
| `get_my_ip` | Get the public IP and approximate location of the agent. |

### System
| Tool | Description |
| :--- | :--- |
| `get_current_time` | Get ISO timestamp and local time. |
| `get_system_info` | Get OS platform, architecture, and memory stats. |

## Configuration

### WorkspaceOptions

```typescript
interface WorkspaceOptions {
  // Absolute or relative path to the workspace root.
  rootDir: string;
  
  // Max execution time for shell commands in ms. Default: 10000.
  shellTimeoutMs?: number;

  // Whitelist of domains for http_request. If undefined, all allowed.
  allowedDomains?: string[];
}
```

## Security & Isolation

**1. Path Traversal Protection**
The `PathGuard` class intercepts every file system request. It resolves paths against the `rootDir` and throws an error if the resulting path is outside the sandbox.
* `read_file("../../etc/passwd")` -> **Error**
* `write_file("/usr/bin/malware")` -> **Error**

**2. Binary File Protection**
Tools like `read_file` and `replace_in_file` automatically detect binary files (by checking for null bytes) and refuse to process them. This prevents agents from corrupting images or compiled binaries by treating them as text strings.

**3. Shell Scope**
All shell commands are executed with the `cwd` set to `rootDir`. While this does not prevent an agent from running `cd .. && ls`, the immediate execution context is rooted. For stricter shell isolation, consider running the Node process inside a container.

## Error Handling

* **Tool Errors:** If a tool fails (e.g., file not found), it throws a standard JavaScript `Error`. The message is designed to be readable by an LLM so it can self-correct.
* **Shell Errors:** `run_shell_cmd` does *not* throw on non-zero exit codes. It returns the `exitCode` and `stderr` so the agent can debug the failure (e.g., a compilation error).

## License

MIT
