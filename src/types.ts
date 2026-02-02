import { z } from 'zod';

/**
 * Configuration options for creating a Workspace.
 */
export interface WorkspaceOptions {
  /** * The absolute or relative path to the root directory of the workspace. 
   * This directory will be created if it does not exist.
   */
  rootDir: string;
  
  /** * Maximum execution time for shell commands in milliseconds. 
   * Default: 10000ms (10 seconds) 
   */
  shellTimeoutMs?: number;

  /**
   * If provided, limits http_request to these specific hostnames.
   * If undefined (default), all hosts are allowed.
   */
  allowedDomains?: string[];
}

/**
 * Represents a tool executable by an agent.
 */
export interface WorkspaceTool<TInput = any, TOutput = any> {
  /** The unique name of the tool (e.g., 'read_file'). */
  name: string;
  
  /** A human/LLM-readable description of what the tool does. */
  description: string;
  
  /** The Zod schema validating the input arguments. */
  schema: z.ZodSchema<TInput>;
  
  /** The implementation of the tool. */
  execute: (input: TInput) => Promise<TOutput>;
}

/**
 * Standardized output for shell commands.
 */
export interface ShellOutput {
  stdout: string;
  stderr: string;
  exitCode: number | null;
  error?: string;
}

/**
 * Standardized output for file stats.
 */
export interface FileStat {
  size: number;
  created: string;
  modified: string;
  isDirectory: boolean;
  isFile: boolean;
}