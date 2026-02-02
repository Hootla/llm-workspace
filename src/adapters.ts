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
 * Helper to ensure JSON Schema meets "Strict Mode" requirements.
 * OpenAI/Anthropic strict mode requires:
 * 1. all properties to be required.
 * 2. additionalProperties: false.
 */
function toStrictSchema(zodSchema: any): any {
  const jsonSchema = zodToJsonSchema(zodSchema, {
    target: 'jsonSchema7', // Standard target
    $refStrategy: 'none',  // Inline everything (critical for LLMs)
  }) as any;

  // Cleanup top-level stuff
  delete jsonSchema.$schema;
  delete jsonSchema.definitions;
  delete jsonSchema.default;

  // Recursive function to enforce strictness
  function enforceStrict(schema: any) {
    if (schema.type === 'object') {
      schema.additionalProperties = false;
      
      // Ensure 'required' lists ALL properties
      if (schema.properties) {
        schema.required = Object.keys(schema.properties);
        
        // Recurse into properties
        for (const key in schema.properties) {
          enforceStrict(schema.properties[key]);
        }
      }
    } else if (schema.type === 'array') {
      if (schema.items) {
        enforceStrict(schema.items);
      }
    }
    return schema;
  }

  return enforceStrict(jsonSchema);
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
        strict: options.strict, // 2026 Standard
      },
    };
  });
}

/**
 * Adapter for Anthropic's Messages API.
 * Structure: { name, description, input_schema, strict }
 */
export function toAnthropicTools(tools: WorkspaceTool[], options: AdapterOptions = { strict: true }) {
  return tools.map((tool) => {
    // Anthropic is strict-compatible but uses top-level flag
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
      strict: options.strict, // Top-level flag for Claude 3.5/3.7+
    };
  });
}

/**
 * Adapter for Google Gemini (Vertex AI / AI Studio).
 * Structure: { name, description, parameters }
 * Gemini doesn't use a "strict" flag inside the tool definition, 
 * but it strongly prefers standard OpenAPI schema.
 */
export function toGeminiTools(tools: WorkspaceTool[]) {
  return tools.map((tool) => {
    const jsonSchema = zodToJsonSchema(tool.schema) as any;

    delete jsonSchema.$schema;
    delete jsonSchema.additionalProperties;

    return {
      name: tool.name,
      description: tool.description,
      parameters: {
        type: 'OBJECT', // Gemini prefers upper case type for the root
        properties: jsonSchema.properties || {},
        required: jsonSchema.required || [],
      },
    };
  });
}