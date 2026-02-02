import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { PathGuard } from '../utils/path-guard.js';
import { WorkspaceTool } from '../types.js';
import { isBinaryFile } from '../utils/binary.js';

export const createEditorTools = (guard: PathGuard): WorkspaceTool[] => [
  {
    name: 'replace_in_file',
    description: 'Replace a single instance of a string in a file. Smart handles line endings.',
    schema: z.object({
      path: z.string().describe('Relative path to the file'),
      old_content: z.string().describe('The exact string segment to replace'),
      new_content: z.string().describe('The new string segment'),
    }),
    execute: async ({ path: filePath, old_content, new_content }) => {
      const safePath = guard.validatePath(filePath);

      // 1. Guard against binary files
      if (await isBinaryFile(safePath)) {
        throw new Error(`Cannot edit binary file '${filePath}'`);
      }
      
      let content: string;
      try {
        content = await fs.readFile(safePath, 'utf-8');
      } catch (error: any) {
        throw new Error(`Failed to read file '${filePath}': ${error.message}`);
      }

      // 2. Normalize Line Endings for Comparison
      // We detect the file's dominant line ending style to preserve it later
      const isCRLF = content.includes('\r\n');
      const fileNormalized = content.replace(/\r\n/g, '\n');
      const searchNormalized = old_content.replace(/\r\n/g, '\n');

      // 3. Search in normalized space
      const firstIndex = fileNormalized.indexOf(searchNormalized);
      if (firstIndex === -1) {
        throw new Error(`Target string not found in '${filePath}'. Ensure exact matching (whitespace matters).`);
      }

      const lastIndex = fileNormalized.lastIndexOf(searchNormalized);
      if (firstIndex !== lastIndex) {
        throw new Error(`Ambiguous match: The target string appears multiple times in '${filePath}'. Provide more context.`);
      }

      // 4. Perform replacement (using normalized content temporarily)
      const newContentNormalized = new_content.replace(/\r\n/g, '\n');
      const updatedNormalized = fileNormalized.replace(searchNormalized, newContentNormalized);

      // 5. Restore Line Endings
      const finalContent = isCRLF 
        ? updatedNormalized.replace(/\n/g, '\r\n') 
        : updatedNormalized;

      await fs.writeFile(safePath, finalContent, 'utf-8');
      
      return `Successfully replaced content in ${filePath}`;
    },
  },
  {
    name: 'search_files',
    description: 'Recursive text search. Ignores binary files and node_modules.',
    schema: z.object({
      path: z.string().default('.').describe('The directory to search in'),
      term: z.string().describe('The string or regex pattern to search for'),
      case_insensitive: z.boolean().default(true).describe('Ignore case'),
    }),
    execute: async ({ path: dirPath, term, case_insensitive }) => {
      const safeDir = guard.validatePath(dirPath);
      const results: Array<{ file: string; line: number; content: string }> = [];
      const MAX_RESULTS = 50;
      
      // Standard ignore list to prevent freezing the agent
      const IGNORED_DIRS = new Set(['node_modules', '.git', 'dist', 'coverage', 'build', '.DS_Store']);

      async function walk(currentDir: string) {
        if (results.length >= MAX_RESULTS) return;

        const entries = await fs.readdir(currentDir, { withFileTypes: true });
        
        for (const entry of entries) {
          if (results.length >= MAX_RESULTS) break;

          const fullPath = path.join(currentDir, entry.name);
          
          if (entry.isDirectory()) {
            if (!IGNORED_DIRS.has(entry.name)) {
              await walk(fullPath);
            }
          } else if (entry.isFile()) {
            // Skip likely binary files or huge logs
            if (await isBinaryFile(fullPath)) continue;

            try {
              const content = await fs.readFile(fullPath, 'utf-8');
              const lines = content.split(/\r?\n/);
              const regex = new RegExp(term, case_insensitive ? 'i' : '');
              
              lines.forEach((lineContent, index) => {
                if (results.length >= MAX_RESULTS) return;
                
                if (regex.test(lineContent)) {
                  // Make path relative to workspace root for cleaner output
                  const relativePath = path.relative(guard.getRoot(), fullPath);
                  results.push({
                    file: relativePath,
                    line: index + 1,
                    content: lineContent.trim().substring(0, 200) // Truncate long lines
                  });
                }
              });
            } catch (err) {
              // Ignore read errors
            }
          }
        }
      }

      await walk(safeDir);
      return results;
    },
  }
];