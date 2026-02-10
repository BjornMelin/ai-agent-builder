import "server-only";

import type { JSONSchema7 } from "@ai-sdk/provider";
import { jsonSchema } from "ai";
import type { z } from "zod";

/**
 * Build an AI SDK `jsonSchema(...)` inputSchema with Zod `safeParse` validation.
 *
 * @remarks
 * This keeps tool schemas as JSON Schema for LLM providers while using Zod for
 * runtime validation and typed parsing at the tool boundary.
 *
 * @param schema - JSON Schema payload used by providers.
 * @param validator - Zod validator used at runtime.
 * @returns AI SDK inputSchema with Zod validation.
 */
export function jsonSchemaWithZodValidation<S extends z.ZodTypeAny>(
  schema: JSONSchema7,
  validator: S,
) {
  return jsonSchema<z.output<S>>(schema, {
    validate: (value) => {
      const parsed = validator.safeParse(value);
      return parsed.success
        ? { success: true as const, value: parsed.data }
        : { error: parsed.error, success: false as const };
    },
  });
}
