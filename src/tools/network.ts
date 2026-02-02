import { z } from 'zod';
import { execa } from 'execa';
import { WorkspaceTool } from '../types.js';

export const createNetworkTools = (allowedDomains?: string[]): WorkspaceTool[] => [
  {
    name: 'http_request',
    description: 'Make an HTTP request to an external API or website.',
    schema: z.object({
      url: z.string().url().describe('The full URL to request'),
      method: z.enum(['GET', 'POST', 'PUT', 'DELETE']).default('GET'),
      headers: z.record(z.string()).optional().describe('JSON object of request headers'),
      body: z.string().optional().describe('Request body (for POST/PUT)'),
    }),
    execute: async ({ url, method, headers, body }) => {
      const parsedUrl = new URL(url);

      // Domain Whitelisting
      if (allowedDomains && allowedDomains.length > 0) {
        if (!allowedDomains.includes(parsedUrl.hostname)) {
          throw new Error(`Security Violation: Domain '${parsedUrl.hostname}' is not in the allowed list.`);
        }
      }

      try {
        const response = await fetch(url, {
          method,
          headers: {
            'User-Agent': 'llm-workspace/1.0',
            ...headers,
          },
          body,
        });

        const text = await response.text();
        
        return {
          status: response.status,
          statusText: response.statusText,
          headers: Object.fromEntries(response.headers.entries()),
          body: text
        };
      } catch (error: any) {
        throw new Error(`HTTP Request failed: ${error.message}`);
      }
    },
  },
  {
    name: 'ping_host',
    description: 'Check reachability of a host or IP address using system ping.',
    schema: z.object({
      target: z.string().describe('The hostname or IP to ping (e.g., google.com, 1.1.1.1)'),
    }),
    execute: async ({ target }) => {
      // Basic validation to prevent command injection via target
      if (/[^a-zA-Z0-9.-]/.test(target)) {
        throw new Error("Invalid target format. Only alphanumeric characters, dots, and hyphens allowed.");
      }

      // Determine flags based on OS (Windows uses -n, Unix uses -c)
      const countFlag = process.platform === 'win32' ? '-n' : '-c';
      const args = [countFlag, '2', target]; // Send 2 packets

      try {
        const { stdout } = await execa('ping', args, { timeout: 5000 });
        return {
          reachable: true,
          output: stdout
        };
      } catch (error: any) {
        return {
          reachable: false,
          error: error.message || 'Ping failed'
        };
      }
    },
  },
  {
    name: 'get_my_ip',
    description: 'Get public IP and approximate location data.',
    schema: z.object({}),
    execute: async () => {
      try {
        // Uses a free, reliable IP echo service
        const response = await fetch('https://ipapi.co/json/');
        if (!response.ok) throw new Error('Failed to fetch IP info');
        const data = await response.json();
        return {
          ip: data.ip,
          city: data.city,
          region: data.region,
          country: data.country_name,
          isp: data.org
        };
      } catch (error: any) {
        throw new Error(`Failed to determine location: ${error.message}`);
      }
    }
  }
];