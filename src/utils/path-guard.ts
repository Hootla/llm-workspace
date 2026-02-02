import path from 'node:path';
import fs from 'node:fs/promises';

export class PathGuard {
  private readonly rootDir: string;

  constructor(rootDir: string) {
    // Resolve absolute path to ensure consistent comparison
    this.rootDir = path.resolve(rootDir);
  }

  /**
   * Returns the absolute root directory of the workspace.
   */
  getRoot(): string {
    return this.rootDir;
  }

  /**
   * Validates that a user-provided path resolves to inside the workspace.
   * Returns the safe, absolute path.
   * * Throws Error if path escapes the root.
   */
  validatePath(targetPath: string): string {
    // 1. Resolve the absolute path of the target relative to root
    const resolvedPath = path.resolve(this.rootDir, targetPath);

    // 2. Calculate relative path from root to resolved target
    const relative = path.relative(this.rootDir, resolvedPath);
    
    // 3. Check for security violations
    // - It must not start with '..' (outside root)
    // - It must not be an absolute path (on windows, relative might verify differently)
    // - We treat empty string as root (safe)
    const isSafe = relative === '' || 
                   (!relative.startsWith('..') && !path.isAbsolute(relative));

    if (!isSafe) {
      throw new Error(`Security Violation: Access denied to path '${targetPath}'. It resolves outside the workspace root.`);
    }

    return resolvedPath;
  }

  /**
   * Helper to ensure the directory for a file exists before writing.
   */
  async ensureDirForFile(filePath: string): Promise<void> {
    const dir = path.dirname(filePath);
    await fs.mkdir(dir, { recursive: true });
  }
}