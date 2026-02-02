import os from 'node:os';
import { z } from 'zod';
import { WorkspaceTool } from '../types.js';

export const createSystemTools = (): WorkspaceTool[] => [
  {
    name: 'get_current_time',
    description: 'Get the current date and time in various formats.',
    schema: z.object({
      timezone: z.string().optional().describe('IANA time zone identifier (e.g., "America/New_York"). Defaults to system time.'),
    }),
    execute: async ({ timezone }) => {
      const now = new Date();
      const options: Intl.DateTimeFormatOptions = {
        timeZone: timezone,
        dateStyle: 'full',
        timeStyle: 'long',
      };
      
      try {
        return {
          iso: now.toISOString(),
          localeString: now.toLocaleString(undefined, options),
          timestamp: now.getTime(),
          timezone: timezone || Intl.DateTimeFormat().resolvedOptions().timeZone,
          utc: now.toUTCString(),
        };
      } catch (error: any) {
        throw new Error(`Invalid timezone or date error: ${error.message}`);
      }
    },
  },
  {
    name: 'get_system_info',
    description: 'Get information about the operating system and hardware.',
    schema: z.object({}), // No input needed
    execute: async () => {
      return {
        platform: os.platform(),
        release: os.release(),
        arch: os.arch(),
        cpus: os.cpus().length,
        totalMemory: os.totalmem(),
        freeMemory: os.freemem(),
        hostname: os.hostname(),
        homedir: os.homedir(),
        nodeVersion: process.version,
      };
    },
  },
];