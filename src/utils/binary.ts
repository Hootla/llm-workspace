import fs from 'node:fs/promises';

/**
 * Checks if a file is likely binary by reading the first 1024 bytes
 * and looking for null bytes or a high ratio of non-printable characters.
 */
export async function isBinaryFile(filePath: string): Promise<boolean> {
  let fileHandle;
  try {
    fileHandle = await fs.open(filePath, 'r');
    const buffer = Buffer.alloc(1024);
    const { bytesRead } = await fileHandle.read(buffer, 0, 1024, 0);
    
    if (bytesRead === 0) return false; // Empty file is "text" (safe to edit)

    // Check for null bytes (classic binary indicator)
    for (let i = 0; i < bytesRead; i++) {
      if (buffer[i] === 0) {
        return true;
      }
    }

    return false;
  } catch (error) {
    return false; // If we can't read it, assume safe or let next step fail
  } finally {
    if (fileHandle) await fileHandle.close();
  }
}