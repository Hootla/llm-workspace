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

## Provider Examples

The following examples demonstrate how to create an autonomous agent loop using the library.

### 1. OpenAI (GPT-4)

This example uses the `openai` SDK. It automatically enables "Strict Mode" (Structured Outputs) for reliable tool usage.

```typescript
import OpenAI from "openai";
import { Workspace, adapters } from "@hootla/llm-workspace";

const workspace = new Workspace({ rootDir: "./playground" });
const client = new OpenAI();

async function main() {
  await workspace.init();
  
  const messages = [
    { role: "system", content: "You are an autonomous developer." },
    { role: "user", content: "Create a hello world file and run it." }
  ];

  while (true) {
    const completion = await client.chat.completions.create({
      model: "gpt-4-turbo",
      messages: messages,
      tools: adapters.toOpenAITools(workspace.tools),
      tool_choice: "auto",
    });

    const message = completion.choices[0].message;
    messages.push(message);

    if (!message.tool_calls || message.tool_calls.length === 0) {
      console.log("Agent:", message.content);
      break;
    }

    // Execute all tool calls
    for (const toolCall of message.tool_calls) {
      const toolName = toolCall.function.name;
      const args = JSON.parse(toolCall.function.arguments);
      
      console.log(`Executing ${toolName}...`);
      
      let result;
      try {
        const tool = workspace.tools.find(t => t.name === toolName);
        if (!tool) throw new Error(`Tool ${toolName} not found`);
        result = await tool.execute(args);
      } catch (error) {
        result = `Error: ${error.message}`;
      }

      messages.push({
        role: "tool",
        tool_call_id: toolCall.id,
        content: String(result)
      });
    }
  }
}

main().catch(console.error);
```

### 2. Anthropic (Claude 3.5 Sonnet)

This example uses the `@anthropic-ai/sdk` and the standard Tool Use loop.

```typescript
import Anthropic from "@anthropic-ai/sdk";
import { Workspace, adapters } from "@hootla/llm-workspace";

const workspace = new Workspace({ rootDir: "./playground" });
const anthropic = new Anthropic();

async function main() {
  await workspace.init();
  
  let messages = [
    { role: "user", content: "Check the system time and list files in the root." }
  ];

  while (true) {
    const msg = await anthropic.messages.create({
      model: "claude-3-5-sonnet-20240620",
      max_tokens: 1024,
      messages: messages,
      tools: adapters.toAnthropicTools(workspace.tools),
    });

    // Add assistant response to history
    messages.push({ role: "assistant", content: msg.content });

    if (msg.stop_reason !== "tool_use") {
      console.log("Agent:", msg.content[0].text);
      break;
    }

    // Process tool calls
    const toolResults = [];
    for (const block of msg.content) {
      if (block.type === "tool_use") {
        console.log(`Executing ${block.name}...`);
        
        let result;
        try {
          const tool = workspace.tools.find(t => t.name === block.name);
          if (!tool) throw new Error(`Tool ${block.name} not found`);
          result = await tool.execute(block.input);
        } catch (error) {
          result = `Error: ${error.message}`;
        }

        toolResults.push({
          type: "tool_result",
          tool_use_id: block.id,
          content: String(result)
        });
      }
    }

    // Send results back
    messages.push({ role: "user", content: toolResults });
  }
}

main().catch(console.error);
```

### 3. Google Gemini

This example uses `@google/generative-ai` SDK. 
*Note: Gemini's function calling requires sending the function response back as a specific 'functionResponse' part.*

```typescript
import { GoogleGenerativeAI } from "@google/generative-ai";
import { Workspace, adapters } from "@hootla/llm-workspace";

const workspace = new Workspace({ rootDir: "./playground" });
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const model = genAI.getGenerativeModel({
  model: "gemini-1.5-pro",
  tools: [{ functionDeclarations: adapters.toGeminiTools(workspace.tools) }]
});

async function main() {
  await workspace.init();

  const chat = model.startChat();
  
  // Initial Prompt
  let result = await chat.sendMessage("Write a Python script to calculate Fibonacci numbers and save it.");

  // Interaction Loop
  while (true) {
    const response = result.response;
    const calls = response.functionCalls();

    // If no function calls, we have the final text response
    if (!calls || calls.length === 0) {
      console.log("Agent:", response.text());
      break;
    }

    // Execute all requested tools
    const toolParts = [];
    for (const call of calls) {
      console.log(`Executing ${call.name}...`);
      
      let output;
      try {
        const tool = workspace.tools.find(t => t.name === call.name);
        if (!tool) throw new Error(`Tool ${call.name} not found`);
        
        // Execute logic
        output = await tool.execute(call.args);
      } catch (error) {
        output = `Error: ${error.message}`;
      }

      // Format response for Gemini
      toolParts.push({
        functionResponse: {
          name: call.name,
          response: { output: output } // Gemini expects an object here
        }
      });
    }

    // Send tool outputs back to the model to continue the conversation
    result = await chat.sendMessage(toolParts);
  }
}

main().catch(console.error);
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

## License

MIT
