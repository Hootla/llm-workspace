import fs from 'node:fs/promises';
import { z } from 'zod';
import { PathGuard } from '../utils/path-guard.js';
import { WorkspaceTool, FileStat } from '../types.js';
import { isBinaryFile } from '../utils/binary.js';

export const createFsTools = (guard: PathGuard): WorkspaceTool[] => [
  {
    name: 'read_file',
    description: 'Read the contents of a file as a utf-8 string. Fails on binary files.',
    schema: z.object({
      path: z.string().describe('Relative path to the file to read'),
    }),
    execute: async ({ path }) => {
      const safePath = guard.validatePath(path);
      
      if (await isBinaryFile(safePath)) {
        throw new Error(`Operation Blocked: '${path}' appears to be a binary file. Reading it as text will corrupt data.`);
      }

      try {
        return await fs.readFile(safePath, 'utf-8');
      } catch (error: any) {
        if (error.code === 'ENOENT') {
          throw new Error(`File not found: ${path}`);
        }
        throw new Error(`Failed to read file '${path}': ${error.message}`);
      }
    },
  },
  // ... (Keep write_file, append_file, delete_file, list_files, stat_file as previously defined)
  // They are already robust.
  {
    name: 'write_file',
    description: 'Create or overwrite a file with the given content. Creates directories if needed.',
    schema: z.object({
      path: z.string().describe('Relative path to the file'),
      content: z.string().describe('The string content to write'),
    }),
    execute: async ({ path, content }) => {
      const safePath = guard.validatePath(path);
      try {
        await guard.ensureDirForFile(safePath);
        await fs.writeFile(safePath, content, 'utf-8');
        return `Successfully wrote to ${path}`;
      } catch (error: any) {
        throw new Error(`Failed to write file '${path}': ${error.message}`);
      }
    },
  },
  {
    name: 'append_file',
    description: 'Append content to an existing file.',
    schema: z.object({
      path: z.string().describe('Relative path to the file'),
      content: z.string().describe('The content to append'),
    }),
    execute: async ({ path, content }) => {
      const safePath = guard.validatePath(path);
      if (await isBinaryFile(safePath)) {
         throw new Error(`Operation Blocked: Cannot append text to binary file '${path}'.`);
      }
      try {
        await guard.ensureDirForFile(safePath);
        await fs.appendFile(safePath, content, 'utf-8');
        return `Successfully appended to ${path}`;
      } catch (error: any) {
        throw new Error(`Failed to append to file '${path}': ${error.message}`);
      }
    },
  },
  {
    name: 'delete_file',
    description: 'Delete a file.',
    schema: z.object({
      path: z.string().describe('Relative path to the file'),
    }),
    execute: async ({ path }) => {
      const safePath = guard.validatePath(path);
      try {
        await fs.unlink(safePath);
        return `Successfully deleted ${path}`;
      } catch (error: any) {
        if (error.code === 'ENOENT') return `File ${path} did not exist`;
        throw new Error(`Failed to delete file '${path}': ${error.message}`);
      }
    },
  },
  {
    name: 'list_files',
    description: 'List contents of a directory (non-recursive).',
    schema: z.object({
      path: z.string().default('.').describe('Relative path to directory'),
    }),
    execute: async ({ path }) => {
      const safePath = guard.validatePath(path);
      try {
        const items = await fs.readdir(safePath, { withFileTypes: true });
        return items.map(item => ({
          name: item.name,
          type: item.isDirectory() ? 'directory' : 'file',
        }));
      } catch (error: any) {
        throw new Error(`Failed to list directory '${path}': ${error.message}`);
      }
    },
  },
  {
    name: 'stat_file',
    description: 'Get metadata about a file or directory.',
    schema: z.object({
      path: z.string().describe('Relative path to the file or directory'),
    }),
    execute: async ({ path }): Promise<FileStat> => {
      const safePath = guard.validatePath(path);
      try {
        const stats = await fs.stat(safePath);
        return {
          size: stats.size,
          created: stats.birthtime.toISOString(),
          modified: stats.mtime.toISOString(),
          isDirectory: stats.isDirectory(),
          isFile: stats.isFile(),
        };
      } catch (error: any) {
        throw new Error(`Failed to stat '${path}': ${error.message}`);
      }
    },
  },
];