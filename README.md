# @hootla/llm-workspace

llm-workspace is a Node.js library that provides a persistent, isolated execution environment for LLM-driven agents.

It addresses the core limitation of most agent frameworks: the lack of a real "place" to work. While many frameworks treat tools as stateless function calls, llm-workspace treats the environment as a first-class citizen with its own filesystem, shell state, and lifecycle.

This library is not an agent framework. It is the infrastructure layer that sits beneath your agent, giving it a computer to operate.

## Key Features

* **Persistent Filesystem:** Files written in step 1 are available in step 10.
* **Sandboxed Execution:** Strict path validation prevents agents from accessing files outside the workspace root.
* **Stateful Shell:** Environment variables and working directories function as expected across multiple commands.
* **Production-Ready Tools:** Includes surgical text editing, binary file guards, and recursive search limitations to prevent agent crashes.
* **Model Agnostic:** Works with OpenAI, Anthropic, or local models. It provides the tools; you provide the reasoning.

## Installation

```bash
npm install @hootla/llm-workspace
```

## Quick Start

```typescript
import { Workspace } from '@hootla/llm-workspace';

// 1. Create a workspace rooted in a specific directory
const workspace = new Workspace({
  rootDir: './agent-scratchpad',
  allowedDomains: ['api.github.com', 'google.com'] // Optional network allowlist
});

await workspace.init();

// 2. Execute a tool (e.g., writing a Python script)
const writeResult = await workspace.tools.find(t => t.name === 'write_file').execute({
  path: 'main.py',
  content: 'print("Hello from the workspace")'
});

console.log(writeResult); // "Successfully wrote to main.py"

// 3. Run the script using the shell tool
const shellResult = await workspace.tools.find(t => t.name === 'run_shell_cmd').execute({
  command: 'python3',
  args: ['main.py']
});

console.log(shellResult.stdout); // "Hello from the workspace"
```

## Tool Reference

The workspace comes pre-loaded with a standardized set of tools designed for autonomous construction and debugging.

### File System
* **read_file(path):** Read text content. Blocks binary files to prevent errors.
* **write_file(path, content):** Create or overwrite files.
* **append_file(path, content):** Append text to existing files.
* **delete_file(path):** Remove a file.
* **list_files(path):** List directory contents (non-recursive).
* **stat_file(path):** Get size, creation time, and type metadata.

### Editor (Coding)
* **replace_in_file(path, old, new):** Surgical string replacement. Handles line-ending normalization automatically.
* **search_files(path, term):** Recursive text search. Ignores `node_modules` and `.git`.

### Shell
* **run_shell_cmd(command, args):** Execute commands rooted in the workspace.
* **set_env_var(key, value):** Set persistent environment variables (e.g., API_KEY).

### Network
* **http_request(url, method, ...):** Fetch external resources. Respects the `allowedDomains` configuration.
* **ping_host(target):** Check connectivity to a remote host.
* **get_my_ip():** Retrieve public IP and location context.

### System
* **get_current_time():** precise date, time, and timezone information.
* **get_system_info():** Details on OS architecture, memory, and Node version.

## Security & Isolation

The library employs a **PathGuard** system. All file operations are resolved relative to the workspace root.

* Attempts to access `../` or absolute paths outside the root will throw a security violation.
* Shell commands are executed with the CWD set to the workspace root.
* Network requests can be restricted to specific domains via configuration.

## API Reference

### Workspace

**Constructor**
`new Workspace(options: WorkspaceOptions)`

* `rootDir` (string): The path on the host machine where the workspace lives.
* `shellTimeoutMs` (number): Max execution time for shell commands (default: 10000ms).
* `allowedDomains` (string[]): Whitelist for HTTP requests.

**Methods**
* `init()`: Creates the workspace directory.
* `destroy()`: Recursively removes the workspace directory and all contents.

## License

MIT