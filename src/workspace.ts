import fs from 'node:fs/promises';
import { WorkspaceOptions, WorkspaceTool } from './types.js';
import { PathGuard } from './utils/path-guard.js';
import { createFsTools } from './tools/fs.js';
import { createShellTools } from './tools/shell.js';
import { createNetworkTools } from './tools/network.js';
import { createSystemTools } from './tools/system.js';
import { createEditorTools } from './tools/editor.js';

export class Workspace {
  private guard: PathGuard;
  private options: WorkspaceOptions;
  private envVars: Record<string, string> = {}; // Persistent Shell State
  
  public readonly tools: WorkspaceTool[];

  constructor(options: WorkspaceOptions) {
    this.options = options;
    this.guard = new PathGuard(options.rootDir);
    
    // Initialize default env vars
    this.envVars = {
      PATH: process.env.PATH || '',
      ...process.env, // Inherit host env? Or keep clean? Usually safer to inherit PATH.
    };

    this.tools = [
      ...createFsTools(this.guard),
      ...createShellTools(this.guard, this.envVars, options.shellTimeoutMs), // Pass env ref
      ...createNetworkTools(options.allowedDomains),
      ...createSystemTools(),
      ...createEditorTools(this.guard),
    ];
  }

  async init(): Promise<void> {
    await fs.mkdir(this.options.rootDir, { recursive: true });
  }

  async destroy(): Promise<void> {
    try {
      await fs.rm(this.options.rootDir, { recursive: true, force: true });
    } catch (error) {
      // Ignore
    }
  }

  get rootPath(): string {
    return this.guard.getRoot();
  }
}