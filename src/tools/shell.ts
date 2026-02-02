import { z } from 'zod';
import { execa } from 'execa';
import { PathGuard } from '../utils/path-guard.js';
import { WorkspaceTool, ShellOutput } from '../types.js';

export const createShellTools = (
  guard: PathGuard, 
  envVars: Record<string, string>, // Reference to mutable env state
  timeoutMs: number = 10000
): WorkspaceTool[] => [
  {
    name: 'run_shell_cmd',
    description: 'Execute a shell command. CWD is always workspace root.',
    schema: z.object({
      command: z.string().describe('The command to run'),
      args: z.array(z.string()).default([]),
    }),
    execute: async ({ command, args }): Promise<ShellOutput> => {
      try {
        const { stdout, stderr, exitCode } = await execa(command, args, {
          cwd: guard.getRoot(),
          timeout: timeoutMs,
          reject: false,
          all: true,
          env: envVars, // Inject the persistent env vars
        });

        return { stdout, stderr, exitCode: exitCode ?? null };
      } catch (error: any) {
        return {
          error: error.message || 'Unknown execution error',
          stdout: '',
          stderr: '',
          exitCode: -1
        };
      }
    },
  },
  {
    name: 'set_env_var',
    description: 'Set an environment variable for future shell commands.',
    schema: z.object({
      key: z.string().describe('The environment variable name (e.g. API_KEY)'),
      value: z.string().describe('The value'),
    }),
    execute: async ({ key, value }) => {
      envVars[key] = value;
      return `Environment variable ${key} set.`;
    },
  }
];