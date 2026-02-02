import { zodToJsonSchema } from 'zod-to-json-schema';
import { WorkspaceTool } from './types.js';

export interface AdapterOptions {
  /**
   * If true, enables "Strict Mode" (Structured Outputs).
   * - OpenAI: Sets `strict: true` and ensures `additionalProperties: false`.
   * - Anthropic: Sets `strict: true`.
   * - Gemini: Ensures strict schema compliance.
   * Default: true
   */
  strict?: boolean;
}

/**
 * Helper to ensure JSON Schema meets "Strict Mode" requirements for 2025/2026 LLMs.
 * * STRICT MODE RULES:
 * 1. additionalProperties: false is mandatory.
 * 2. All properties must be required.
 * 3. No "format", "pattern", "minLength", "maxLength", "default" keywords.
 * 4. No "optional" fields (everything must be required, use union with null if needed).
 */
function toStrictSchema(zodSchema: any): any {
  // 1. Generate standard JSON Schema
  const jsonSchema = zodToJsonSchema(zodSchema, {
    target: 'jsonSchema7',
    $refStrategy: 'none', // Inline everything
  }) as any;

  // 2. Clean up top-level artifacts
  delete jsonSchema.$schema;
  delete jsonSchema.definitions;
  delete jsonSchema.default;

  // 3. Recursive sanitizer
  function sanitize(schema: any) {
    if (!schema || typeof schema !== 'object') return schema;

    // --- RULE: Remove Forbidden Keywords ---
    // OpenAI/Anthropic Strict Mode rejects these
    delete schema.format;        // e.g. "uri", "email"
    delete schema.pattern;       // Regex
    delete schema.minLength;
    delete schema.maxLength;
    delete schema.default;       // Defaults not supported in strict schema definition
    delete schema.minItems;
    delete schema.maxItems;
    delete schema.uniqueItems;

    // --- RULE: Enforce Object Strictness ---
    if (schema.type === 'object') {
      schema.additionalProperties = false;
      
      // Strict Mode: All properties must be required
      if (schema.properties) {
        schema.required = Object.keys(schema.properties);
        
        // Recurse into children
        for (const key in schema.properties) {
          sanitize(schema.properties[key]);
        }
      }
    } 
    // --- RULE: Handle Arrays ---
    else if (schema.type === 'array') {
      if (schema.items) {
        sanitize(schema.items);
      }
    }
    // --- RULE: Handle Unions (anyOf) ---
    else if (schema.anyOf) {
      schema.anyOf.forEach((s: any) => sanitize(s));
    }

    return schema;
  }

  return sanitize(jsonSchema);
}

/**
 * Adapter for OpenAI's Chat Completion API.
 * Structure: { type: "function", function: { name, description, parameters, strict } }
 */
export function toOpenAITools(tools: WorkspaceTool[], options: AdapterOptions = { strict: true }) {
  return tools.map((tool) => {
    let parameters;

    if (options.strict) {
      parameters = toStrictSchema(tool.schema);
    } else {
      parameters = zodToJsonSchema(tool.schema) as any;
      delete parameters.$schema;
      delete parameters.additionalProperties;
    }

    return {
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters,
        strict: options.strict, 
      },
    };
  });
}

/**
 * Adapter for Anthropic's Messages API.
 * Structure: { name, description, input_schema }
 */
export function toAnthropicTools(tools: WorkspaceTool[], options: AdapterOptions = { strict: true }) {
  return tools.map((tool) => {
    let input_schema;

    if (options.strict) {
      input_schema = toStrictSchema(tool.schema);
    } else {
      input_schema = zodToJsonSchema(tool.schema) as any;
      delete input_schema.$schema;
      delete input_schema.additionalProperties;
    }

    return {
      name: tool.name,
      description: tool.description,
      input_schema,
      // Anthropic Beta: Strict tooling is implied by the schema structure, 
      // but some client versions accept a top-level strict flag or specific header.
      // We rely on the schema being compliant.
    };
  });
}

/**
 * Adapter for Google Gemini.
 */
export function toGeminiTools(tools: WorkspaceTool[]) {
  return tools.map((tool) => {
    const jsonSchema = zodToJsonSchema(tool.schema) as any;

    delete jsonSchema.$schema;
    delete jsonSchema.additionalProperties;
    
    // Gemini handles 'format' better, but 'default' can still be tricky.
    // We stick to standard loose schema for Gemini unless strict is requested specifically,
    // but typically Gemini prefers less constraints than OpenAI strict mode.
    
    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'OBJECT',
        properties: jsonSchema.properties || {},
        required: jsonSchema.required || [],
      },
    };
  });
}