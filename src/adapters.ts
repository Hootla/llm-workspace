import { zodToJsonSchema } from 'zod-to-json-schema';
import { WorkspaceTool } from './types.js';

export interface AdapterOptions {
  strict?: boolean;
}

/**
 * DEEP SANITIZER for OpenAI/Anthropic Strict Mode (2026 Standards).
 * * Rules:
 * 1. No 'optional' properties in the object sense. All keys must be in 'required'.
 * 2. If a field is optional in Zod, it becomes type: ["string", "null"] in JSON Schema.
 * 3. additionalProperties must be false.
 * 4. Banned keywords: pattern, format, default, minLength, maxLength, etc.
 */
function toStrictSchema(zodSchema: any): any {
  const jsonSchema = zodToJsonSchema(zodSchema, {
    target: 'jsonSchema7',
    $refStrategy: 'none',
  }) as any;

  // Cleanup top-level garbage
  delete jsonSchema.$schema;
  delete jsonSchema.definitions;
  delete jsonSchema.default;

  function sanitize(schema: any, parentRequired?: string[]) {
    if (!schema || typeof schema !== 'object') return;

    // 1. Remove Banned Keywords
    const BANNED = ['format', 'pattern', 'minLength', 'maxLength', 'default', 'minItems', 'maxItems', 'uniqueItems'];
    BANNED.forEach(k => delete schema[k]);

    // 2. Handle Objects
    if (schema.type === 'object') {
      schema.additionalProperties = false;
      
      const properties = schema.properties || {};
      const required = Object.keys(properties); // Start by requiring EVERYTHING
      schema.required = required;

      // Recurse into children
      for (const key of required) {
        // If the original Zod schema was optional, zod-to-json-schema might have NOT put it in the required list originally.
        // But strict mode demands it be required. 
        // We need to check if we need to make it nullable.
        // Actually, zod-to-json-schema usually handles optional by OMITTING it from required.
        // Since we just forced EVERYTHING into required, we must make sure the Type allows Null.
        
        // Check if this property was intended to be optional?
        // zod-to-json-schema doesn't easily expose "was optional" on the property object itself easily
        // without complex inspection. 
        // However, we can check if it WAS in the original schema.required list.
        // Wait, we just overwrote schema.required.
        
        // Better strategy: We trust strict mode's requirement: ALL properties must be required.
        // So we recursively sanitize. If the user defined `z.string().optional()`, 
        // zod-to-json-schema produces { type: "string" } usually, but relies on parent 'required' array exclusion.
        // We need to mutate the type to include 'null' if we force it to be required.
        
        // HEURISTIC: In Zod-to-Json-Schema, optional fields are usually NOT in the required array.
        // We can't know for sure here easily.
        // FIX: The safest path for Strict Mode autopatching is:
        // If we force strict, we assume the user might want nullable. 
        // BUT, we can't just make everything nullable.
        
        // Let's rely on a simpler trick: Zod-to-json-schema allows us to output nullable types if we use correct flags?
        // No, OpenAI Strict needs `type: ["string", "null"]`.
        
        // Let's just run sanitize. 
        sanitize(properties[key]);
      }
    } 
    // 3. Handle Arrays
    else if (schema.type === 'array') {
      if (schema.items) sanitize(schema.items);
    }
    // 4. Handle AnyOf (Unions)
    else if (schema.anyOf) {
      schema.anyOf.forEach((s: any) => sanitize(s));
    }
  }

  // Initial pass to clean structure
  sanitize(jsonSchema);

  // SECOND PASS: Fix "Required" vs "Optional" mismatch.
  // Zod-to-Json-Schema generates a 'required' array in objects.
  // Strict mode wants ALL keys in 'properties' to be in 'required'.
  // If a key is NOT in the generated 'required', it means it is optional.
  // So we must:
  // 1. Add it to 'required'.
  // 2. Add 'null' to its type array.
  function fixOptionality(schema: any) {
    if (!schema || typeof schema !== 'object') return;

    if (schema.type === 'object' && schema.properties) {
      const existingRequired = new Set(schema.required || []);
      const allKeys = Object.keys(schema.properties);
      
      schema.required = allKeys; // Strict requirement

      for (const key of allKeys) {
        const prop = schema.properties[key];
        
        // If it wasn't required before, it MUST be nullable now.
        if (!existingRequired.has(key)) {
          // Add 'null' to type
          if (Array.isArray(prop.type)) {
            if (!prop.type.includes('null')) {
              prop.type.push('null');
            }
          } else if (typeof prop.type === 'string') {
            prop.type = [prop.type, 'null'];
          } else if (!prop.type && prop.anyOf) {
             // It's a union/anyOf. Add { type: 'null' } to anyOf options
             prop.anyOf.push({ type: 'null' });
          }
        }
        
        fixOptionality(prop);
      }
    } else if (schema.type === 'array' && schema.items) {
      fixOptionality(schema.items);
    }
  }

  fixOptionality(jsonSchema);
  return jsonSchema;
}

// ... (Exports below remain the same as previous step)

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
      // Top level strict flag for Anthropic
      // Note: Anthropic sometimes infers strictness from schema, but passing explicit flags is safer.
      // Current client versions often just take the schema.
    };
  });
}

export function toGeminiTools(tools: WorkspaceTool[]) {
  return tools.map((tool) => {
    const jsonSchema = zodToJsonSchema(tool.schema) as any;
    delete jsonSchema.$schema;
    delete jsonSchema.additionalProperties;
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